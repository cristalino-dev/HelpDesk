/**
 * POST /api/v1/tickets/{ref}/notes — an internal note, for staff only (v3.88).
 *
 * Write key. { content, authorName? } → 201 { data: Note }. The owner never
 * sees notes and nobody is mailed.
 */

import { prisma } from "@/lib/db"
import { authenticateApi, apiError, apiActor } from "@/lib/apiKeys"
import { parseEntry } from "@/lib/apiV1"
import { refWhere, serverError } from "@/lib/apiRoute"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const auth = await authenticateApi(req, "write")
    if ("response" in auth) return auth.response
    const { ref } = await params

    const parsed = parseEntry(await req.json().catch(() => undefined))
    if ("errors" in parsed) return apiError(400, "invalid_body", parsed.errors.join("; "))

    const ticket = await prisma.ticket.findUnique({ where: refWhere(ref), select: { id: true } })
    if (!ticket) return apiError(404, "not_found", `No ticket ${ref}.`)

    const actor = apiActor(auth.caller)
    const note = await prisma.ticketNote.create({
      data: { ticketId: ticket.id, content: parsed.content, authorName: parsed.authorName ?? actor.name, authorEmail: actor.email },
    })
    return NextResponse.json({
      data: {
        id: note.id, content: note.content, createdAt: note.createdAt.toISOString(),
        author: { name: note.authorName, email: note.authorEmail },
      },
    }, { status: 201 })
  } catch (err) {
    return serverError(err, "/api/v1/tickets/[ref]/notes POST")
  }
}
