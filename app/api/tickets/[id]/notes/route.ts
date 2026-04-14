import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS, parseMentions } from "@/lib/staffEmails"
import { sendMail, mailNoteMention } from "@/lib/mail"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const { content } = await req.json()
    if (!content?.trim()) return NextResponse.json({ error: "Content required" }, { status: 400 })

    const note = await prisma.ticketNote.create({
      data: {
        ticketId: id,
        content: content.trim(),
        authorName: session.user.name ?? session.user.email,
        authorEmail: session.user.email,
      },
    })

    // Send @mention emails (non-blocking)
    const mentioned = parseMentions(content)
    if (mentioned.length > 0) {
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        include: { user: { select: { name: true, email: true } } },
      })
      if (ticket) {
        const ticketInfo = {
          id: ticket.id,
          subject:      ticket.subject,
          description:  ticket.description,
          urgency:      ticket.urgency,
          category:     ticket.category,
          platform:     ticket.platform,
          phone:        ticket.phone,
          computerName: ticket.computerName,
          status:       ticket.status,
          submitterName:  ticket.user?.name ?? ticket.user?.email ?? "משתמש",
          submitterEmail: ticket.user?.email ?? "",
        }
        const mentionedBy = session.user.name ?? session.user.email
        void Promise.all(
          mentioned.map(email =>
            sendMail({
              to: email,
              subject: `הוזכרת בפנייה: ${ticket.subject}`,
              html: mailNoteMention(ticketInfo, content.trim(), mentionedBy),
            })
          )
        )
      }
    }

    return NextResponse.json(note)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/notes POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
