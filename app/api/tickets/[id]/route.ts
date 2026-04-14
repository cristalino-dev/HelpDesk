import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextRequest, NextResponse } from "next/server"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)

    // Accept both HDTC-N format and raw CUID for backward compat
    const where = id.startsWith("HDTC-")
      ? { ticketNumber: parseInt(id.slice(5), 10) }
      : { id }

    const ticket = await prisma.ticket.findUnique({
      where,
      include: {
        user: { select: { name: true, email: true } },
        attachments: { orderBy: { createdAt: "asc" } },
        notes: isStaff ? { orderBy: { createdAt: "asc" } } : false,
        messages: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Regular users can only view their own tickets
    if (!isStaff && ticket.userId !== (await prisma.user.findUnique({ where: { email: session.user.email } }))?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json(ticket)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id] GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
