import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
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
        attachments: { orderBy: { createdAt: "asc" } },
        notes:       isStaff ? { orderBy: { createdAt: "asc" } } : false,
        messages:    { orderBy: { createdAt: "asc" } },
        history:     { orderBy: { changedAt: "asc" } },
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
