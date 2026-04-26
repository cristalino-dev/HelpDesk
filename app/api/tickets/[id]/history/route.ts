/**
 * app/api/tickets/[id]/history/route.ts
 *
 * GET /api/tickets/[id]/history
 *
 * Returns the full change-history for a single ticket, ordered
 * chronologically (oldest first).  Accessible to the ticket owner
 * and all staff/admin members.
 */

import { auth }        from "@/auth"
import { prisma }      from "@/lib/db"
import { logError }    from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email ?? "")

    // Resolve ticket — needed for ownership check
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { user: { select: { email: true } } },
    })
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!isStaff && ticket.user?.email !== session.user.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const history = await prisma.ticketHistory.findMany({
      where:   { ticketId: id },
      orderBy: { changedAt: "asc" },
    })

    return NextResponse.json(history)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, `/api/tickets/[id]/history GET`, e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
