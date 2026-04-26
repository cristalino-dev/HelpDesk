/**
 * lib/workdays.ts — Israeli workday calculation helpers
 *
 * Israeli work week: Sunday (0) through Thursday (4) are workdays.
 * Friday (5) and Saturday (6) are NOT workdays.
 *
 * All functions are pure and side-effect free — safe to use in
 * both server and client code, and easy to unit-test.
 */

/**
 * Count workdays that have elapsed from `from` up to (but not including) `to`.
 * Each day in [from, to) is checked: if it is Sun–Thu it counts as a workday.
 *
 * Examples (Israel calendar):
 *   from = Friday,  to = Sunday  → 0  (Fri + Sat are not workdays)
 *   from = Thursday, to = Sunday → 1  (only Thursday counts)
 *   from = Sunday,  to = Tuesday → 2  (Sunday + Monday)
 */
export function workdaysBetween(from: Date | string, to: Date | string = new Date()): number {
  const start = new Date(from)
  const end   = new Date(to)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  if (start >= end) return 0

  let count = 0
  const d = new Date(start)
  while (d < end) {
    const day = d.getDay()
    if (day !== 5 && day !== 6) count++ // not Friday, not Saturday
    d.setDate(d.getDate() + 1)
  }
  return count
}

/**
 * Convenience wrapper: how many workdays ago was `date`?
 * Returns 0 for dates on or after today's midnight.
 */
export function workdaysAgo(date: Date | string): number {
  return workdaysBetween(date, new Date())
}

/**
 * Format a workday count as a short Hebrew label.
 *   0  → "היום"
 *   1  → "יע 1"
 *   N  → "יע N"
 *
 * "יע" = ימי עסקים (business days)
 */
export function formatWorkdays(n: number): string {
  if (n === 0) return "היום"
  return `יע ${n}`
}

/**
 * Format a workday count as a full Hebrew label.
 *   0  → "היום"
 *   1  → "יום עסקים 1"
 *   N  → "N ימי עסקים"
 */
export function formatWorkdaysFull(n: number): string {
  if (n === 0) return "היום"
  if (n === 1) return "יום עסקים אחד"
  return `${n} ימי עסקים`
}
