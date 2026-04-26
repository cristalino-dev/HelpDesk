/**
 * app/api/tickets/route.ts — Ticket CRUD API
 *
 * ENDPOINTS:
 * ───────────
 *   POST   /api/tickets   — Create a new ticket (authenticated users)
 *   PATCH  /api/tickets   — Update a ticket's status (admins only)
 *   GET    /api/tickets   — Fetch tickets (own tickets for users; all for admins)
 *
 * AUTHORIZATION MODEL:
 * ─────────────────────
 *   Regular users:  POST (create own tickets) + GET (own tickets only)
 *   Admins:         POST + GET (all tickets, with user info) + PATCH (change status)
 *
 * ERROR HANDLING:
 * ────────────────
 * All three handlers wrap their logic in try/catch. Caught exceptions are
 * written to the Log table via logError() and a generic 500 is returned.
 * This ensures database errors, Prisma validation errors, and unexpected
 * exceptions all leave a trace in the admin logs tab.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { sendMail, mailTicketOpenedStaff, mailTicketOpenedUser, mailTicketUpdatedStaff, mailTicketStatusUser, mailTicketClosedWithReview } from "@/lib/mail"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/tickets
 *
 * Creates a new support ticket in the database and associates it with the
 * currently authenticated user. The user's database ID is resolved by looking
 * up their email address (which is the foreign key we have from Google OAuth).
 *
 * REQUEST BODY (JSON):
 *   subject      {string}  Short description of the problem
 *   description  {string}  Full details
 *   phone        {string}  Employee contact number
 *   computerName {string}  Affected machine hostname
 *   urgency      {string}  "נמוך" | "בינוני" | "גבוה" | "דחוף"
 *   category     {string}  "חומרה" | "תוכנה" | "רשת" | "מדפסת" | "אחר"
 *
 * RESPONSE:
 *   201 — The created Ticket object (JSON)
 *   401 — Not authenticated
 *   404 — Authenticated but user row not found in DB (edge case)
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { subject, description, phone, computerName, urgency, category, platform } = await req.json()

    // Resolve the user's DB row — needed for the userId foreign key.
    // We use email (from Google OAuth) as the lookup key.
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        phone,
        computerName,
        urgency,
        category,
        platform,
        userId: user.id,
        // status defaults to "פתוח" (see schema), createdAt/updatedAt are automatic
      },
    })

    // Write creation history entry
    void prisma.ticketHistory.create({
      data: {
        ticketId:   ticket.id,
        field:      "created",
        newValue:   "פתוח",
        actorName:  session.user.name ?? session.user.email!,
        actorEmail: session.user.email!,
      },
    })

    // Send emails (non-blocking — don't await sequentially in the request)
    const ticketInfo = {
      id: ticket.id, ticketNumber: ticket.ticketNumber,
      subject, description, urgency, category,
      platform, phone, computerName, status: ticket.status,
      submitterName: session.user.name ?? session.user.email!,
      submitterEmail: session.user.email!,
    }
    void Promise.all([
      sendMail({ to: STAFF_EMAILS, subject: `פנייה חדשה: ${subject}`, html: mailTicketOpenedStaff(ticketInfo) }),
      sendMail({ to: session.user.email!, subject: "פנייתך התקבלה", html: mailTicketOpenedUser(ticketInfo) }),
    ])

    return NextResponse.json(ticket)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/tickets
 *
 * Updates fields of an existing ticket.
 *
 * REQUEST BODY (JSON):
 *   id      {string}  The CUID of the ticket to update
 *   status  {string}  New status: "פתוח" | "בטיפול" | "סגור"
 *   …other fields (staff only): subject, description, phone, computerName,
 *                               urgency, category, platform, assignedTo
 *
 * AUTHORIZATION:
 *   Staff / admin — may set any status, edit any field, reassign.
 *   Regular user  — may close their own ticket at any time.
 *                   May re-open their own ticket within 4 weeks of closure.
 *                   Cannot change any other status or ticket owned by someone else.
 *
 * RESPONSE:
 *   200 — The updated Ticket object (JSON)
 *   403 — Forbidden (wrong owner, invalid transition, or reopen window expired)
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email ?? "")
    const { id, status, subject, description, phone, computerName, urgency, category, platform, assignedTo } = await req.json()

    // Fetch ticket first so we can check ownership for non-staff
    const before = await prisma.ticket.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // 4-week window during which the ticket owner may re-open a closed ticket
    const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000

    if (!isStaff) {
      const isOwner = before.user?.email === session.user.email
      if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

      if (status === "סגור") {
        // Closing own ticket — always allowed.
      } else if (status === "פתוח" && before.status === "סגור") {
        // Re-opening own ticket — allowed only within 4 weeks of closure.
        const msSinceClosed = Date.now() - new Date(before.updatedAt).getTime()
        if (msSinceClosed > FOUR_WEEKS_MS) {
          return NextResponse.json({ error: "Reopen window expired" }, { status: 403 })
        }
      } else {
        // Any other transition (e.g. setting to "בטיפול") is staff-only.
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Build update payload from only the fields that were sent
    const data: Record<string, string> = {}
    if (status       !== undefined) data.status       = status
    if (isStaff) {
      if (subject      !== undefined) data.subject      = subject
      if (description  !== undefined) data.description  = description
      if (phone        !== undefined) data.phone        = phone
      if (computerName !== undefined) data.computerName = computerName
      if (urgency      !== undefined) data.urgency      = urgency
      if (category     !== undefined) data.category     = category
      if (platform     !== undefined) data.platform     = platform
      if (assignedTo   !== undefined) data.assignedTo   = assignedTo
    }

    const ticket = await prisma.ticket.update({ where: { id }, data })

    // Write history entries for each changed field
    const actorName  = session.user.name ?? session.user.email ?? "צוות"
    const actorEmail = session.user.email ?? ""
    type HistoryRow = { ticketId: string; field: string; oldValue?: string | null; newValue?: string | null; actorName: string; actorEmail: string }
    const historyEntries: HistoryRow[] = []

    if (status !== undefined && status !== before.status) {
      historyEntries.push({ ticketId: id, field: "status", oldValue: before.status, newValue: status, actorName, actorEmail })
    }
    if (isStaff) {
      if (urgency    !== undefined && urgency    !== before.urgency)    historyEntries.push({ ticketId: id, field: "urgency",    oldValue: before.urgency,    newValue: urgency,    actorName, actorEmail })
      if (assignedTo !== undefined && assignedTo !== before.assignedTo) historyEntries.push({ ticketId: id, field: "assignedTo", oldValue: before.assignedTo, newValue: assignedTo, actorName, actorEmail })
      // Generic "edited" entry for text-field changes (subject, description, phone, computerName, category, platform)
      const beforeFields: Record<string, string | null> = {
        subject: before.subject, description: before.description,
        phone: before.phone, computerName: before.computerName,
        category: before.category, platform: before.platform,
      }
      const newFields: Record<string, string | undefined> = { subject, description, phone, computerName, category, platform }
      const edited = Object.keys(beforeFields).some(f => newFields[f] !== undefined && newFields[f] !== beforeFields[f])
      if (edited) historyEntries.push({ ticketId: id, field: "edited", actorName, actorEmail })
    }

    if (historyEntries.length > 0) {
      void prisma.ticketHistory.createMany({ data: historyEntries })
    }

    // Send email notifications (non-blocking)
    const ticketInfo = {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject:      ticket.subject,
      description:  ticket.description,
      urgency:      ticket.urgency,
      category:     ticket.category,
      platform:     ticket.platform,
      phone:        ticket.phone,
      computerName: ticket.computerName,
      status:       ticket.status,
      submitterName:  before.user?.name ?? before.user?.email ?? "משתמש",
      submitterEmail: before.user?.email ?? "",
    }
    const changedBy = session.user.name ?? session.user.email ?? "צוות תמיכה"
    // Exclude the person who made the change — no need to email yourself about your own action
    const staffRecipients = STAFF_EMAILS.filter(e => e !== session.user.email)
    const mails: Promise<void>[] = []
    if (staffRecipients.length > 0) {
      mails.push(sendMail({ to: staffRecipients, subject: `עדכון פנייה: ${ticket.subject}`, html: mailTicketUpdatedStaff(ticketInfo, changedBy) }))
    }
    // Notify user on status change
    if (status === "סגור" && before.user?.email) {
      // Closure: always send the review-request email, even if the user closed it themselves
      mails.push(sendMail({ to: before.user.email, subject: `פנייתך HDTC-${ticket.ticketNumber} נסגרה — ספרו לנו כיצד היה השירות`, html: mailTicketClosedWithReview(ticketInfo) }))
    } else if (status === "בטיפול" && before.user?.email && before.user.email !== session.user.email) {
      // In-progress: only notify if a staff member (not the user) changed the status
      mails.push(sendMail({ to: before.user.email, subject: `עדכון על פנייתך – בטיפול`, html: mailTicketStatusUser(ticketInfo) }))
    } else if (status === "פתוח" && before.status === "סגור" && before.user?.email && before.user.email !== session.user.email) {
      // Staff-initiated re-open: notify the ticket owner
      mails.push(sendMail({ to: before.user.email, subject: `פנייתך HDTC-${ticket.ticketNumber} נפתחה מחדש`, html: mailTicketStatusUser(ticketInfo) }))
    }
    void Promise.all(mails)

    return NextResponse.json(ticket)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * GET /api/tickets
 *
 * Returns tickets scoped to the requesting user's role:
 *
 *   Regular user — returns only tickets where userId == their own DB id.
 *                  Sorted by createdAt DESC (newest first).
 *
 *   Admin        — returns ALL tickets, including a nested `user` object
 *                  with the submitter's name and email. The admin page then
 *                  sorts client-side by urgency rank + FIFO within each rank.
 *
 * RESPONSE:
 *   200 — Array of Ticket (users) or TicketWithUser (admins) objects
 *   401 — Not authenticated
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isAdmin = session.user.isAdmin

    if (isAdmin) {
      // Admin gets all tickets with user info for the queue display.
      // Client-side sorting: urgency rank (דחוף=0 → נמוך=3) then createdAt ASC.
      const tickets = await prisma.ticket.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
        },
      })
      return NextResponse.json(tickets)
    }

    // Regular user: resolve their DB id from the session email, then filter.
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json([]) // Edge case: authenticated but not in DB yet

    const tickets = await prisma.ticket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(tickets)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
