/**
 * lib/staleTicket.ts — Stale ticket detection helpers
 *
 * A ticket is considered "stale" when it has been open (status "פתוח" OR
 * "בטיפול") for more than STALE_DAYS since creation without being closed.
 * Closed tickets ("סגור") are never stale.
 * These are pure functions so they can be tested without a running app.
 */

/** Threshold in calendar days after which an open ticket is considered stale. */
export const STALE_DAYS = 4

/**
 * Returns true when the ticket is not closed and was created more than
 * `staleDays` days ago.  Both "פתוח" and "בטיפול" tickets can be stale.
 *
 * @param ticket  Object with at least `status` and `createdAt` (ISO string or Date).
 * @param staleDays  Override the default threshold (useful in tests).
 */
export function isStaleOpen(
  ticket: { status: string; createdAt: string | Date },
  staleDays: number = STALE_DAYS,
): boolean {
  if (ticket.status === "סגור") return false
  const ageMs = Date.now() - new Date(ticket.createdAt).getTime()
  return ageMs > staleDays * 24 * 60 * 60 * 1000
}

/**
 * How many full calendar days have passed since `createdAt`.
 * Returns 0 for tickets created today.
 */
export function openDays(createdAt: string | Date): number {
  return Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  )
}
