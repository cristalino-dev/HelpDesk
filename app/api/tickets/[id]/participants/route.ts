/**
 * app/api/tickets/[id]/participants/route.ts — stop someone following a ticket (v3.92).
 *
 * DELETE { userId } → { ok: true }. Staff only.
 *
 * Participants are added by merging (lib/ticketMerge.ts): the owner of a
 * merged ticket follows the one it went into. Staff may take someone off —
 * a merge that swept in a person the problem does not concern. They lose the
 * ticket from their dashboard, its conversation and its mail. The history
 * records who was removed and by whom.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextRequest, NextResponse } from "next/server"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const body = (await req.json().catch(() => null)) as { userId?: unknown } | null
    const userId = typeof body?.userId === "string" ? body.userId : ""
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

    const row = await prisma.ticketParticipant.findUnique({
      where: { ticketId_userId: { ticketId: id, userId } },
      select: { id: true, user: { select: { name: true, email: true } } },
    })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // The row and the history that records its removal, together.
    await prisma.$transaction([
      prisma.ticketParticipant.delete({ where: { id: row.id } }),
      prisma.ticketHistory.create({
        data: {
          ticketId: id, field: "participantRemoved", oldValue: row.user.name || row.user.email, newValue: null,
          actorName: session.user.name ?? session.user.email, actorEmail: session.user.email,
        },
      }),
    ])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/participants DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
