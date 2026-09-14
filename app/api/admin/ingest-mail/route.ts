/**
 * app/api/admin/ingest-mail/route.ts — Email-to-Ticket ingestion endpoint
 *
 * PURPOSE:
 * ─────────
 * Polls the helpdesk mailbox over IMAP and turns inbound email into tickets.
 *
 * Since v3.82 EVERY message that reaches helpdesk@ opens a ticket. The subject
 * keyword (default "ticket", override TICKET_MAIL_KEYWORD) used to be the only
 * gate; now it only makes the ticket urgent. What does NOT open one is mail
 * that is machinery rather than a person: our own mail, bounces, auto-replies,
 * and anything received before the cutoff. The rules — and why each of them
 * exists — live in lib/mailIngest.ts. This file is the I/O around them.
 *
 * EACH RUN:
 * ──────────
 *   1. Searches UNSEEN mail received since the cutoff (INGEST_START, or
 *      INGEST_SINCE). The 929-message backlog is never even fetched.
 *   2. Skips — and marks \Seen — whatever skipReason() refuses, counting why.
 *   3. Opens a ticket for the rest: reported by the From: address, or by the
 *      Reply-To for mail we relayed on someone's behalf (the contact form).
 *      At most MAX_PER_RUN per run; the remainder stays unread for the next.
 *   4. Emails staff, and emails the sender unless mayAutoRespond() says not
 *      to: lists, bulk mail, no-reply senders, suppression requests, and the
 *      per-sender circuit breaker.
 *
 * \Seen is the "processed" mark and the Message-ID is the idempotency key
 * (Ticket.sourceMessageId is unique) — both exactly as before.
 *
 * AUTHENTICATION:
 * ────────────────
 * `x-ingest-secret` header (INGEST_SECRET, falling back to DIGEST_SECRET) —
 * the same pattern as the digest/sweep cron endpoints.
 *
 * MAILBOX:
 * ─────────
 * SMTP_USER / SMTP_PASS (the Workspace app password) and IMAP_HOST (default
 * imap.gmail.com). IMAP must be enabled on the mailbox itself.
 *
 * RUNS VIA: server cron — run-ingest.sh every 2 minutes (scripts/deploy-remote.sh).
 *
 * RESPONSE:
 *   200 — { ok: true, created: N, tickets: number[], skipped: { reason: count } }
 *   401 — Unauthorized (bad/missing secret)
 *   503 — Mailbox not configured (SMTP_USER/SMTP_PASS missing)
 *   500 — Server error (logged)
 */

import { ImapFlow } from "imapflow"
import { simpleParser, type AddressObject } from "mailparser"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { getStaffEmails } from "@/lib/staffMembers"
import { sendMail, mailTicketOpenedStaff, mailTicketOpenedUser, MAIL_FROM_ADDRESS } from "@/lib/mail"
import {
  buildIngestedTicket, fixCharsetLabels, DEFAULT_TICKET_KEYWORD,
  ingestSince, ownAddresses, inboundMeta, skipReason, isRelayed, mayAutoRespond,
  MAX_PER_RUN, AUTO_RESPOND_WINDOW_MS, type SkipReason,
} from "@/lib/mailIngest"
import { resolveUserByEmail } from "@/lib/users"
import { NextRequest, NextResponse, after } from "next/server"

