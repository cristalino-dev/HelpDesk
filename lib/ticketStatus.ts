/**
 * lib/ticketStatus.ts — the statuses a ticket can be in
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The list used to be typed out in seven places — the detail page, the staff
 * queue, the admin console twice, the v1 validator, the OpenAPI document and
 * the pill colours — and two of those had already drifted (the staff queue
 * offered three of the four). Adding "ממתין לגורם חיצוני" in v3.103 would have
 * meant finding all of them and getting it right seven times, so the list
 * lives here now and they import it.
 *
 * `lib/theme.ts` keeps the colours, because a status without a pill colour
 * renders as unstyled text; `STATUS_TOKENS` there is checked against this
 * list by `__tests__/ticketStatus.test.ts`.
 */

/** Waiting on somebody outside Cristalino — a supplier, a carrier (v3.103). */
export const WAITING_EXTERNAL = "ממתין לגורם חיצוני"

/** Waiting on us, for a reason the staff member has to state. */
export const ON_HOLD = "בהמתנה"

export const CLOSED = "סגור"

/**
 * Every legal status, in lifecycle order. The order is what the dropdowns and
 * the filter rows render in, so it is the reading order of the lifecycle and
 * not alphabetical.
 */
export const STATUSES = ["פתוח", "בטיפול", ON_HOLD, WAITING_EXTERNAL, CLOSED] as const

export type TicketStatus = (typeof STATUSES)[number]

/** True for a status where the ticket is parked rather than being worked. */
export function isWaiting(status: string): boolean {
  return status === ON_HOLD || status === WAITING_EXTERNAL
}

/**
 * True when a ticket in this status is not something we are being slow about.
 *
 * The stale report measures OUR response time, and a ticket sitting with
 * Reline is not waiting on us — counting it would make the queue look
 * neglected for work somebody else has not returned.
 */
export function pausesTheClock(status: string): boolean {
  return isWaiting(status) || status === CLOSED
}
