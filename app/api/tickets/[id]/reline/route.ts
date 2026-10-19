/**
 * app/api/tickets/[id]/reline/route.ts — escalate a ticket to Reline (v3.102)
 *
 * POST /api/tickets/[id]/reline
 *
 * Mails the ticket to Reline's support address with the contact details, and
 * records that it went. Reline answer with their own case number, which the
 * mail intake reads off their subject and writes to `relineRef` — see
 * `lib/reline.ts` for how the two subjects line up.
 *
 * **Staff only.** This sends a person's name, phone and address to a company
 * outside Cristalino, so it is not something a ticket's owner can trigger on
 * their own.
 *
 * The outgoing mail is scheduled with `after()`, but `relineSentAt` and the
 * history row are written BEFORE the response: a 200 means the escalation is
 * recorded, and the UI switches to "נשלח" on the strength of it.
 *
 * RESPONSES
 *   200 — { ok: true, sentAt }
 *   401 — signed out · 403 — not staff · 404 — no such ticket
 *   409 — the ticket was merged into another; escalate that one
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { sendMail, mailRelineRequest } from "@/lib/mail"
import { mergedError, ticketLabel } from "@/lib/ticketType"
import { RELINE_EMAIL, relineSubject, relineContact } from "@/lib/reline"
import { WAITING_EXTERNAL, CLOSED } from "@/lib/ticketStatus"
import { NextRequest, NextResponse, after } from "next/server"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        user:       { select: { name: true, email: true, phone: true } },
        mergedInto: { select: { ticketNumber: true, type: true } },
      },
    })
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (ticket.mergedInto) return NextResponse.json({ error: mergedError(ticket.mergedInto) }, { status: 409 })

    const label = ticketLabel(ticket)
    const contact = relineContact(ticket)
    const sentBy = session.user.name ?? session.user.email
    const sentAt = new Date()

    // Handing a ticket to an outside supplier parks it: it is no longer work
    // we are doing, and leaving it "פתוח" makes the queue look neglected for
    // something somebody else is holding (v3.103). A closed ticket is left
    // closed — escalating one is for the record, not a reopening.
    const parks = ticket.status !== CLOSED && ticket.status !== WAITING_EXTERNAL
    const writes = [
      prisma.ticket.update({
        where: { id },
        data: {
          relineSentAt: sentAt,
          // A second send is a new case at their end, so the old reference
          // and reply time no longer describe the ticket.
          relineRef: null,
          relineRepliedAt: null,
          ...(parks ? { status: WAITING_EXTERNAL, holdReason: null } : {}),
        },
      }),
      prisma.ticketHistory.create({
        data: {
          ticketId: id, field: "reline", newValue: RELINE_EMAIL,
          actorName: sentBy, actorEmail: session.user.email,
        },
      }),
      ...(parks ? [prisma.ticketHistory.create({
        data: {
          ticketId: id, field: "status", oldValue: ticket.status, newValue: WAITING_EXTERNAL,
          actorName: sentBy, actorEmail: session.user.email,
        },
      })] : []),
    ]
    // Written before the response: a 200 says the escalation is on record,
    // and the button reads "נשלח" from here on.
    await prisma.$transaction(writes)

    const html = mailRelineRequest(
      {
        label,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        platform: ticket.platform,
        urgency: ticket.urgency,
        openedAt: ticket.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
      },
      contact,
      sentBy,
    )

    after(async () => {
      try {
        await sendMail({
          to: RELINE_EMAIL,
          subject: relineSubject(label, ticket.subject),
          html,
        })
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        await logError(`Reline escalation mail failed for ${label}: ${e.message}`, "/api/tickets/[id]/reline POST", e.stack).catch(() => {})
      }
    })

    return NextResponse.json({ ok: true, sentAt: sentAt.toISOString(), status: parks ? WAITING_EXTERNAL : ticket.status })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/reline POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/tickets/[id]/reline — set or clear the reference by hand.
 *
 * Their acknowledgement may never arrive: it can be answered to a person
 * rather than to helpdesk@, their system can be quiet, or somebody rings them
 * instead of mailing. Without this the reference would be unreachable in
 * exactly the cases where somebody already knows it, so staff can type it in.
 *
 * `{ ref: "269311" }` sets it, `{ ref: null }` clears it. The history row
 * names the staff member, so a hand-entered number is never mistaken for one
 * Reline sent — which is the whole reason the field is attributable.
 *
 * Staff only. 400 on anything that is not digits; 404 for no such ticket.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const { ref } = await req.json()

    const clearing = ref === null || ref === ""
    const value = clearing ? null : String(ref ?? "").trim()
    if (!clearing && !/^\d{3,12}$/.test(value ?? "")) {
      return NextResponse.json({ error: "מספר פנייה של Reline הוא ספרות בלבד" }, { status: 400 })
    }

    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { relineRef: true } })
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.$transaction([
      prisma.ticket.update({
        where: { id },
        // Clearing drops the reply time with it: it recorded when THAT
        // reference arrived, and it describes nothing once it is gone.
        data: { relineRef: value, relineRepliedAt: clearing ? null : new Date() },
      }),
      prisma.ticketHistory.create({
        data: {
          ticketId: id, field: "relineRef",
          oldValue: ticket.relineRef, newValue: value,
          actorName: session.user.name ?? session.user.email,
          actorEmail: session.user.email,
        },
      }),
    ])

    return NextResponse.json({ ok: true, relineRef: value })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/reline PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
