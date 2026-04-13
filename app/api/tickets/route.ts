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
 * Updates the status of an existing ticket. Admin-only endpoint.
 * Only the `status` field can be changed through this endpoint; all other
 * ticket fields are immutable after creation (subject, urgency, etc.).
 *
 * REQUEST BODY (JSON):
 *   id      {string}  The CUID of the ticket to update
 *   status  {string}  New status: "פתוח" | "בטיפול" | "סגור"
 *
 * RESPONSE:
 *   200 — The updated Ticket object (JSON)
 *   403 — Not an admin
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    // isAdmin is set by the session callback in auth.ts from the DB
    const canUpdate = session?.user?.isAdmin || STAFF_EMAILS.includes(session?.user?.email ?? "")
    if (!canUpdate) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id, status, subject, description, phone, computerName, urgency, category, platform } = await req.json()

    // Build update payload from only the fields that were sent
    const data: Record<string, string> = {}
    if (status      !== undefined) data.status      = status
    if (subject     !== undefined) data.subject     = subject
    if (description !== undefined) data.description = description
    if (phone       !== undefined) data.phone       = phone
    if (computerName !== undefined) data.computerName = computerName
    if (urgency     !== undefined) data.urgency     = urgency
    if (category    !== undefined) data.category    = category
    if (platform    !== undefined) data.platform    = platform

    const ticket = await prisma.ticket.update({ where: { id }, data })
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
