/**
 * /api/v1/tickets/{ref} — one ticket, for other programs (v3.88).
 * {ref} is HDTC-597, REQ-601, 597, or the internal id.
 *
 *   GET   — read key.  → { data: TicketDetail }: the ticket with its messages,
 *           internal notes, history, attachments and equipment lines.
 *   PATCH — write key. Any of status (+ holdReason), urgency, category,
 *           platform, type, assignedTo, subject, description, phone,
 *           computerName, and a note → { data: Ticket }.
 *           Every rule a staff edit obeys applies (lib/ticketChanges.ts): closing
 *           sets urgency נמוך, בהמתנה needs holdReason, a leaving-employee ticket
 *           with gear still out does not close (409). History records
 *           "API: <key name>"; mail goes out as for a staff edit unless
 *           "notify": false.
 */

import { prisma } from "@/lib/db"
import { authenticateApi, apiError, apiActor } from "@/lib/apiKeys"
import { toApiTicket, toApiTicketDetail, parseUpdate } from "@/lib/apiV1"
import { getTicketOptions } from "@/lib/apiOptions"
import { refWhere, serverError } from "@/lib/apiRoute"
import { applyTicketChanges, TICKET_CHANGE_INCLUDE } from "@/lib/ticketChanges"
import { getStaffEmails } from "@/lib/staffMembers"
import { NextRequest, NextResponse, after } from "next/server"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ ref: string }> }

const DETAIL_INCLUDE = {
  user:        { select: { name: true, email: true } },
  messages:    { orderBy: { createdAt: "asc" as const } },
  notes:       { orderBy: { createdAt: "asc" as const } },
  history:     { orderBy: { changedAt: "asc" as const } },
  attachments: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
  equipment:   { orderBy: { createdAt: "asc" as const } },
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authenticateApi(req, "read")
    if ("response" in auth) return auth.response
    const { ref } = await params
    const ticket = await prisma.ticket.findUnique({ where: refWhere(ref), include: DETAIL_INCLUDE })
    if (!ticket) return apiError(404, "not_found", `No ticket ${ref}.`)
    return NextResponse.json({ data: toApiTicketDetail(ticket) })
  } catch (err) {
    return serverError(err, "/api/v1/tickets/[ref] GET")
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await authenticateApi(req, "write")
    if ("response" in auth) return auth.response
    const { ref } = await params

    const body = await req.json().catch(() => undefined)
    const parsed = parseUpdate(body, await getTicketOptions())
    if ("errors" in parsed) return apiError(400, "invalid_body", parsed.errors.join("; "))

    const ticket = await prisma.ticket.findUnique({ where: refWhere(ref), include: TICKET_CHANGE_INCLUDE })
    if (!ticket) return apiError(404, "not_found", `No ticket ${ref}.`)

    const result = await applyTicketChanges({
      ticket, changes: parsed.changes, actor: apiActor(auth.caller),
      staffEmails: await getStaffEmails(), notify: parsed.notify,
    })
    if (!result.ok) return apiError(409, "conflict", result.error)
    // Started inside applyTicketChanges, awaited once the response is out (rule 41).
    if (result.mails.length > 0) after(async () => { await Promise.all(result.mails) })

    const fresh = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: { user: { select: { name: true, email: true } } } })
    return NextResponse.json({ data: toApiTicket(fresh!) })
  } catch (err) {
    return serverError(err, "/api/v1/tickets/[ref] PATCH")
  }
}
