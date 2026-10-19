/**
 * lib/reline.ts — escalating a ticket to Reline, and reading their answer
 *
 * Reline is an outside supplier. Staff forward a ticket to their support
 * address; Reline's system answers with an acknowledgement whose subject
 * carries THEIR case number:
 *
 *   Subject: פנייתך התקבלה בהצלחה: תקלה בשליחת זימונים [#269311]
 *   From:    Reline Support <support@reline.co.il>
 *
 * That number is what someone needs when they phone Reline about the case, so
 * it has to end up on the ticket and in every list that shows tickets.
 *
 * ── HOW THE ANSWER FINDS ITS WAY BACK ────────────────────────────────────
 * Reline echo our subject, so we put our own label in it on the way out:
 * `[HDTC-862] המדפסת לא עובדת`. Their reply then carries both numbers — ours
 * to know which ticket it belongs to, theirs to record — and neither has to be
 * guessed from matching subject text.
 *
 * This module is pure. No database, no network: everything here can be read
 * off a string, which is what makes the matching testable.
 */

/** Where an escalation goes. A constant — never taken from a ticket. */
export const RELINE_EMAIL = "support@reline.co.il"

/** Their acknowledgements come from this domain; anything else is not theirs. */
export const RELINE_DOMAIN = "reline.co.il"

/** True when an inbound address belongs to Reline. */
export function isRelineSender(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf("@")
  if (at === -1) return false
  const domain = email.trim().toLowerCase().slice(at + 1)
  return domain === RELINE_DOMAIN || domain.endsWith(`.${RELINE_DOMAIN}`)
}

/**
 * The subject we send, carrying our own label so their reply can be matched.
 * `label` is `ticketLabel(ticket)` — HDTC-N or REQ-N.
 */
export function relineSubject(label: string, subject: string): string {
  return `[${label}] ${subject}`
}

/**
 * Reads Reline's case number out of their subject line.
 *
 * Accepts `[#269311]`, `[ #269311 ]` and `#269311` on its own, because a
 * mail system that reformats a subject will not warn us first. The number is
 * returned as a string: it is an identifier, not an amount, and leading zeros
 * in someone else's numbering are theirs to keep.
 *
 * When a subject carries more than one, the LAST wins — their acknowledgement
 * quotes our subject first, and a forwarded chain can accumulate others.
 */
export function parseRelineRef(subject: string): string | null {
  const matches = [...String(subject ?? "").matchAll(/#\s*(\d{3,12})\b/g)]
  if (matches.length === 0) return null
  return matches[matches.length - 1][1]
}

/** How the reference reads wherever it is shown. */
export function relineLabel(ref: string): string {
  return `Reline #${ref}`
}

/** The contact Reline should call about this ticket. */
export interface RelineContact {
  name: string
  email: string
  phone: string
}

/**
 * Who to contact, assembled from the ticket and its owner.
 *
 * A full name is always sent, because "call 050-…" with no name is not a
 * contact. The phone on the ticket wins over the one on the profile: it is
 * what the person typed when they reported THIS problem.
 */
export function relineContact(ticket: {
  phone?: string | null
  user?: { name?: string | null; email?: string | null; phone?: string | null } | null
}): RelineContact {
  const user = ticket.user ?? null
  const email = (user?.email ?? "").trim()
  return {
    name: (user?.name ?? "").trim() || email.split("@")[0] || "משתמש",
    email,
    phone: (ticket.phone ?? "").trim() || (user?.phone ?? "").trim(),
  }
}
