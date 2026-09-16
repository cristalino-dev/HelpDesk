/**
 * POST /api/v1/tickets/{ref}/messages — write to the ticket's owner (v3.88).
 *
 * Write key. { content, authorName? } → 201 { data: Message }. The message
 * appears in the ticket's conversation as from staff, named authorName or
 * "API: <key name>", and the owner and participants are mailed about it — as
 * when staff answer on the site — unless "notify": false. A merged ticket
 * (v3.92) takes no messages: 409.
 */

import { prisma } from "@/lib/db"
import { authenticateApi, apiError, apiActor } from "@/lib/apiKeys"
import { parseEntry } from "@/lib/apiV1"
import { refWhere, serverError } from "@/lib/apiRoute"
import { sendMail, mailNewMessageToUser } from "@/lib/mail"
import { subjects } from "@/lib/mailSubjects"
import { followerEmails, PARTICIPANTS_SELECT } from "@/lib/ticketAccess"
import { mergedError } from "@/lib/ticketType"
import { NextRequest, NextResponse, after } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const auth = await authenticateApi(req, "write")
    if ("response" in auth) return auth.response
    const { ref } = await params

    const parsed = parseEntry(await req.json().catch(() => undefined))
    if ("errors" in parsed) return apiError(400, "invalid_body", parsed.errors.join("; "))

    const ticket = await prisma.ticket.findUnique({
      where: refWhere(ref),
      include: {
        user:         { select: { name: true, email: true } },
        participants: PARTICIPANTS_SELECT,
        mergedInto:   { select: { ticketNumber: true, type: true } },
      },
    })
    if (!ticket) return apiError(404, "not_found", `No ticket ${ref}.`)
    // v3.92: a merged ticket is frozen — write to the one it was merged into.
    if (ticket.mergedInto) return apiError(409, "conflict", mergedError(ticket.mergedInto))

    const actor = apiActor(auth.caller)
    const authorName = parsed.authorName ?? actor.name
    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, content: parsed.content, authorName, authorEmail: actor.email, authorRole: "staff" },
    })

    const owner = ticket.user?.email
    if (parsed.notify && owner) {
      const info = {
        id: ticket.id, ticketNumber: ticket.ticketNumber, type: ticket.type,
        subject: ticket.subject, description: ticket.description, urgency: ticket.urgency,
        category: ticket.category, platform: ticket.platform, phone: ticket.phone,
        computerName: ticket.computerName, status: ticket.status,
        submitterName: ticket.user?.name ?? owner, submitterEmail: owner,
      }
      // The owner and the participants (v3.92), each greeted by name.
      // Started now, awaited once the response is out (rule 41).
      const names = new Map((ticket.participants ?? []).map(p => [p.user.email, p.user.name]))
      const mails = followerEmails(ticket).map(to => sendMail({
        to,
        subject: subjects.newMessageUser(ticket, ticket.subject),
        html: mailNewMessageToUser({ ...info, submitterName: to === owner ? info.submitterName : (names.get(to) ?? to) }, parsed.content, authorName),
      }))
      after(async () => { await Promise.all(mails) })
    }

    return NextResponse.json({
      data: {
        id: message.id, content: message.content, createdAt: message.createdAt.toISOString(),
        author: { name: message.authorName, email: message.authorEmail, role: message.authorRole },
      },
    }, { status: 201 })
  } catch (err) {
    return serverError(err, "/api/v1/tickets/[ref]/messages POST")
  }
}
