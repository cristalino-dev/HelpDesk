/**
 * app/api/tickets/[id]/equipment/route.ts — Equipment request lines
 *
 * Equipment is requested on ANY ticket, not just onboarding ones: a new hire
 * needs a whole kit, but an existing employee asking for a second screen is the
 * same request from the supplier's point of view (see HDTC-506). The "עובד חדש"
 * category only decides whether the checklist is shown expanded by default.
 *
 *   POST   — the ticket owner or staff. Add/amend lines: [{ label, quantity }].
 *            Re-posting an existing label updates its quantity (upsert).
 *   PATCH  — staff only. Record arrivals: { id, receivedQty } or
 *            { id, received: true } to tick the whole line off at once.
 *   DELETE — staff, or the owner for a line nothing has arrived against yet.
 *
 * WHY RECEIVING IS STAFF-ONLY:
 * The shortage report in the admin console is the purchase order sent to the
 * supplier. Anyone may ask for a screen; only the technician who physically
 * handed it over may say it arrived.
 *
 * A closed ticket is frozen for the owner (staff can still correct it) — an
 * onboarding that is over should not silently grow new line items.
 *
 * All three verbs return the ticket's full, ordered line list so the client can
 * replace its state without a second round-trip.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { clampReceived, normalizeSelection } from "@/lib/equipment"
import { NextRequest, NextResponse } from "next/server"

/** Resolve `HDTC-N` or a raw CUID to a where-clause, matching the detail route. */
function whereFor(id: string) {
  return id.startsWith("HDTC-") ? { ticketNumber: parseInt(id.slice(5), 10) } : { id }
}

/** The ticket's lines in display order — the shared response body. */
async function listFor(ticketId: string) {
  return prisma.ticketEquipment.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
  })
}

type Access = {
  ticketId:   string
  actorEmail: string
  isStaff:    boolean
  isOwner:    boolean
  isClosed:   boolean
}

/**
 * Shared guard: resolves the ticket and the caller's relationship to it.
 * Rejects anyone who is neither staff nor the ticket owner.
 */
async function resolveAccess(id: string): Promise<{ error: NextResponse } | Access> {
  const session = await auth()
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const ticket = await prisma.ticket.findUnique({
    where: whereFor(id),
    select: { id: true, status: true, user: { select: { email: true } } },
  })
  if (!ticket) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  }

  const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
  const isOwner = ticket.user.email === session.user.email
  if (!isStaff && !isOwner) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return {
    ticketId:   ticket.id,
    actorEmail: session.user.email,
    isStaff,
    isOwner,
    isClosed:   ticket.status === "סגור",
  }
}

// ── POST — add / amend lines ─────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const access = await resolveAccess(id)
    if ("error" in access) return access.error

    if (!access.isStaff && access.isClosed) {
      return NextResponse.json({ error: "הפנייה סגורה — לא ניתן להוסיף ציוד" }, { status: 403 })
    }

    const { equipment } = await req.json()
    // Validated against the live option list so a hand-crafted request cannot
    // invent equipment that the supplier order would then ask for.
    const allowed = await prisma.fieldOption.findMany({ where: { field: "equipment" }, select: { label: true } })
    const lines = normalizeSelection(equipment, allowed.map(o => o.label))
    if (lines.length === 0) {
      return NextResponse.json({ error: "No valid equipment lines" }, { status: 400 })
    }

    for (const line of lines) {
      await prisma.ticketEquipment.upsert({
        where:  { ticketId_label: { ticketId: access.ticketId, label: line.label } },
        create: { ticketId: access.ticketId, label: line.label, quantity: line.quantity },
        update: { quantity: line.quantity },
      })
    }

    return NextResponse.json(await listFor(access.ticketId))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/equipment POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── PATCH — record arrivals (staff only) ─────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const access = await resolveAccess(id)
    if ("error" in access) return access.error
    if (!access.isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id: lineId, receivedQty, received } = await req.json()
    const line = await prisma.ticketEquipment.findUnique({ where: { id: lineId } })
    if (!line || line.ticketId !== access.ticketId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // `received` is the checkbox shortcut: true = all arrived, false = none.
    // `receivedQty` is the explicit count for a partial delivery.
    const nextQty = typeof received === "boolean"
      ? (received ? line.quantity : 0)
      : clampReceived(receivedQty, line.quantity)

    await prisma.ticketEquipment.update({
      where: { id: lineId },
      data: {
        receivedQty: nextQty,
        // Stamp only a completed line — a partial delivery is not "received".
        receivedAt:  nextQty >= line.quantity ? new Date() : null,
        receivedBy:  nextQty >= line.quantity ? access.actorEmail : null,
      },
    })

    return NextResponse.json(await listFor(access.ticketId))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/equipment PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── DELETE — remove a line ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const access = await resolveAccess(id)
    if ("error" in access) return access.error

    const { id: lineId } = await req.json()
    const line = await prisma.ticketEquipment.findUnique({ where: { id: lineId } })
    if (!line || line.ticketId !== access.ticketId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // An owner may withdraw a request they made, but not erase a delivery that
    // has already been recorded against it.
    if (!access.isStaff && (access.isClosed || line.receivedQty > 0)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.ticketEquipment.delete({ where: { id: lineId } })
    return NextResponse.json(await listFor(access.ticketId))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/equipment DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
