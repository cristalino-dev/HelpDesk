/**
 * lib/ticketSearch.ts — ticket-number aware search helpers
 *
 * Every ticket carries a human-facing label of the form `HDTC-<ticketNumber>`.
 * Staff quote that label in mail, chat and on the phone, so typing it into any
 * search box must always land on the ticket — even when the current view is
 * scoped to open tickets only, or narrowed by a stat card.
 *
 * The helpers here are pure so the pages (admin queue, staff "all tickets",
 * user dashboard) can share one definition and tests can cover it directly.
 */

/** Accepted forms: `494`, `#494`, `HDTC-494`, `hdtc 494`, `hdtc494`, `HDTC_494`. */
const TICKET_NUMBER_QUERY = /^#?\s*(?:hdtc[\s\-_]*)?(\d{1,9})$/i

/**
 * Returns the ticket number when the whole query is a ticket-number reference,
 * otherwise null (the query is then just free text).
 *
 * @param query  Raw search-box value.
 */
export function parseTicketNumberQuery(query: string): number | null {
  const m = TICKET_NUMBER_QUERY.exec(query.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * True when a free-text query matches a ticket's number or its `HDTC-N` label.
 * Substring based, so `49` matches HDTC-494 and `hdtc-49` matches it too.
 *
 * @param ticketNumber  The ticket's numeric id.
 * @param query         Raw search-box value.
 */
export function matchesTicketNumber(ticketNumber: number, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  if (String(ticketNumber).includes(q)) return true
  const normalized = q.replace(/^#/, "").replace(/[\s_]+/g, "-")
  return normalized.length > 0 && `hdtc-${ticketNumber}`.includes(normalized)
}

/**
 * Finds the ticket whose number the query names exactly. Searches the *whole*
 * ticket set on purpose — status scoping must not hide an exact number hit.
 *
 * @param tickets  Every ticket loaded for the page, unfiltered.
 * @param query    Raw search-box value.
 */
export function findByTicketNumber<T extends { ticketNumber: number }>(
  tickets: T[],
  query: string,
): T | null {
  const n = parseTicketNumberQuery(query)
  if (n === null) return null
  return tickets.find(t => t.ticketNumber === n) ?? null
}

/**
 * Pairs a rendered list with the exact ticket-number match for the query.
 *
 * `suggestion` is the ticket the query names (open or closed, in scope or not)
 * and is surfaced as a suggestion card above the list. It is also prepended to
 * `list` when the active filters had dropped it, so the row is reachable.
 *
 * @param list     The already filtered + sorted list the page would render.
 * @param tickets  Every ticket loaded for the page, unfiltered.
 * @param query    Raw search-box value.
 */
export function withNumberSuggestion<T extends { ticketNumber: number }>(
  list: T[],
  tickets: T[],
  query: string,
): { list: T[]; suggestion: T | null } {
  const suggestion = findByTicketNumber(tickets, query)
  if (!suggestion) return { list, suggestion: null }
  const present = list.some(t => t.ticketNumber === suggestion.ticketNumber)
  return { list: present ? list : [suggestion, ...list], suggestion }
}