/** The first address in a mailparser address field, whichever shape it came in. */
function firstAddress(field: AddressObject | AddressObject[] | undefined) {
  const obj = Array.isArray(field) ? field[0] : field
  return obj?.value?.[0]
}

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
  const since = ingestSince(process.env.INGEST_SINCE)
  const own = ownAddresses(user, MAIL_FROM_ADDRESS)

  const client = new ImapFlow({
    host, port: 993, secure: true,
    auth: { user, pass },
    logger: false,
  })

  const tickets: number[] = []
  const skipped: Partial<Record<SkipReason | "duplicate", number>> = {}
  const tally = (why: SkipReason | "duplicate") => { skipped[why] = (skipped[why] ?? 0) + 1 }

  // Notification mail is started as each ticket is opened and awaited after
  // the response: the response does not claim the mail was delivered, and a
  // bare `void` is abandoned when the request context tears down (rule 41).
  // Registered up front so it also covers a run that fails half way.
  const mails: Promise<void>[] = []
  after(async () => { await Promise.allSettled(mails) })

  /** Best-effort \Seen marking; never throws (so it can't abort the loop). */
  const markSeen = async (uid: number) => {
    try { await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }) } catch { /* best effort */ }
  }

  try {
    await client.connect()
    const lock = await client.getMailboxLock("INBOX")
    try {
      // Every UNSEEN message from the cutoff's day on. IMAP SINCE is date-
      // granular; skipReason() applies the exact instant. The date is what
      // keeps the backlog from being fetched at all — the job the subject
      // filter used to do for the scan, back when it was the only gate.
      const found = (await client.search({ seen: false, since }, { uid: true })) || []
      const uids = [...found].sort((a, b) => a - b)

      for (const uid of uids) {
        // A misconfigured cutoff throttles itself: the rest stay unread and
        // the next run, two minutes on, carries on from there.
        if (tickets.length >= MAX_PER_RUN) break

        const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true })
        if (!msg || !msg.source) continue

        // Relabel iso-8859-8-i/-e → windows-1255 so Hebrew decodes correctly
        const parsed = await simpleParser(fixCharsetLabels(msg.source))
        const from = firstAddress(parsed.from)
        const replyTo = firstAddress(parsed.replyTo)
        const receivedAt = msg.internalDate ? new Date(msg.internalDate) : null
        const meta = inboundMeta(from?.address, parsed.subject, receivedAt, parsed.headerLines, replyTo?.address)

        const reason = skipReason(meta, { since, own })
        if (reason) { tally(reason); await markSeen(uid); continue }

        // Idempotency: never create two tickets from the same email. The
        // Message-ID is unique per email; if we've already ingested it, skip.
        const messageId = parsed.messageId ?? null
        if (messageId) {
          const existing = await prisma.ticket.findUnique({ where: { sourceMessageId: messageId } })
          if (existing) { tally("duplicate"); await markSeen(uid); continue }
        }

        // Mail we relayed for someone (the contact form) is reported by them.
        const sender = isRelayed(meta, own) ? replyTo : from
        const t = buildIngestedTicket(
          { subject: parsed.subject ?? "", text: parsed.text ?? "", fromName: sender?.name ?? "", fromEmail: sender?.address ?? "" },
          keyword,
        )

        // Reporter: find-or-create a User by the sender's email so the ticket
        // has an owner. Case-insensitively — an exact-match upsert against a
        // lowercased address would give a sender whose row carries capitals a
        // second, parallel account (rule 45).
        const reporter = await resolveUserByEmail(t.reporterEmail, t.reporterName)

        let ticket
        try {
          ticket = await prisma.ticket.create({
            data: {
              subject:      t.subject,
              description:  t.description,
              phone:        t.phone,
              computerName: t.computerName,
              urgency:      t.urgency,
              category:     t.category,
              platform:     t.platform,
              userId:       reporter.id,
              sourceMessageId: messageId,
            },
          })
        } catch (e) {
          // Unique violation on sourceMessageId = a concurrent run already
          // ingested this email. Treat as success, mark seen, move on.
          if (e instanceof Error && "code" in e && (e as { code?: string }).code === "P2002") {
            tally("duplicate")
            await markSeen(uid)
            continue
          }
          throw e
        }

        // Mark processed immediately so an overlapping run can't re-create it.
        await markSeen(uid)

        await prisma.ticketHistory.create({
          data: {
            ticketId:   ticket.id,
            field:      "created",
            newValue:   "פתוח",
            actorName:  t.reporterName,
            actorEmail: t.reporterEmail,
          },
        })

        // The circuit breaker's input: how many OTHER mail tickets this sender
        // opened inside the window — every one of which was offered a reply.
        const recent = await prisma.ticket.count({
          where: {
            id:              { not: ticket.id },
            userId:          reporter.id,
            sourceMessageId: { not: null },
            createdAt:       { gte: new Date(Date.now() - AUTO_RESPOND_WINDOW_MS) },
          },
        })

        const ticketInfo = {
          id: ticket.id, ticketNumber: ticket.ticketNumber,
          subject: t.subject, description: t.description,
          urgency: t.urgency, category: t.category, platform: t.platform,
          phone: t.phone, computerName: t.computerName, status: ticket.status,
          submitterName: t.reporterName, submitterEmail: t.reporterEmail,
        }
        const staffEmails = await getStaffEmails()
        mails.push(sendMail({ to: staffEmails, subject: `פנייה חדשה (מייל) HDTC-${ticket.ticketNumber}: ${t.subject}`, html: mailTicketOpenedStaff(ticketInfo) }))
        if (mayAutoRespond(meta, t.reporterEmail, recent)) {
          mails.push(sendMail({ to: t.reporterEmail, subject: `פנייתך התקבלה — HDTC-${ticket.ticketNumber}`, html: mailTicketOpenedUser(ticketInfo) }))
        }

        tickets.push(ticket.ticketNumber)
      }
    } finally {
      lock.release()
    }
    await client.logout()
    return NextResponse.json({ ok: true, created: tickets.length, tickets, skipped })
  } catch (err) {
    try { await client.logout() } catch { /* already closed */ }
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/ingest-mail POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
