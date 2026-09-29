/**
 * lib/ticketSearch.ts — ticket-number aware search helpers
 *
 * Every ticket carries a human-facing label: `HDTC-<ticketNumber>`, or
 * `REQ-<ticketNumber>` for a request (v3.87). Staff quote that label in mail,
 * chat and on the phone, so typing it into any search box must always land on
 * the ticket — even when the current view is scoped to open tickets only, or
 * narrowed by a stat card. Both kinds share one number sequence, so either
 * prefix finds a ticket by its number.
 *
 * The helpers here are pure so the pages (admin queue, staff "all tickets",
 * user dashboard) can share one definition and tests can cover it directly.
 */

/** Accepted forms: `494`, `#494`, `HDTC-494`, `REQ-494`, `hdtc 494`, `req494`, `HDTC_494`. */
const TICKET_NUMBER_QUERY = /^#?\s*(?:(?:hdtc|req)[\s\-_]*)?(\d{1,9})$/i

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
 * The ticket numbers a LIST query names — "133,245", "HDTC-133, REQ-245",
 * "#133; 245" — in the order typed, without repeats. Empty for anything else
 * (v3.96).
 *
 * Staff pull two or three tickets up side by side: the ones a caller quoted,
 * the ones they are about to merge. Each part must be a ticket reference on its
 * own; one part that is not (a comma inside free text — "מדפסת, קומה 2") leaves
 * the whole query to the ordinary text search. A single reference is not a list
 * either — that stays with parseTicketNumberQuery and its suggestion card.
 *
 * @param query  Raw search-box value.
 */
export function parseTicketNumberList(query: string): number[] {
  const parts = query.split(/[,;]/).map(p => p.trim()).filter(p => p !== "")
  if (parts.length < 2) return []
  const numbers: number[] = []
  for (const part of parts) {
    const n = parseTicketNumberQuery(part)
    if (n === null) return []
    if (!numbers.includes(n)) numbers.push(n)
  }
  return numbers
}

/**
 * True when a free-text query matches a ticket's number or its label, under
 * either prefix. Substring based, so `49` matches HDTC-494, and `hdtc-49` and
 * `req-49` match it too.
 *
 * A list query ("133,245") matches the tickets it names and nothing else:
 * substring matching there would pull in HDTC-1330 beside HDTC-133, and
 * somebody naming their tickets wants those tickets.
 *
 * @param ticketNumber  The ticket's numeric id.
 * @param query         Raw search-box value.
 */
export function matchesTicketNumber(ticketNumber: number, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const listed = parseTicketNumberList(q)
  if (listed.length > 0) return listed.includes(ticketNumber)
  if (String(ticketNumber).includes(q)) return true
  const normalized = q.replace(/^#/, "").replace(/[\s_]+/g, "-")
  return normalized.length > 0 && (`hdtc-${ticketNumber}`.includes(normalized) || `req-${ticketNumber}`.includes(normalized))
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
  // A list query ("133,245", and as many more as are typed) is answered with
  // exactly those tickets, in the order they were typed, taken from the whole
  // set: naming tickets outranks the open/closed toggle and the stat card, as
  // naming one always has. A number that matches nothing is simply absent.
  // There is no suggestion card — that card names one ticket (v3.96).
  const listed = parseTicketNumberList(query)
  if (listed.length > 0) {
    const named = listed
      .map(n => tickets.find(t => t.ticketNumber === n))
      .filter((t): t is T => t !== undefined)
    return { list: named, suggestion: null }
  }

  const suggestion = findByTicketNumber(tickets, query)
  if (!suggestion) return { list, suggestion: null }
  const present = list.some(t => t.ticketNumber === suggestion.ticketNumber)
  return { list: present ? list : [suggestion, ...list], suggestion }
}
