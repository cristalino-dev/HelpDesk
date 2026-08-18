import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError, logInfo } from "@/lib/logError"
import { deleteAttachmentFile } from "@/lib/attachmentStorage"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { ticketRevision } from "@/lib/ticketRevision"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)

    // Accept both HDTC-N format and raw CUID for backward compat
    const where = id.startsWith("HDTC-")
      ? { ticketNumber: parseInt(id.slice(5), 10) }
      : { id }

    // ── Cheap change-detection probe ─────────────────────────────────────────
    // The detail page polls every 10s with ?rev=<signature of what it shows>.
    // Attachments are stored as base64 data URLs, so the full payload can be
    // megabytes; re-sending it every poll when nothing changed is wasteful.
    // Here we recompute the same signature (see lib/ticketRevision.ts) from an
    // ids-only query — a few hundred bytes — and short-circuit when it matches.
    const clientRev = req.nextUrl.searchParams.get("rev")
    if (clientRev) {
      const light = await prisma.ticket.findUnique({
        where,
        select: {
          updatedAt: true,
          user:        { select: { email: true } },
          // orderBy clauses must mirror the full fetch below exactly — the
          // signature folds in the LAST id of each collection.
          attachments: { select: { id: true }, orderBy: { createdAt: "asc" } },
          notes:       isStaff ? { select: { id: true }, orderBy: { createdAt: "asc" } } : false,
          messages:    { select: { id: true }, orderBy: { createdAt: "asc" } },
          history:     { select: { id: true }, orderBy: { changedAt: "asc" } },
          // receivedQty rides along: ticking an item off changes the line in
          // place, so an ids-only select would not move the signature.
          equipment:   { select: { id: true, receivedQty: true }, orderBy: { createdAt: "asc" } },
        },
      })
      if (!light) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (!isStaff && light.user.email !== session.user.email) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      // Client signatures come from the JSON payload where Dates are ISO
      // strings — serialize the same way so the strings are comparable.
      const serverRev = ticketRevision({ ...light, updatedAt: light.updatedAt.toISOString() })
      if (serverRev === clientRev) return NextResponse.json({ unchanged: true })
      // Something changed — fall through to the full fetch below.
    }

    const ticket = await prisma.ticket.findUnique({
      where,
      include: {
        user:        { select: { name: true, email: true } },
        // Metadata only — bytes are served by GET /api/attachments/[id].
        // Legacy dataUrl blobs must never ride along in the detail payload.
        attachments: {
          select: { id: true, ticketId: true, filename: true, mimeType: true, size: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        notes:       isStaff ? { orderBy: { createdAt: "asc" } } : false,
        messages:    { orderBy: { createdAt: "asc" } },
        history:     { orderBy: { changedAt: "asc" } },
        equipment:   { orderBy: { createdAt: "asc" } },
      },
    })

    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Regular users can only view their own tickets. The owner's email is
    // already in the include — no extra user lookup needed (emails are unique).
    if (!isStaff && ticket.user.email !== session.user.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json(ticket)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id] GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * DELETE /api/tickets/[id]
 *
 * Permanently removes a ticket and everything hanging off it: history, notes,
 * messages, attachments, equipment lines and the satisfaction review. There is
 * no undo and no soft-delete flag — this is the "opened by mistake" / "test
 * ticket" escape hatch, not a substitute for closing a ticket.
 *
 * ADMINS ONLY. Non-admin staff may close and edit; only an admin may erase.
 *
 * The database cascade covers the child ROWS (every relation is
 * onDelete: Cascade), but attachment BYTES live on the server filesystem since
 * v3.48 — those are removed first, and a file that has already gone missing
 * does not block the delete.
 *
 * The ticket's own audit trail disappears with it, so the deletion itself is
 * written to the Log table: who deleted what, and when.
 *
 * RESPONSE:
 *   200 — { ok: true, ticketNumber }
 *   401 — Not authenticated
 *   403 — Authenticated but not an admin
 *   404 — No such ticket
 *   500 — Database or unexpected error (logged to Log table)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin)  return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const where = id.startsWith("HDTC-")
      ? { ticketNumber: parseInt(id.slice(5), 10) }
      : { id }

    const ticket = await prisma.ticket.findUnique({
      where,
      select: {
        id: true, ticketNumber: true, subject: true,
        attachments: { select: { storedName: true } },
      },
    })
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Files on disk are outside the DB cascade. A file that is already gone is
    // not a reason to keep the ticket.
    await Promise.all(
      ticket.attachments
        .filter(a => a.storedName)
        .map(a => deleteAttachmentFile(a.storedName!).catch(() => {})),
    )

    await prisma.ticket.delete({ where: { id: ticket.id } })

    await logInfo(
      `פנייה HDTC-${ticket.ticketNumber} ("${ticket.subject}") נמחקה על ידי ${session.user.name ?? session.user.email}`,
      "/api/tickets/[id] DELETE",
    )

    return NextResponse.json({ ok: true, ticketNumber: ticket.ticketNumber })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id] DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
