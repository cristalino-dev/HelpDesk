/**
 * lib/mailIngest.ts — Pure helpers for the email-to-ticket pipeline.
 *
 * The IMAP I/O lives in app/api/admin/ingest-mail/route.ts; everything that
 * decides WHETHER an email becomes a ticket and WHAT that ticket looks like is
 * extracted here so it can be unit-tested without a live mailbox.
 *
 * RULES (per product spec):
 *   - An inbound email becomes a ticket only if the keyword (default "ticket")
 *     appears in the SUBJECT (case-insensitive).
 *   - The ticket subject = the email subject with the keyword removed + tidied.
 *   - The ticket description = the email's plain-text body.
 *   - Ingested tickets are created URGENT (urgency "דחוף") with default
 *     category/platform and an empty phone/computerName.
 */

export const DEFAULT_TICKET_KEYWORD = "ticket"

/** Default values applied to every email-ingested ticket. */
export const INGEST_DEFAULTS = {
  urgency:  "דחוף",        // urgent — per spec
  category: "אחר",         // "other"
  platform: "מחשב אישי",   // "personal computer"
} as const

/** Fallback address used when the sender address cannot be determined. */
export const INGEST_FALLBACK_EMAIL = "mail-ingest@cristalino.co.il"

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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
 * Caller is responsible for first checking hasTicketKeyword().
 */
export function buildIngestedTicket(mail: ParsedMail, keyword: string = DEFAULT_TICKET_KEYWORD): IngestedTicket {
  const subject = stripTicketKeyword(mail.subject, keyword) || "פנייה מהמייל"
  const description = mail.text?.trim() || "(לא צורף תוכן להודעה)"
  const reporterEmail = (mail.fromEmail ?? "").trim().toLowerCase() || INGEST_FALLBACK_EMAIL
  const reporterName = mail.fromName?.trim() || (mail.fromEmail ?? "").trim() || "שולח לא ידוע"

  return {
    subject,
    description,
    urgency:  INGEST_DEFAULTS.urgency,
    category: INGEST_DEFAULTS.category,
    platform: INGEST_DEFAULTS.platform,
    phone: "",
    computerName: "",
    reporterEmail,
    reporterName,
  }
}
