/**
 * lib/mailIngest.ts — Pure helpers for the email-to-ticket pipeline.
 *
 * The IMAP I/O lives in app/api/admin/ingest-mail/route.ts. Everything that
 * decides WHETHER an email becomes a ticket, WHAT that ticket looks like, and
 * WHETHER its sender gets an automatic reply is here, so it can be unit-tested
 * without a live mailbox.
 *
 * RULES (v3.82 — "every mail that goes to helpdesk@ opens a ticket")
 * ─────────────────────────────────────────────────────────────────
 * Every inbound email becomes a ticket, except mail that is machinery rather
 * than a person writing in — see skipReason():
 *
 *   • Received before INGEST_START (override: INGEST_SINCE). The inbox held
 *     929 unread messages when this shipped. Without a cutoff the first run
 *     would have opened 929 tickets and emailed every one of their senders.
 *
 *   • From our own address. The app mails helpdesk@ itself — a status change
 *     on a ticket assigned to helpdesk@, which is the default assignee — and
 *     Gmail files self-sent mail in the inbox. Ingesting it opens a ticket
 *     "from" helpdesk@, whose confirmation goes back to helpdesk@, which opens
 *     another: every two minutes, with no end. Until v3.81 the subject keyword
 *     was the only thing standing between this app and that loop.
 *
 *   • A bounce, or an auto-reply (RFC 3834 Auto-Submitted, X-Autoreply …). An
 *     out-of-office answering our confirmation is the same loop with somebody
 *     else's mailbox in the middle.
 *
 * The subject keyword (default "ticket") no longer decides WHETHER. It still
 * decides URGENCY: someone who writes "ticket" in the subject gets the urgent
 * ticket that always meant; anyone else gets the default a web-form ticket
 * gets. Otherwise a one-word "thanks" reply would jump the whole queue.
 *
 * The automatic "your request was received" reply is held to a stricter
 * standard than ingestion — see mayAutoRespond(). It never goes to a mailing
 * list or bulk mail, a no-reply address, or a sender that asked for none; and
 * it stops after AUTO_RESPOND_MAX_PER_SENDER replies to one sender inside
 * AUTO_RESPOND_WINDOW_MS. That last rule is the circuit breaker for an
 * auto-responder that does not label itself: stop answering, and the loop has
 * nothing left to feed on.
 */

export const DEFAULT_TICKET_KEYWORD = "ticket"

/** The helpdesk mailbox — also the From: of every mail this app sends. */
export const HELPDESK_ADDRESS = "helpdesk@cristalino.co.il"

/**
 * Mail received before this instant is never ingested automatically. It is the
 * day "every mail opens a ticket" was built; the 929-message backlog is older.
 * INGEST_SINCE (an ISO date-time) overrides it, for reaching back on purpose.
 */
export const INGEST_START = "2026-09-14T00:00:00+03:00"

/**
 * Most tickets one run may open. Anything beyond it stays unread and is picked
 * up two minutes later — so a misconfigured INGEST_SINCE throttles itself
 * instead of opening hundreds of tickets in one pass.
 */
export const MAX_PER_RUN = 25

/** The sender-reply circuit breaker: at most this many … */
export const AUTO_RESPOND_MAX_PER_SENDER = 3
/** … automatic replies to one sender inside this window. */
export const AUTO_RESPOND_WINDOW_MS = 10 * 60 * 1000

/** Urgency for mail that asks for it — the keyword's meaning since v3.34. */
export const KEYWORD_URGENCY = "דחוף"

/** Default values applied to every email-ingested ticket. */
export const INGEST_DEFAULTS = {
  urgency:  "בינוני",      // the same default as a web-form ticket
  category: "אחר",         // "other"
  platform: "מחשב אישי",   // "personal computer"
} as const

/** Fallback address used when the sender address cannot be determined. */
export const INGEST_FALLBACK_EMAIL = "mail-ingest@cristalino.co.il"

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Some mail clients (notably Outlook) label Hebrew bodies as `iso-8859-8-i`
 * or `iso-8859-8-e` — the `-i`/`-e` suffix only describes bidi display order,
 * not the byte encoding. iconv-lite / mailparser don't recognise the suffix
 * and fail to decode, producing replacement characters (gibberish Hebrew).
 *
 * The underlying bytes are plain ISO-8859-8 / windows-1255, so we relabel the
 * charset to `windows-1255` (a superset that iconv-lite decodes correctly)
 * before parsing. We operate on the raw RFC822 bytes via latin1, which
 * round-trips every byte exactly, so non-header content (e.g. base64
 * attachments) is left untouched.
 */
export function fixCharsetLabels(source: Buffer): Buffer {
  const s = source.toString("latin1")
  const fixed = s.replace(/charset\s*=\s*"?(iso-8859-8-[ie])"?/gi, 'charset="windows-1255"')
  return fixed === s ? source : Buffer.from(fixed, "latin1")
}

