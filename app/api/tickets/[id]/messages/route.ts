import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { sendMail, mailNewMessageToUser, mailNewMessageToStaff } from "@/lib/mail"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const { content } = await req.json()
    if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)

    // Verify access — staff can message any ticket, users only their own
    if (!isStaff) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email } })
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!user || ticket?.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: id,
        content: content.trim(),
        authorName: session.user.name ?? session.user.email,
        authorEmail: session.user.email,
        authorRole: isStaff ? "staff" : "user",
      },
    })

    // Email notifications (non-blocking)
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } } },
    })
    if (ticket) {
      const ticketInfo = {
        id: ticket.id, subject: ticket.subject, description: ticket.description,
        urgency: ticket.urgency, category: ticket.category, platform: ticket.platform,
        phone: ticket.phone, computerName: ticket.computerName, status: ticket.status,
        submitterName: ticket.user?.name ?? ticket.user?.email ?? "משתמש",
        submitterEmail: ticket.user?.email ?? "",
      }
      const authorName = session.user.name ?? session.user.email
      if (isStaff) {
        // Staff → notify ticket owner
        if (ticket.user?.email) {
          void sendMail({
            to: ticket.user.email,
            subject: `תגובה חדשה על פנייתך: ${ticket.subject}`,
            html: mailNewMessageToUser(ticketInfo, content.trim(), authorName),
          })
        }
      } else {
        // User → notify all staff
        void sendMail({
          to: STAFF_EMAILS,
          subject: `תגובת משתמש על פנייה: ${ticket.subject}`,
          html: mailNewMessageToStaff(ticketInfo, content.trim(), authorName),
        })
      }
    }

    return NextResponse.json(message)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/messages POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
