/**
 * app/api/automation/close/route.ts — Machine-to-machine ticket closure API
 *
 * PURPOSE:
 * ─────────
 * Allows external scripts and automation tools to close a helpdesk ticket by
 * its HDTC ticket number without a browser session. Useful for scripts that
 * resolve issues automatically (e.g. after a deployment, a monitoring alert
 * clears, a cron job completes, etc.).
 *
 * AUTHENTICATION:
 * ────────────────
 * Uses a static API key stored in the AUTOMATION_API_KEY environment variable.
 * Pass it in one of two ways:
 *   Authorization: Bearer <key>
 *   X-Api-Key: <key>
 *
 * If AUTOMATION_API_KEY is not configured on the server, the endpoint returns 503.
 *
 * ENDPOINT:
 * ──────────
 *   POST /api/automation/close
 *
 * REQUEST BODY (JSON):
 *   ticketNumber  {number}   Required. The HDTC-N number (e.g. 79 for HDTC-79).
 *   message       {string?}  Optional. Visible message sent to the ticket owner
 *                            (appears in the ticket chat thread).
 *   note          {string?}  Optional. Internal technician note (staff-only).
 *   actorName     {string?}  Name shown in history/notes (default: "Automation").
 *   actorEmail    {string?}  Email shown in history/notes (default: helpdesk@).
 *   fields        {object?}  Optional fields to update before closing:
 *                              subject, description, phone, computerName,
 *                              category, platform
 *
 * BEHAVIOR:
 * ──────────
 * 1. Closes the ticket — sets status → "סגור", urgency → "נמוך" (compound close,
 *    same invariant enforced by PATCH /api/tickets).
 * 2. Writes a TicketHistory entry with actorName/actorEmail.
 * 3. If `note` is provided — creates a TicketNote (internal, staff-only).
 * 4. If `message` is provided — creates a TicketMessage visible to the owner,
 *    and sends the owner an email notification.
 * 5. Sends the standard closure email (review request) to the ticket owner.
 * 6. Sends a staff update email (excluding helpdesk@ to avoid self-notification).
 * 7. Runs an urgency sweep — finds any closed tickets (status "סגור") whose
 *    urgency is not "נמוך" and corrects them. This is a safety net for tickets
 *    closed via paths that didn't enforce the compound-close invariant (direct
 *    DB edits, legacy scripts, etc.).
 *
 * The note and the message are written before the response — a 200 means they
 * are on disk. The emails and the urgency sweep are scheduled with `after()`,
 * so they run once the response is out but are still guaranteed to run.
 *
 * IDEMPOTENT:
 * ────────────
 * If the ticket is already closed, returns 200 with { ok: true, alreadyClosed: true }
 * and takes no further action.
 *
 * RESPONSES:
 *   200 — { ok: true, ticketNumber, id, subject, status, urgency, alreadyClosed? }
 *   400 — { error: "ticketNumber is required" }
 *   401 — { error: "Unauthorized" }    (missing or wrong API key)
 *   404 — { error: "Ticket not found" }
 *   503 — { error: "Automation API not configured" }  (missing env var)
 *   500 — { error: "Server error" }
 *
 * EXAMPLE (curl):
 *   curl -X POST https://helpdesk.cristalino.co.il/api/automation/close \
 *     -H "Authorization: Bearer <AUTOMATION_API_KEY>" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "ticketNumber": 79,
 *       "message": "הבעיה טופלה אוטומטית לאחר עדכון המערכת.",
 *       "note": "Closed by deployment script v2.4 — issue resolved automatically.",
 *       "fields": { "category": "תוכנה" }
 *     }'
 */

import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import {
  sendMail,
  mailTicketClosedWithReview,
  mailTicketUpdatedStaff,
  mailNewMessageToUser,
} from "@/lib/mail"
import { NextRequest, NextResponse, after } from "next/server"
import { isOffboarding, offboardingBlockers, blockerMessage } from "@/lib/offboarding"

const DEFAULT_ACTOR_EMAIL = "helpdesk@cristalino.co.il"
const DEFAULT_ACTOR_NAME  = "Automation"

