import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { getStaffEmails } from "@/lib/staffMembers"
import { sendMail, mailNewMessageToUser, mailNewMessageToStaff, mailReplyNotification } from "@/lib/mail"
import { subjects } from "@/lib/mailSubjects"
import { NextRequest, NextResponse, after } from "next/server"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const { content, replyToEmail, replyToName, replyToMsgId } = await req.json()
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

    // Email notifications. The 200 reports the message row, written above; it
    // says nothing about the mail, so the sends are awaited in after() rather
    // than fired with a bare `void` and lost when the request ends (rule 41).
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { user: { select: { name: true, email: true } } },
    })
    const mails: Promise<void>[] = []
    if (ticket) {
      const ticketInfo = {
        id: ticket.id, ticketNumber: ticket.ticketNumber,
        subject: ticket.subject, description: ticket.description,
        urgency: ticket.urgency, category: ticket.category, platform: ticket.platform,
        phone: ticket.phone, computerName: ticket.computerName, status: ticket.status,
        submitterName: ticket.user?.name ?? ticket.user?.email ?? "משתמש",
        submitterEmail: ticket.user?.email ?? "",
      }
      const authorName = session.user.name ?? session.user.email

      // If this is a direct reply to a specific person — notify them first
      if (replyToEmail && replyToEmail !== session.user.email) {
        mails.push(sendMail({
          to: replyToEmail,
          subject: subjects.repliedToYou(authorName, ticket.ticketNumber, ticket.subject),
          html: mailReplyNotification(ticketInfo, content.trim(), authorName, replyToName ?? replyToEmail, message.id),
        }))
      }

      if (isStaff) {
        // Staff → notify ticket owner (unless they're the one being replied to — already notified above)
        if (ticket.user?.email && ticket.user.email !== replyToEmail) {
          mails.push(sendMail({
            to: ticket.user.email,
            subject: subjects.newMessageUser(ticket.ticketNumber, ticket.subject),
            html: mailNewMessageToUser(ticketInfo, content.trim(), authorName),
          }))
        }
      } else {
        // User → notify all staff (excluding those already notified via reply)
        const staffRecipients = (await getStaffEmails()).filter(e => e !== replyToEmail)
        if (staffRecipients.length > 0) {
          mails.push(sendMail({
            to: staffRecipients,
            subject: subjects.newMessageStaff(ticket.ticketNumber, ticket.subject),
            html: mailNewMessageToStaff(ticketInfo, content.trim(), authorName),
          }))
        }
      }
    }
    after(async () => { await Promise.all(mails) })

    return NextResponse.json(message)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/messages POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const { messageId } = await req.json()
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 })

    // Fetch the message and verify it belongs to this ticket
    const message = await prisma.ticketMessage.findUnique({ where: { id: messageId } })
    if (!message || message.ticketId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Only the original author may delete
    if (message.authorEmail !== session.user.email) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // The message must be the very last one on this ticket
    const lastMessage = await prisma.ticketMessage.findFirst({
      where: { ticketId: id },
      orderBy: { createdAt: "desc" },
    })
    if (!lastMessage || lastMessage.id !== messageId) {
      return NextResponse.json({ error: "ניתן למחוק רק את ההודעה האחרונה" }, { status: 400 })
    }

    await prisma.ticketMessage.delete({ where: { id: messageId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/messages DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
