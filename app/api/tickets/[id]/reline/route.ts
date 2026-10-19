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

    // Written before the response: a 200 says the escalation is on record,
    // and the button will read "נשלח" from here on.
    await prisma.$transaction([
      prisma.ticket.update({ where: { id }, data: { relineSentAt: sentAt } }),
      prisma.ticketHistory.create({
        data: {
          ticketId: id,
          field: "reline",
          newValue: RELINE_EMAIL,
          actorName: sentBy,
          actorEmail: session.user.email,
        },
      }),
    ])

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

    return NextResponse.json({ ok: true, sentAt: sentAt.toISOString() })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/reline POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
