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
import { getStaffEmails } from "@/lib/staffMembers"
import { sendMail, mailTicketOpenedStaff, mailTicketOpenedUser, mailTicketUpdatedStaff, mailTicketStatusUser, mailTicketClosedWithReview } from "@/lib/mail"
import { NextRequest, NextResponse } from "next/server"
import { normalizeSelection, NEW_EMPLOYEE_CATEGORY } from "@/lib/equipment"
import { normalizeNewEmployee, missingFieldLabels, withNewEmployeeDetails } from "@/lib/newEmployee"
import { isOffboarding, offboardingChecklist, offboardingBlockers, blockerMessage } from "@/lib/offboarding"
import { findUserByEmail, resolveUserByEmail } from "@/lib/users"

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
 *   onBehalfOfEmail {string}  ADMIN ONLY — open the ticket in this person's name
 *   onBehalfOfName  {string}  Display name, used only when onBehalfOfEmail is
 *                             an address that has no User row yet
 *   equipment    {array}   Requested items — [{ label, quantity }], any category
 *   newEmployee  {object}  { firstName, lastName, phone, jobTitle } — REQUIRED
 *                          when category is "עובד חדש", rejected with 400 if a
 *                          field is blank. Appended to the description as a
 *                          labelled block; see lib/newEmployee.ts
 *
 * ON-BEHALF-OF (admin only):
 * ───────────────────────────
 * Admins may file a ticket for an employee who phoned or walked in. The target
 * address is upserted, so someone who has never signed in can still own a
 * ticket — the row is waiting for them when they first log in with Google.
 * The ticket OWNER becomes the target; the history actor stays the admin who
 * actually clicked, and an internal note records the hand-off. Non-admins
 * sending onBehalfOfEmail are rejected with 403.
 *
 * RESPONSE:
 *   201 — The created Ticket object (JSON)
 *   400 — Onboarding ticket missing a mandatory new-employee field
 *   401 — Not authenticated
 *   403 — Non-admin tried to open a ticket in someone else's name
 *   404 — Authenticated but user row not found in DB (edge case)
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { subject, description, phone, computerName, urgency, category, platform,
            onBehalfOfEmail, onBehalfOfName, equipment, newEmployee } = await req.json()

    // NEW-EMPLOYEE DETAILS — an onboarding ticket is an account-creation request
    // and is unworkable without the hire's name, phone and role, so the four
    // fields are mandatory here and not only in the browser. They are folded
    // into the description, which is what every notification email carries.
    let ticketDescription = description
    if (category === NEW_EMPLOYEE_CATEGORY) {
      const details = normalizeNewEmployee(newEmployee)
      const missing = missingFieldLabels(details)
      if (missing.length > 0) {
        return NextResponse.json({ error: "Missing new employee details", missing }, { status: 400 })
      }
      ticketDescription = withNewEmployeeDetails(description ?? "", details)
    }

    // Resolve the signed-in user's DB row — needed for the userId foreign key.
    // We use email (from Google OAuth) as the lookup key.
    const actor = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!actor) return NextResponse.json({ error: "User not found" }, { status: 404 })

    // ON-BEHALF-OF — resolve who the ticket actually belongs to. Selecting
    // yourself in the picker is the same as not using it at all.
    const behalfEmail = typeof onBehalfOfEmail === "string" ? onBehalfOfEmail.trim().toLowerCase() : ""
    const onBehalf = behalfEmail !== "" && behalfEmail !== actor.email.toLowerCase()
    if (onBehalf && !session.user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // resolveUserByEmail (not a bare upsert) so an admin can open a ticket for
    // a new hire who has not signed in yet, WITHOUT minting a second row for
    // somebody already registered under a differently-cased address — the
    // upsert this replaced matched `behalfEmail` exactly, and `auth.ts` stores
    // whatever Google sent. See lib/users.ts.
    const owner = onBehalf
      ? await resolveUserByEmail(behalfEmail, typeof onBehalfOfName === "string" ? onBehalfOfName : null)
      : actor

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description: ticketDescription,
        phone,
        computerName,
        urgency,
        category,
        platform,
        userId: owner.id,
        // status defaults to "פתוח" (see schema), createdAt/updatedAt are automatic
      },
    })

    // EQUIPMENT REQUEST — allowed on ANY ticket. A new hire needs a whole kit
    // and an existing employee may just want a second screen; both end up on
    // the same supplier order. Items are validated against the live option list
    // so a hand-crafted request cannot invent equipment.
    //
    // OFFBOARDING is the exception: the checklist is not a selection at all.
    // A "סגירת משתמש" ticket is born with EVERY item on the gear list, accounts
    // included, and the server builds that list itself rather than trusting the
    // form — a checklist that can arrive short is not a checklist.
    //
    // The option lookup is skipped entirely for the common case of an ordinary
    // ticket that asks for no equipment at all.
    const offboarding = isOffboarding(category)
    if (offboarding || (Array.isArray(equipment) && equipment.length > 0)) {
      const equipmentAllowed = await prisma.fieldOption.findMany({ where: { field: "equipment" }, select: { label: true } })
      const allowedLabels = equipmentAllowed.map(o => o.label)
      const equipmentLines = offboarding
        ? offboardingChecklist(allowedLabels)
        : normalizeSelection(equipment, allowedLabels)
      if (equipmentLines.length > 0) {
        await prisma.ticketEquipment.createMany({
          data: equipmentLines.map(l => ({ ticketId: ticket.id, label: l.label, quantity: l.quantity })),
          skipDuplicates: true,
        })
      }
    }

    // Write creation history entry. The actor is always the person who clicked —
    // for an on-behalf ticket that is the admin, not the owner, so the audit
    // trail shows who really filed it.
    void prisma.ticketHistory.create({
      data: {
        ticketId:   ticket.id,
        field:      "created",
        newValue:   "פתוח",
        actorName:  session.user.name ?? session.user.email!,
        actorEmail: session.user.email!,
      },
    })

    // Staff-only note making the hand-off explicit on the ticket itself
    if (onBehalf) {
      void prisma.ticketNote.create({
        data: {
          ticketId:    ticket.id,
          content:     `הפנייה נפתחה בשם ${owner.name ?? owner.email} על ידי ${session.user.name ?? session.user.email!}`,
          authorName:  session.user.name ?? session.user.email!,
          authorEmail: session.user.email!,
        },
      })
    }

    // Send emails (non-blocking — don't await sequentially in the request).
    // The submitter shown to staff, and the confirmation recipient, are the
    // ticket OWNER — not the admin who filed it on their behalf.
    const ticketInfo = {
      id: ticket.id, ticketNumber: ticket.ticketNumber,
      subject, description: ticketDescription, urgency, category,
      platform, phone, computerName, status: ticket.status,
      submitterName: owner.name ?? owner.email,
      submitterEmail: owner.email,
    }
    const staffEmails = await getStaffEmails()
    void Promise.all([
      // The ticket number leads the subject so the queue is scannable from the
      // inbox list without opening anything.
      sendMail({ to: staffEmails, subject: `פנייה חדשה HDTC-${ticket.ticketNumber}: ${subject}`, html: mailTicketOpenedStaff(ticketInfo) }),
      sendMail({ to: owner.email, subject: `פנייתך התקבלה — HDTC-${ticket.ticketNumber}`, html: mailTicketOpenedUser(ticketInfo) }),
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
 *   ownerEmail {string}  ADMIN ONLY — move the ticket to this registered
 *                        user's name (the מגיש). Must already exist; unlike
 *                        POST's onBehalfOfEmail it does not create a user.
 *                        Sending the current owner's address is a no-op.
 *
 * AUTHORIZATION:
 *   Admin         — everything below, plus ownerEmail.
 *   Staff         — may set any status, edit any field, reassign. Not ownerEmail.
 *   Regular user  — may close their own ticket at any time.
 *                   May re-open their own ticket within 4 weeks of closure.
 *                   Cannot change any other status or ticket owned by someone else.
 *
 * RESPONSE:
 *   200 — The updated Ticket object (JSON)
 *   400 — Offboarding ticket closed with items still unticked (`blockers`),
 *         or ownerEmail naming somebody who is not a registered user
 *   403 — Forbidden (wrong owner, invalid transition, reopen window expired,
 *         or a non-admin sending ownerEmail)
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email ?? "")
    const { id, status, holdReason, subject, description, phone, computerName, urgency, category, platform, assignedTo, ownerEmail } = await req.json()

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

    // OFFBOARDING CLOSE GUARD — a leaving-employee ticket is the record that
    // the gear came back and the accounts were dealt with, so closure is the
    // one moment where the checklist has any leverage. Applies to everyone,
    // staff included: the disabled button in the UI is a courtesy, this is the
    // rule. Only this one category is ever blocked.
    if (status === "סגור" && isOffboarding(before.category)) {
      const lines = await prisma.ticketEquipment.findMany({
        where:  { ticketId: before.id },
        select: { label: true, quantity: true, receivedQty: true },
      })
      const blockers = offboardingBlockers(lines)
      if (blockers.length > 0) {
        return NextResponse.json(
          { error: blockerMessage(blockers), blockers },
          { status: 400 },
        )
      }
    }

    // OWNER REASSIGNMENT — ADMIN ONLY.
    // A ticket filed against the wrong person is filed against the wrong
    // dashboard: the owner is who sees it under "הפניות שלי", who gets the
    // status mail and who is asked to rate the service. Moving it is therefore
    // the same privilege as opening one in someone else's name (POST's
    // onBehalfOfEmail), and is gated the same way — isAdmin, not isStaff.
    //
    // The new owner must already be a registered user. POST upserts because
    // opening a ticket for a brand-new hire is a real case; correcting an
    // existing ticket is not — the picker offers the roster, so an email that
    // is not on it is a mistake, and silently creating a user from it would
    // hide that.
    let newOwner: { id: string; name: string | null; email: string } | null = null
    const wantedOwner = typeof ownerEmail === "string" ? ownerEmail.trim().toLowerCase() : ""
    if (wantedOwner !== "" && wantedOwner !== (before.user?.email ?? "").toLowerCase()) {
      if (!session.user.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      // Case-insensitive: `auth.ts` stores whatever Google returned verbatim,
      // so a row can carry capitals and an exact match would answer "not
      // registered" about somebody who plainly is. No create — the picker
      // offers the roster, so an address off it is a mistake, not a new hire.
      newOwner = await findUserByEmail(wantedOwner)
      if (!newOwner) {
        return NextResponse.json({ error: "המשתמש המבוקש אינו רשום במערכת" }, { status: 400 })
      }
    }

    // Build update payload from only the fields that were sent
    const data: Record<string, string | null> = {}
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
    if (newOwner) data.userId = newOwner.id
    // ON-HOLD — staff may place a ticket on hold with a mandatory reason.
    if (isStaff && status === "בהמתנה") {
      data.holdReason = holdReason?.trim() || null
    }
    // REINSTATE — leaving "בהמתנה" clears the hold reason automatically.
    if (status !== undefined && status !== "בהמתנה" && before.status === "בהמתנה") {
      data.holdReason = null
    }
    // COMPOUND CLOSE — single source of truth for ticket closure.
    // Any PATCH with status → "סגור" (any role) also downgrades urgency to
    // "נמוך". Keeps the queue sorted and prevents stale high-urgency from
    // appearing on closed tickets. Client code must not duplicate this logic;
    // see lib/ticketApi.ts closeTicket() for the canonical client-side call.
    if (status === "סגור") data.urgency = "נמוך"

    // AUTO-INPROGRESS — when staff assigns a ticket to themselves and the
    // ticket is currently פתוח, automatically move it to בטיפול so the
    // queue reflects that someone is actively working on it.
    if (isStaff && assignedTo !== undefined && assignedTo === session.user.email && before.status === "פתוח" && status === undefined) {
      data.status = "בטיפול"
    }

    // Built BEFORE the update so both can be committed together. A ticket's
    // closing date does not live on the ticket — it is derived from the
    // history row written here — so a status change that lands without its row
    // is a ticket that is closed with no closing date, permanently and
    // silently. See scripts/audit-close-dates.mjs.
    const actorName  = session.user.name ?? session.user.email ?? "צוות"
    const actorEmail = session.user.email ?? ""
    type HistoryRow = { ticketId: string; field: string; oldValue?: string | null; newValue?: string | null; actorName: string; actorEmail: string }
    const historyEntries: HistoryRow[] = []

    // Use data.status (not raw status) so auto-changes (e.g. auto-בטיפול on self-assign) are also recorded
    if (data.status !== undefined && data.status !== before.status) {
      // For hold, embed the reason in newValue so history is self-explaining
      const newVal = data.status === "בהמתנה" && data.holdReason
        ? `בהמתנה: ${data.holdReason}`
        : data.status
      historyEntries.push({ ticketId: id, field: "status", oldValue: before.status, newValue: newVal, actorName, actorEmail })
    }
    // Urgency history: covers both auto-downgrade on close and explicit staff edits
    const effectiveUrgency = data.urgency
    if (effectiveUrgency !== undefined && effectiveUrgency !== before.urgency) {
      historyEntries.push({ ticketId: id, field: "urgency", oldValue: before.urgency ?? null, newValue: effectiveUrgency, actorName, actorEmail })
    }
    if (isStaff) {
      if (assignedTo !== undefined && assignedTo !== before.assignedTo) historyEntries.push({ ticketId: id, field: "assignedTo", oldValue: before.assignedTo, newValue: assignedTo, actorName, actorEmail })
    }
    // Owner moves are recorded by display name, not id — the history is read by
    // people, and "מי פתח את זה" is exactly the question this row answers.
    if (newOwner) {
      historyEntries.push({
        ticketId: id, field: "owner",
        oldValue: before.user?.name ?? before.user?.email ?? null,
        newValue: newOwner.name ?? newOwner.email,
        actorName, actorEmail,
      })
    }
    if (isStaff) {
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


    // One transaction: the status and the row that records it, or neither.
    // These used to be two round trips, and anything interrupting the process
    // between them — a deploy, a restart, a dropped connection — persisted the
    // closure and lost its record.
    const [ticket] = await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data }),
      ...(historyEntries.length > 0
        ? [prisma.ticketHistory.createMany({ data: historyEntries })]
        : []),
    ])


    // Every user-facing mail below is addressed to the ticket's owner. After a
    // reassignment that is the *new* owner: the person who now has the ticket
    // on their dashboard is the person the update concerns. `before.user` is
    // kept for the history row above, which is about who it used to be.
    const owner = newOwner ?? before.user

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
      submitterName:  owner?.name ?? owner?.email ?? "משתמש",
      submitterEmail: owner?.email ?? "",
    }
    const changedBy = session.user.name ?? session.user.email ?? "צוות תמיכה"
    // STATUS CHANGES are personal, not broadcast: the staff-update email goes
    // only to the assigned staff member (the ticket owner gets their own
    // dedicated email below — closure/review, בטיפול, or re-open). Other
    // updates (field edits, reassignment) still notify all staff.
    const statusChanged = data.status !== undefined && data.status !== before.status
    const staffRecipients = (statusChanged ? [ticket.assignedTo].filter(Boolean) : await getStaffEmails())
      // Exclude the person who made the change — no need to email yourself about your own action
      .filter(e => e !== session.user.email)
    const mails: Promise<void>[] = []
    if (staffRecipients.length > 0) {
      mails.push(sendMail({ to: staffRecipients, subject: `עדכון פנייה: ${ticket.subject}`, html: mailTicketUpdatedStaff(ticketInfo, changedBy) }))
    }
    // Notify user on status change
    // Use data.status so auto-changes (e.g. auto-בטיפול on self-assign) also trigger notifications
    if (data.status === "סגור" && owner?.email) {
      // Closure: always send the review-request email, even if the user closed it themselves
      mails.push(sendMail({ to: owner.email, subject: `פנייתך HDTC-${ticket.ticketNumber} נסגרה — ספרו לנו כיצד היה השירות`, html: mailTicketClosedWithReview(ticketInfo) }))
    } else if (data.status === "בטיפול" && owner?.email && owner.email !== session.user.email) {
      // In-progress: only notify if a staff member (not the user) changed the status
      mails.push(sendMail({ to: owner.email, subject: `עדכון על פנייתך – בטיפול`, html: mailTicketStatusUser(ticketInfo) }))
    } else if (data.status === "פתוח" && before.status === "סגור" && owner?.email && owner.email !== session.user.email) {
      // Staff-initiated re-open: notify the ticket owner
      mails.push(sendMail({ to: owner.email, subject: `פנייתך HDTC-${ticket.ticketNumber} נפתחה מחדש`, html: mailTicketStatusUser(ticketInfo) }))
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
 * GET /api/tickets — the caller's OWN tickets. Everyone, admins included.
 *
 * This used to branch on isAdmin and return the entire table to an admin,
 * which made /dashboard — the page called "לוח אישי" — show every ticket in
 * the system to the one group of people it was least personal for. It was
 * indistinguishable from the queue, just drawn as cards instead of rows.
 *
 * The whole queue still exists and is unchanged: GET /api/tickets/all serves
 * it to admins, STAFF_EMAILS and VIEWER_EMAILS, with the identical orderBy and
 * `user` include this branch used to have. Anything that wants everyone's
 * tickets asks that endpoint; this one answers "mine".
 *
 * RESPONSE:
 *   200 — Array of Ticket, newest first
 *   401 — Not authenticated
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Through lib/users.ts, never a bare findUnique: an address from outside
    // may carry capitals that the stored row does not, and a miss here would
    // silently show someone an empty dashboard rather than their tickets.
    const user = await findUserByEmail(session.user.email)
    if (!user) return NextResponse.json([]) // Authenticated but not in the DB yet

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
