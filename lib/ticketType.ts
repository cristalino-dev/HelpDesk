/**
 * lib/ticketType.ts — a ticket is a fault or a request (v3.87).
 *
 * The user asked for a second kind of ticket: a REQUEST — something wanted, a
 * new account, a second screen, a licence — beside the ordinary TICKET, which
 * is something broken. Both share one number sequence. What follows the type:
 *
 *   • the label — HDTC-N for a ticket, REQ-N for a request;
 *   • the SLA — the workdays after which an open one counts as overdue
 *     (defaults 4 and 10, changed by admins; lib/sla.ts stores them);
 *   • the place in the queue — requests are listed in their own section,
 *     below the tickets.
 *
 * Client-safe: plain data and functions, no Prisma. Anything that is not
 * exactly "request" is a ticket, which is what every row from before v3.87 is.
 */

export type TicketType = "ticket" | "request"

export const TICKET_TYPES: readonly TicketType[] = ["ticket", "request"]

/** How the type is named on screen. */
export const TYPE_LABEL: Record<TicketType, string> = { ticket: "תקלה", request: "בקשה" }

/** One line under each choice in the forms. */
export const TYPE_HINT: Record<TicketType, string> = {
  ticket:  "משהו לא עובד — מחשב, מדפסת, רשת, תוכנה",
  request: "משהו שצריך — ציוד, הרשאה, חשבון, התקנה",
}

/** The label's prefix. */
export const TYPE_PREFIX: Record<TicketType, string> = { ticket: "HDTC", request: "REQ" }

export function normalizeType(value: unknown): TicketType {
  return typeof value === "string" && value.trim().toLowerCase() === "request" ? "request" : "ticket"
}

export function isRequest(t: { type?: string | null }): boolean {
  return normalizeType(t.type) === "request"
}

/** "HDTC-597" or "REQ-601" — what people read, type and say. */
export function ticketLabel(t: { ticketNumber: number; type?: string | null }): string {
  return `${TYPE_PREFIX[normalizeType(t.type)]}-${t.ticketNumber}`
}

/**
 * A reference from a URL or an API path — "HDTC-597", "REQ-601", or a raw id —
 * as a Prisma where-clause. Either prefix finds the ticket by its number, so a
 * request someone calls HDTC-601, or an old link, still opens.
 */
export function ticketRefWhere(ref: string): { ticketNumber: number } | { id: string } {
  const m = /^(?:hdtc|req)-(\d{1,9})$/i.exec(ref.trim())
  return m ? { ticketNumber: Number(m[1]) } : { id: ref }
}

/**
 * Why a merged ticket refuses a change (v3.92): it is frozen, and the
 * conversation goes on in the ticket it was merged into. One sentence for every
 * route that refuses, so the page can show it as it is.
 */
export function mergedError(into: { ticketNumber: number; type?: string | null }): string {
  return `הפנייה מוזגה ל-${ticketLabel(into)} — ההמשך בפנייה ${ticketLabel(into)}`
}

/** Tickets first, then requests, each in the order given — a queue's two sections. */
export function splitByType<T extends { type?: string | null }>(list: readonly T[]): { tickets: T[]; requests: T[] } {
  const tickets: T[] = []
  const requests: T[] = []
  for (const t of list) (isRequest(t) ? requests : tickets).push(t)
  return { tickets, requests }
}

/** The id of the marker withRequestsDivider() puts between a queue's two sections. */
export const REQUESTS_DIVIDER_ID = "__requests-divider__"

/**
 * A list as a queue shows it: its tickets, then — when there are any — a
 * marker, then its requests, each part in the order it was given. The page
 * renders the marker as <RequestsDivider/> (see isRequestsDivider) and every
 * other item as the row it always rendered, so the user's "requests lower
 * down, separated" needs no second copy of any row.
 */
export function withRequestsDivider<T extends { id: string; type?: string | null }>(list: readonly T[]): T[] {
  const { tickets, requests } = splitByType(list)
  if (requests.length === 0) return tickets
  return [...tickets, { id: REQUESTS_DIVIDER_ID, type: "divider" } as unknown as T, ...requests]
}

export function isRequestsDivider(t: { id: string }): boolean {
  return t.id === REQUESTS_DIVIDER_ID
}

// ── SLA ─────────────────────────────────────────────────────────────────────

/** Workdays (Sun–Thu) an open one may stay open before it is overdue. */
export type Sla = Record<TicketType, number>

/** The user's numbers (2026-09-14): a fault in 4 workdays, a request in 10. */
export const DEFAULT_SLA: Sla = { ticket: 4, request: 10 }

export const SLA_MIN_WORKDAYS = 1
export const SLA_MAX_WORKDAYS = 60

export function slaFor(type: string | null | undefined, sla: Sla = DEFAULT_SLA): number {
  return sla[normalizeType(type)]
}

/** One admin-entered value, or null when it is not a whole number of workdays in range. */
export function parseSlaWorkdays(value: unknown): number | null {
  const n = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value)
    : NaN
  return Number.isInteger(n) && n >= SLA_MIN_WORKDAYS && n <= SLA_MAX_WORKDAYS ? n : null
}