/** Validate the incoming API key against AUTOMATION_API_KEY env var. */
function validateKey(req: NextRequest): boolean {
  const configured = process.env.AUTOMATION_API_KEY
  if (!configured) return false

  // Accept either Authorization: Bearer <key>  or  X-Api-Key: <key>
  const authHeader = req.headers.get("authorization") ?? ""
  const xApiKey    = req.headers.get("x-api-key") ?? ""

  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  return bearer === configured || xApiKey === configured
}

export async function POST(req: NextRequest) {
  try {
    // ── Key not configured on server ───────────────────────────────────────
    if (!process.env.AUTOMATION_API_KEY) {
      return NextResponse.json({ error: "Automation API not configured" }, { status: 503 })
    }

    // ── Auth ───────────────────────────────────────────────────────────────
    if (!validateKey(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json()
    const {
      ticketNumber,
      message,
      note,
      actorName  = DEFAULT_ACTOR_NAME,
      actorEmail = DEFAULT_ACTOR_EMAIL,
      fields     = {},
    } = body as {
      ticketNumber: number
      message?:     string
      note?:        string
      actorName?:   string
      actorEmail?:  string
      fields?: {
        subject?:      string
        description?:  string
        phone?:        string
        computerName?: string
        category?:     string
        platform?:     string
      }
    }

    if (!ticketNumber) {
      return NextResponse.json({ error: "ticketNumber is required" }, { status: 400 })
    }

    // ── Load ticket ────────────────────────────────────────────────────────
    const before = await prisma.ticket.findUnique({
      where: { ticketNumber: Number(ticketNumber) },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!before) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }

    // ── Idempotency: already closed ────────────────────────────────────────
    if (before.status === "סגור") {
      return NextResponse.json({
        ok:           true,
        alreadyClosed: true,
        ticketNumber: before.ticketNumber,
        id:           before.id,
        subject:      before.subject,
        status:       before.status,
        urgency:      before.urgency,
      })
    }

    // ── Offboarding close guard ────────────────────────────────────────────
    // Same rule as PATCH /api/tickets: a leaving-employee ticket does not close
    // while gear or an account is still unaccounted for. A machine caller must
    // not be a way around a procedure a human is held to.
    if (isOffboarding(before.category)) {
      const lines = await prisma.ticketEquipment.findMany({
        where:  { ticketId: before.id },
        select: { label: true, quantity: true, receivedQty: true },
      })
      const blockers = offboardingBlockers(lines)
      if (blockers.length > 0) {
        return NextResponse.json({ error: blockerMessage(blockers), blockers }, { status: 409 })
      }
    }

    // ── Build ticket update payload ────────────────────────────────────────
    // Compound close: always set status → "סגור" and urgency → "נמוך"
    // (mirrors the invariant in PATCH /api/tickets — single source of truth)
    const updateData: Record<string, string> = {
      status:  "סגור",
      urgency: "נמוך",
    }
    if (fields.subject      !== undefined) updateData.subject      = fields.subject
    if (fields.description  !== undefined) updateData.description  = fields.description
    if (fields.phone        !== undefined) updateData.phone        = fields.phone
    if (fields.computerName !== undefined) updateData.computerName = fields.computerName
    if (fields.category     !== undefined) updateData.category     = fields.category
    if (fields.platform     !== undefined) updateData.platform     = fields.platform

    const ticket = await prisma.ticket.update({
      where: { id: before.id },
      data:  updateData,
    })

    // ── History entries ────────────────────────────────────────────────────
    type HistoryRow = {
      ticketId: string; field: string
      oldValue?: string | null; newValue?: string | null
      actorName: string; actorEmail: string
    }
    const historyEntries: HistoryRow[] = [
      { ticketId: before.id, field: "status",  oldValue: before.status,  newValue: "סגור", actorName, actorEmail },
      { ticketId: before.id, field: "urgency", oldValue: before.urgency, newValue: "נמוך", actorName, actorEmail },
    ]
    const hasFieldEdit = Object.keys(fields).some(
      k => fields[k as keyof typeof fields] !== undefined &&
           fields[k as keyof typeof fields] !== before[k as keyof typeof before]
    )
    if (hasFieldEdit) {
      historyEntries.push({ ticketId: before.id, field: "edited", actorName, actorEmail })
    }
    await prisma.ticketHistory.createMany({ data: historyEntries })

    // ── Technician note (internal) + client message (visible to owner) ─────
    // These are awaited, not fire-and-forget. The 200 below reports the note and
    // the message as recorded, so they have to be on disk before it is sent —
    // an un-awaited create is dropped when the request context tears down.
    const writes: Promise<unknown>[] = []

    if (note?.trim()) {
      writes.push(
        prisma.ticketNote.create({
          data: {
            ticketId:    before.id,
            content:     note.trim(),
            authorName:  actorName,
            authorEmail: actorEmail,
          },
        })
      )
    }

    if (message?.trim()) {
      writes.push(
        prisma.ticketMessage.create({
          data: {
            ticketId:    before.id,
            content:     message.trim(),
            authorName:  actorName,
            authorEmail: actorEmail,
            authorRole:  "staff",
          },
        })
      )
    }

    await Promise.all(writes)

    // ── Email notifications ────────────────────────────────────────────────
    const ticketInfo = {
      id:            ticket.id,
      ticketNumber:  ticket.ticketNumber,
      subject:       ticket.subject,
      description:   ticket.description,
      urgency:       ticket.urgency,
      category:      ticket.category,
      platform:      ticket.platform,
      phone:         ticket.phone,
      computerName:  ticket.computerName,
      status:        ticket.status,
      submitterName:  before.user?.name  ?? before.user?.email ?? "משתמש",
      submitterEmail: before.user?.email ?? "",
    }

    const mails: Promise<void>[] = []

    // Closure review request → ticket owner
    if (before.user?.email) {
      mails.push(
        sendMail({
          to:      before.user.email,
          subject: `פנייתך HDTC-${ticket.ticketNumber} נסגרה — ספרו לנו כיצד היה השירות`,
          html:    mailTicketClosedWithReview(ticketInfo),
        })
      )
    }

    // Staff update — closure is a status change, so notify only the assigned
    // staff member (not all staff); skip actorEmail to avoid self-notification
    const staffRecipients = [before.assignedTo].filter(Boolean).filter(e => e !== actorEmail)
    if (staffRecipients.length > 0) {
      mails.push(
        sendMail({
          to:      staffRecipients,
          subject: `עדכון פנייה: ${ticket.subject}`,
          html:    mailTicketUpdatedStaff(ticketInfo, actorName),
        })
      )
    }

    // If a client message was included — also send a message-notification email
    if (message?.trim() && before.user?.email) {
      mails.push(
        sendMail({
          to:      before.user.email,
          subject: `תגובה חדשה על פנייתך: ${ticket.subject}`,
          html:    mailNewMessageToUser(ticketInfo, message.trim(), actorName),
        })
      )
    }

    // Deferred, but not dropped: `after` hands the sends to Next.js, which keeps
    // the invocation alive until they settle. A bare `void` loses them at request
    // teardown, and the owner never gets the closure/review email.
    after(async () => { await Promise.all(mails) })

    // ── Urgency sweep — fix any closed tickets with stale high urgency ──────
    // Runs after the response on every successful closure. Catches tickets that
    // were closed via a path that didn't enforce the compound-close invariant
    // (direct DB edits, legacy scripts, etc.). Scheduled with `after` so it does
    // not hold up the caller but still survives request teardown.
    after(async () => {
      await prisma.ticket.updateMany({
        where: { status: "סגור", urgency: { not: "נמוך" } },
        data:  { urgency: "נמוך" },
      })
    })

    // ── Response ───────────────────────────────────────────────────────────
    return NextResponse.json({
      ok:           true,
      ticketNumber: ticket.ticketNumber,
      id:           ticket.id,
      subject:      ticket.subject,
      status:       ticket.status,
      urgency:      ticket.urgency,
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/automation/close POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
