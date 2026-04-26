/**
 * lib/staleTicket.ts — Stale ticket detection helpers
 *
 * A ticket is considered "stale" when it has been open (status "פתוח" OR
 * "בטיפול") for more than STALE_WORKDAYS workdays since creation without
 * being closed.  Closed tickets ("סגור") are never stale.
 *
 * Uses Israeli workdays (Sun–Thu); Friday and Saturday do not count.
 * These are pure functions so they can be tested without a running app.
 */

import { workdaysBetween, workdaysAgo } from "@/lib/workdays"

/** Threshold in **workdays** after which an open ticket is considered stale. */
export const STALE_DAYS = 4   // kept as alias for backward-compat with tests
export const STALE_WORKDAYS = 4

/**
 * Returns true when the ticket is not closed and has been open for more than
 * `staleWorkdays` workdays (Sun–Thu).  Both "פתוח" and "בטיפול" can be stale.
 *
 * @param ticket       Object with at least `status` and `createdAt`.
 * @param staleWorkdays  Override the threshold (default 4 workdays).
 */
export function isStaleOpen(
  ticket: { status: string; createdAt: string | Date },
  staleWorkdays: number = STALE_WORKDAYS,
): boolean {
  if (ticket.status === "סגור") return false
  return workdaysAgo(ticket.createdAt) > staleWorkdays
}

/**
 * How many full workdays (Sun–Thu) have passed since `createdAt`.
 * Returns 0 for tickets created today or on the most recent workday still
 * within the same business day.
 */
export function openDays(createdAt: string | Date): number {
  return workdaysBetween(createdAt, new Date())
}
