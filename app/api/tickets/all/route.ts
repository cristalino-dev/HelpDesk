import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS, VIEWER_EMAILS } from "@/lib/staffEmails"
import { hideInternal } from "@/lib/internalPriority"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    const canView = isStaff || VIEWER_EMAILS.includes(session.user.email)
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const tickets = await prisma.ticket.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        // v3.92 — the queue names the ticket a merged one went into.
        mergedInto: { select: { ticketNumber: true, type: true } },
      },
    })

    // Viewers read the queue but are not the helpdesk: the internal priority
    // is the team's own (v3.107).
    return NextResponse.json(isStaff ? tickets : tickets.map(hideInternal))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/all GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
