/**
 * app/api/admin/reports/route.ts — the data behind /admin/reports
 *
 * GET /api/admin/reports → { tickets: ReportTicket[], generatedAt: string }
 *
 * Admin-only. Returns one flat row per ticket — opened date, resolved close
 * date, and the four dimensions the report breaks down by.
 *
 * ── WHY THE WHOLE HISTORY, NOT A RANGE ────────────────────────────────────
 * The page lets the reader drag the range and flip day/week/month, and every
 * one of those is instant because the arithmetic happens in the browser against
 * this one payload (lib/reports.ts is pure and runs on both sides). Slicing
 * server-side would put a network round trip on every interaction, and the
 * backlog line needs everything *before* the window anyway to start at the
 * right height — a range query would have to fetch most of this regardless.
 *
 * The cost is payload size: roughly 150 bytes per ticket, so a few thousand
 * tickets is a few hundred KB, once per page load. If this system ever reaches
 * tens of thousands of tickets, move the aggregation server-side — the pure
 * functions in lib/reports.ts run there unchanged.
 *
 * ── RESOLVING closedAt ────────────────────────────────────────────────────
 * `Ticket` has no closedAt column; a closure is a TicketHistory row with
 * field "status" and newValue "סגור". A reopened ticket has several. We take
 * the LATEST such row, and only for tickets currently closed, so that
 * opened − closed equals the number actually open. See lib/reports.ts.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { CLOSED, type ReportTicket } from "@/lib/reports"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const [tickets, closeRows] = await Promise.all([
      prisma.ticket.findMany({
        select: {
          id: true, ticketNumber: true, createdAt: true,
          category: true, urgency: true, platform: true, status: true, assignedTo: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      // Ascending, so the last row written for a ticket is the one that wins
      // the map below — that is the "most recent close" rule.
      prisma.ticketHistory.findMany({
        where: { field: "status", newValue: CLOSED },
        select: { ticketId: true, changedAt: true },
        orderBy: { changedAt: "asc" },
      }),
    ])

    const lastClose = new Map<string, Date>()
    for (const row of closeRows) lastClose.set(row.ticketId, row.changedAt)

    const rows: ReportTicket[] = tickets.map(t => ({
      ticketNumber: t.ticketNumber,
      createdAt: t.createdAt.toISOString(),
      // Only a ticket that is closed *now* carries a close date. One that was
      // closed and reopened is open again, and counting its old closure would
      // push the backlog below the true figure.
      closedAt: t.status === CLOSED ? (lastClose.get(t.id)?.toISOString() ?? null) : null,
      category: t.category,
      urgency: t.urgency,
      platform: t.platform,
      status: t.status,
      assignedTo: t.assignedTo,
    }))

    return NextResponse.json({ tickets: rows, generatedAt: new Date().toISOString() })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/reports GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
