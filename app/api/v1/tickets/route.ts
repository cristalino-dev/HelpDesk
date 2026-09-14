/**
 * /api/v1/tickets — list tickets and open new ones, for other programs (v3.88).
 *
 *   GET  — read key.  Filters, sorting and paging: lib/ticketQuery.ts.
 *          → { data: Ticket[], page: { number, limit, total, pages } }
 *   POST — write key. { subject, description, ownerEmail, … } → 201 { data: Ticket }
 *          Opens the ticket in the owner's name (the account is created if they
 *          have none yet), records "API: <key name>" as who opened it, and sends
 *          the same mail the web form does unless "notify": false.
 *
 * The contract: docs/API.md and GET /api/v1/openapi.json. Errors:
 * { error: { code, message } } — lib/apiKeys.ts.
 */

import { prisma } from "@/lib/db"
import { authenticateApi, apiError, apiActor } from "@/lib/apiKeys"
import { parseTicketListQuery } from "@/lib/ticketQuery"
import { toApiTicket, parseCreate } from "@/lib/apiV1"
import { getTicketOptions } from "@/lib/apiOptions"
import { serverError } from "@/lib/apiRoute"
import { resolveUserByEmail } from "@/lib/users"
import { getStaffEmails } from "@/lib/staffMembers"
import { sendMail, mailTicketOpenedStaff, mailTicketOpenedUser } from "@/lib/mail"
import { ticketLabel } from "@/lib/ticketType"
import { NextRequest, NextResponse, after } from "next/server"

export const runtime = "nodejs"

const WITH_OWNER = { user: { select: { name: true, email: true } } } as const

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApi(req, "read")
    if ("response" in auth) return auth.response

    const query = parseTicketListQuery(new URL(req.url).searchParams)
    if ("errors" in query) return apiError(400, "invalid_query", query.errors.join("; "))

    const [total, rows] = await Promise.all([
      prisma.ticket.count({ where: query.where }),
      prisma.ticket.findMany({ where: query.where, orderBy: query.orderBy, skip: query.skip, take: query.take, include: WITH_OWNER }),
    ])
    return NextResponse.json({
      data: rows.map(toApiTicket),
      page: { number: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
    })
  } catch (err) {
    return serverError(err, "/api/v1/tickets GET")
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateApi(req, "write")
    if ("response" in auth) return auth.response

    const body = await req.json().catch(() => undefined)
    const parsed = parseCreate(body, await getTicketOptions())
    if ("errors" in parsed) return apiError(400, "invalid_body", parsed.errors.join("; "))
    const input = parsed.input
    const actor = apiActor(auth.caller)

    const owner = await resolveUserByEmail(input.ownerEmail, input.ownerName)
    const ticket = await prisma.ticket.create({
      data: {
        type: input.type,
        subject: input.subject,
        description: input.description,
        urgency: input.urgency,
        category: input.category,
        platform: input.platform,
        phone: input.phone,
        computerName: input.computerName,
        ...(input.assignedTo ? { assignedTo: input.assignedTo } : {}),
        userId: owner.id,
      },
      include: WITH_OWNER,
    })
    await prisma.ticketHistory.create({
      data: { ticketId: ticket.id, field: "created", newValue: "פתוח", actorName: actor.name, actorEmail: actor.email },
    })

    if (input.notify) {
      const info = {
        id: ticket.id, ticketNumber: ticket.ticketNumber, type: ticket.type,
        subject: ticket.subject, description: ticket.description, urgency: ticket.urgency,
        category: ticket.category, platform: ticket.platform, phone: ticket.phone,
        computerName: ticket.computerName, status: ticket.status,
        submitterName: owner.name ?? owner.email, submitterEmail: owner.email,
      }
      const staff = await getStaffEmails()
      // Started now, awaited once the response is out (rule 41).
      const mails = [
        sendMail({ to: staff, subject: `פנייה חדשה ${ticketLabel(ticket)}: ${ticket.subject}`, html: mailTicketOpenedStaff(info) }),
        sendMail({ to: owner.email, subject: `פנייתך התקבלה — ${ticketLabel(ticket)}`, html: mailTicketOpenedUser(info) }),
      ]
      after(async () => { await Promise.all(mails) })
    }

    return NextResponse.json({ data: toApiTicket(ticket) }, { status: 201 })
  } catch (err) {
    return serverError(err, "/api/v1/tickets POST")
  }
}
