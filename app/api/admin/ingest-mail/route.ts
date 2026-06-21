/**
 * app/api/admin/ingest-mail/route.ts — Email-to-Ticket ingestion endpoint
 *
 * PURPOSE:
 * ─────────
 * Polls the helpdesk mailbox over IMAP and turns inbound emails into tickets.
 * Any UNSEEN message whose SUBJECT contains the keyword (default "ticket",
 * override with TICKET_MAIL_KEYWORD) becomes a new URGENT ticket:
 *   - subject      → email subject with the keyword removed + tidied
 *   - description  → email plain-text body
 *   - urgency      → "דחוף" (urgent), category/platform → defaults
 *   - reporter     → upserted User from the sender's From address
 * Successfully-ingested messages are marked \Seen so they are not reprocessed.
 * Non-matching messages are left untouched (still unread).
 *
 * AUTHENTICATION:
 * ────────────────
 * Protected by a secret in the `x-ingest-secret` header (INGEST_SECRET, falling
 * back to DIGEST_SECRET) — same pattern as the digest/sweep cron endpoints.
 *
 * MAILBOX CREDENTIALS:
 * ─────────────────────
 * Reuses the existing Google Workspace app password:
 *   SMTP_USER / SMTP_PASS — the same credentials used for outbound mail.
 *   IMAP_HOST — defaults to imap.gmail.com.
 *
 * RUNS VIA: server cron (run-ingest.sh, every 2 minutes — see deploy.sh).
 *
 * RESPONSE:
 *   200 — { ok: true, created: N, tickets: number[] }
 *   401 — Unauthorized (bad/missing secret)
 *   503 — Mailbox not configured (SMTP_USER/SMTP_PASS missing)
 *   500 — Server error (logged)
 */

import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { sendMail, mailTicketOpenedStaff, mailTicketOpenedUser } from "@/lib/mail"
import { hasTicketKeyword, buildIngestedTicket, DEFAULT_TICKET_KEYWORD } from "@/lib/mailIngest"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-ingest-secret")
  const expected = process.env.INGEST_SECRET || process.env.DIGEST_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    return NextResponse.json({ error: "Mailbox not configured" }, { status: 503 })
  }

  const keyword = process.env.TICKET_MAIL_KEYWORD || DEFAULT_TICKET_KEYWORD
  const host = process.env.IMAP_HOST || "imap.gmail.com"

  const client = new ImapFlow({
    host, port: 993, secure: true,
    auth: { user, pass },
    logger: false,
  })

  const tickets: number[] = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock("INBOX")
    try {
      // UIDs of all unread messages
      const uids = (await client.search({ seen: false }, { uid: true })) || []

      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
        if (!msg || !msg.source) continue

        const parsed = await simpleParser(msg.source)
        const subject = parsed.subject ?? ""

        // Only subjects containing the keyword become tickets; leave the rest unread.
        if (!hasTicketKeyword(subject, keyword)) continue

        const from = Array.isArray(parsed.from?.value) ? parsed.from?.value[0] : undefined
        const t = buildIngestedTicket(
          { subject, text: parsed.text ?? "", fromName: from?.name ?? "", fromEmail: from?.address ?? "" },
          keyword,
        )

        // Reporter: upsert a User by the sender's email so the ticket has an owner
        const reporter = await prisma.user.upsert({
          where:  { email: t.reporterEmail },
          create: { email: t.reporterEmail, name: t.reporterName },
          update: {},
        })

        const ticket = await prisma.ticket.create({
          data: {
            subject:      t.subject,
            description:  t.description,
            phone:        t.phone,
            computerName: t.computerName,
            urgency:      t.urgency,
            category:     t.category,
            platform:     t.platform,
            userId:       reporter.id,
          },
        })

        await prisma.ticketHistory.create({
          data: {
            ticketId:   ticket.id,
            field:      "created",
            newValue:   "פתוח",
            actorName:  t.reporterName,
            actorEmail: t.reporterEmail,
          },
        })

        const ticketInfo = {
          id: ticket.id, ticketNumber: ticket.ticketNumber,
          subject: t.subject, description: t.description,
          urgency: t.urgency, category: t.category, platform: t.platform,
          phone: t.phone, computerName: t.computerName, status: ticket.status,
          submitterName: t.reporterName, submitterEmail: t.reporterEmail,
        }
        void Promise.all([
          sendMail({ to: STAFF_EMAILS, subject: `פנייה חדשה (מייל): ${t.subject}`, html: mailTicketOpenedStaff(ticketInfo) }),
          sendMail({ to: t.reporterEmail, subject: "פנייתך התקבלה", html: mailTicketOpenedUser(ticketInfo) }),
        ])

        // Mark processed so we never create a duplicate from the same email
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true })
        tickets.push(ticket.ticketNumber)
      }
    } finally {
      lock.release()
    }
    await client.logout()
    return NextResponse.json({ ok: true, created: tickets.length, tickets })
  } catch (err) {
    try { await client.logout() } catch { /* already closed */ }
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/ingest-mail POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
