/**
 * app/api/tickets/assigned/route.ts — the tickets a staff member is handling.
 *
 * WHY THIS EXISTS
 * ───────────────
 * v3.72 made GET /api/tickets answer "mine" — tickets the caller OPENED. That
 * was right for "הפניות שלי", and it quietly dropped the other half of what a
 * personal board is for someone who does support: the tickets ASSIGNED to
 * them. Before v3.72 an admin saw those on /dashboard only because they saw
 * every ticket; removing the flood removed the signal with it. Found in
 * production (v3.81): 22 open tickets assigned to one admin, and his dashboard
 * showed none of them.
 *
 * WHY IT IS NOT FOLDED INTO /api/tickets
 * ──────────────────────────────────────
 * It is a different list that takes different actions. On the dashboard the
 * close and reopen buttons are the OWNER's, and the stat cards count the
 * caller's own requests — neither is right for a ticket you are handling, which
 * is worked from its own page, as staff. Keeping the two apart also leaves
 * /api/tickets with its v3.72 guarantee intact: every call is scoped by owner.
 *
 * WHO: staff — isAdmin OR STAFF_EMAILS (rule 26). Not viewers: nobody assigns
 * work to a read-only observer. Everyone else gets 403 rather than an empty
 * list, because an empty list would say "nothing assigned" when the truth is
 * "this is not yours to ask".
 *
 * WHAT: assignedTo = the caller, case-insensitively, and not closed. Closed
 * work is history and the queue at /tickets has it; a personal board of
 * everything ever assigned would grow without bound. The owner is included so
 * each card can say whose ticket it is.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const email = session.user.email

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const tickets = await prisma.ticket.findMany({
      where: {
        // assignedTo is a plain string, not a relation, so lib/users.ts has no
        // part in it — but the same rule applies: never match an address
        // exactly (rule 45).
        assignedTo: { equals: email, mode: "insensitive" },
        status: { not: "סגור" },
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    })

    return NextResponse.json(tickets)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/assigned GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