/** True if `subject` contains `keyword` (case-insensitive substring match). */
export function hasTicketKeyword(subject: string | null | undefined, keyword: string = DEFAULT_TICKET_KEYWORD): boolean {
  if (!subject || !keyword) return false
  return subject.toLowerCase().includes(keyword.toLowerCase())
}

/**
 * Remove every (case-insensitive) occurrence of `keyword` from `subject`,
 * collapse the resulting whitespace, and trim stray leading/trailing
 * separators (": - – — |"). Returns "" if nothing meaningful is left.
 */
export function stripTicketKeyword(subject: string | null | undefined, keyword: string = DEFAULT_TICKET_KEYWORD): string {
  if (!subject) return ""
  const re = new RegExp(escapeRegex(keyword), "ig")
  return subject
    .replace(re, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:\-–—|]+|[\s:\-–—|]+$/g, "")
    .trim()
}

// ── Which mail to take ──────────────────────────────────────────────────────

/** The cutoff: INGEST_SINCE when it parses, INGEST_START otherwise. */
export function ingestSince(configured?: string | null): Date {
  const fallback = new Date(INGEST_START)
  if (!configured) return fallback
  const d = new Date(configured)
  return Number.isNaN(d.getTime()) ? fallback : d
}

/**
 * Every address mail from this app can arrive from: whatever it authenticates
 * as (SMTP_USER), whatever it writes in From: (the no-reply sender since
 * v3.82), and the helpdesk mailbox itself, always. Every address on this
 * Workspace also answers at @finegold.co.il, so each gets its twin.
 */
export function ownAddresses(...addresses: (string | null | undefined)[]): string[] {
  const base = [...addresses, HELPDESK_ADDRESS]
    .map(a => (a ?? "").trim().toLowerCase())
    .filter(a => a.includes("@"))
  const twins = base
    .filter(a => a.endsWith("@cristalino.co.il"))
    .map(a => a.replace(/@cristalino\.co\.il$/, "@finegold.co.il"))
  return [...new Set([...base, ...twins])]
}

/** One raw header, as mailparser's `headerLines` gives it: lowercased key. */
export interface HeaderLine { key: string; line: string }

/**
 * The value of a raw header, unfolded, or "" when absent. Reading the raw line
 * rather than mailparser's structured `headers` map keeps this independent of
 * how mailparser chooses to model any particular header.
 */
export function headerValue(lines: readonly HeaderLine[] | null | undefined, key: string): string {
  const hit = (lines ?? []).find(h => h.key.toLowerCase() === key.toLowerCase())
  if (!hit) return ""
  const unfolded = hit.line.replace(/\r?\n[ \t]+/g, " ")
  const colon = unfolded.indexOf(":")
  return (colon === -1 ? "" : unfolded.slice(colon + 1)).trim()
}

/** What the rules below need to know about one inbound email. */
export interface InboundMeta {
  fromEmail: string            // lowercased, "" when unknown
  subject: string
  receivedAt: Date | null      // IMAP internal date — when it reached the mailbox
  autoSubmitted: string        // RFC 3834
  precedence: string
  contentType: string
  listId: string
  autoResponseSuppress: string // Exchange's X-Auto-Response-Suppress
  xAutoreply: boolean          // X-Autoreply / X-Autorespond present at all
  replyTo: string              // lowercased Reply-To address, "" when none
}

export function inboundMeta(
  fromEmail: string | null | undefined,
  subject: string | null | undefined,
  receivedAt: Date | null | undefined,
  lines: readonly HeaderLine[] | null | undefined,
  replyTo?: string | null,
): InboundMeta {
  return {
    replyTo: (replyTo ?? "").trim().toLowerCase(),
    fromEmail: (fromEmail ?? "").trim().toLowerCase(),
    subject: subject ?? "",
    receivedAt: receivedAt ?? null,
    autoSubmitted:        headerValue(lines, "auto-submitted"),
    precedence:           headerValue(lines, "precedence"),
    contentType:          headerValue(lines, "content-type"),
    listId:               headerValue(lines, "list-id"),
    autoResponseSuppress: headerValue(lines, "x-auto-response-suppress"),
    xAutoreply: !!(headerValue(lines, "x-autoreply") || headerValue(lines, "x-autorespond")),
  }
}

/** Why a message is not a person writing in. */
export type SkipReason = "before-start" | "own-address" | "bounce" | "auto-reply"

/**
 * Mail this app RELAYED on a person's behalf: it comes from one of our own
 * addresses but carries a Reply-To naming somebody else. Today that is the
 * "צרו קשר" form, which mails helpdesk@ as the system, with the employee in
 * Reply-To. It is a person writing in, so it becomes a ticket — reported by
 * the Reply-To, not by us.
 *
 * Never true for our automated mail: sendMail() sets no Reply-To, and it marks
 * everything it sends Auto-Submitted, which this refuses as well — so the loop
 * guard does not rest on any single header.
 */
export function isRelayed(m: InboundMeta, own: readonly string[]): boolean {
  if (!m.fromEmail || !own.includes(m.fromEmail)) return false
  if (!m.replyTo.includes("@") || own.includes(m.replyTo)) return false
  const auto = m.autoSubmitted.toLowerCase()
  return !(auto && auto !== "no") && !m.xAutoreply
}

/**
 * Null when the message should become a ticket; otherwise why it should not.
 *
 * A message with no receive date is not treated as "before start": the IMAP
 * search already filtered by date, so at worst this admits one from the
 * cutoff's own day — never the backlog.
 */
export function skipReason(m: InboundMeta, opts: { since: Date; own: readonly string[] }): SkipReason | null {
  if (m.receivedAt && m.receivedAt.getTime() < opts.since.getTime()) return "before-start"
  if (m.fromEmail && opts.own.includes(m.fromEmail) && !isRelayed(m, opts.own)) return "own-address"

  const local = m.fromEmail.split("@")[0]
  if (local === "mailer-daemon" || local === "postmaster") return "bounce"
  if (/multipart\/report/i.test(m.contentType) && /delivery-status/i.test(m.contentType)) return "bounce"

  const auto = m.autoSubmitted.toLowerCase()
  if ((auto && auto !== "no") || m.xAutoreply || m.precedence.toLowerCase() === "auto_reply") return "auto-reply"

  return null
}

// ── Whether to answer the sender ────────────────────────────────────────────

/** noreply@, no-reply@, donotreply@, notifications-noreply@ … */
export function isNoReplyAddress(address: string | null | undefined): boolean {
  const local = (address ?? "").split("@")[0].toLowerCase()
  return /no[-_.]?reply|do[-_.]?not[-_.]?reply/.test(local)
}

/**
 * Whether the sender should get the automatic "received" reply. Our reply is
 * itself an auto-response, so RFC 3834 applies to it: not to lists or bulk
 * mail, not to a sender who asked for none — and, beyond the RFC, not to an
 * address that cannot read it, nor past the per-sender budget.
 *
 * @param recipient    who the reply would go to — the From, or for relayed
 *                     mail the Reply-To. The address rules apply to it; the
 *                     header rules apply to the message.
 * @param sentRecently automatic replies this sender has already had inside
 *                     AUTO_RESPOND_WINDOW_MS — the circuit breaker's input.
 */
export function mayAutoRespond(m: InboundMeta, recipient: string | null | undefined, sentRecently: number): boolean {
  const to = (recipient ?? "").trim().toLowerCase()
  if (!to.includes("@") || to === INGEST_FALLBACK_EMAIL) return false
  if (["bulk", "list", "junk"].includes(m.precedence.toLowerCase())) return false
  if (m.listId) return false
  if (isNoReplyAddress(to)) return false
  if (/\b(all|autoreply)\b/i.test(m.autoResponseSuppress)) return false
  if (sentRecently >= AUTO_RESPOND_MAX_PER_SENDER) return false
  return true
}

// ── What the ticket looks like ──────────────────────────────────────────────

export interface ParsedMail {
  subject?: string | null
  text?: string | null
  fromName?: string | null
  fromEmail?: string | null
}

export interface IngestedTicket {
  subject: string
  description: string
  urgency: string
  category: string
  platform: string
  phone: string
  computerName: string
  reporterEmail: string
  reporterName: string
}

/**
 * Map a parsed inbound email to the ticket fields we will persist.
 *
 * Whether it should become a ticket at all is skipReason()'s question, not
 * this one's. The keyword, if present, is still stripped from the subject and
 * makes the ticket urgent — see the header.
 */
export function buildIngestedTicket(mail: ParsedMail, keyword: string = DEFAULT_TICKET_KEYWORD): IngestedTicket {
  const subject = stripTicketKeyword(mail.subject, keyword) || "פנייה מהמייל"
  const description = mail.text?.trim() || "(לא צורף תוכן להודעה)"
  const reporterEmail = (mail.fromEmail ?? "").trim().toLowerCase() || INGEST_FALLBACK_EMAIL
  const reporterName = mail.fromName?.trim() || (mail.fromEmail ?? "").trim() || "שולח לא ידוע"

  return {
    subject,
    description,
    urgency:  hasTicketKeyword(mail.subject, keyword) ? KEYWORD_URGENCY : INGEST_DEFAULTS.urgency,
    category: INGEST_DEFAULTS.category,
    platform: INGEST_DEFAULTS.platform,
    phone: "",
    computerName: "",
    reporterEmail,
    reporterName,
  }
}
