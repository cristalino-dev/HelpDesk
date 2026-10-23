/**
 * lib/internalPriority.ts — the helpdesk's own urgency for a ticket (v3.107).
 *
 * The urgency a ticket already carries is the REPORTER's: whoever opened it
 * picks נמוך…דחוף, and everybody picks דחוף. The team needed a ranking of its
 * own, set by staff, that says how bad the problem really is — an outage that
 * stops a branch is not the same as a slow printer, however both were filed —
 * and a shorter SLA for the bad end of it.
 *
 *   • Five levels, P1 (משביתה) to P5 (נמוכה). A ticket nobody has classified
 *     yet has none (null), and keeps the SLA of its type, exactly as before.
 *   • Each level has its own SLA, in HOURS, because an outage is measured in
 *     hours and a request in days. Admins change them (lib/sla.ts stores them).
 *   • The clock runs on Sunday–Thursday only, around the clock, like the
 *     workdays in lib/workdays.ts: Friday and Saturday do not count. 24 hours
 *     on it is one workday, so "4 workdays" and "96 hours" are the same target.
 *     It counts real elapsed time, so the night the clocks go back is an hour
 *     longer on it, as it is for whoever is waiting.
 *   • A parked ticket (בהמתנה, ממתין לגורם חיצוני) is never overdue — the same
 *     rule the stale marker keeps (lib/ticketStatus.ts pausesTheClock()).
 *
 * STAFF ONLY. The reporter never sees it: every route that answers a user
 * strips the field and its history rows (hideInternal(), isInternalHistory()).
 * A user who learned their outage was filed as P5 would be right to be upset,
 * and that is a conversation for a person to have, not a field to leak.
 *
 * Client-safe: plain data and functions, no Prisma.
 */

import { pausesTheClock } from "@/lib/ticketStatus"
import { workdaysBetween } from "@/lib/workdays"
import { slaFor, DEFAULT_SLA, type Sla } from "@/lib/ticketType"

export const INTERNAL_PRIORITIES = ["P1", "P2", "P3", "P4", "P5"] as const

export type InternalPriority = (typeof INTERNAL_PRIORITIES)[number]

/** The history row's `field` when the level changes. Staff-only, like the value. */
export const PRIORITY_HISTORY_FIELD = "internalPriority"

/** How each level is named on screen, and the line that says when to use it. */
export const PRIORITY_INFO: Record<InternalPriority, { name: string; hint: string }> = {
  P1: { name: "משביתה", hint: "העבודה נעצרה — מערכת, סניף או מחלקה שלמה מושבתים" },
  P2: { name: "קריטית", hint: "עובד או צוות לא יכולים לעבוד, ואין מעקף" },
  P3: { name: "גבוהה",  hint: "פוגעת בעבודה, אבל יש מעקף זמני" },
  P4: { name: "רגילה",  hint: "תקלה או בקשה שלא עוצרת עבודה" },
  P5: { name: "נמוכה",  hint: "שיפור, שאלה או נוחות — כשמתפנה זמן" },
}

/** What a ticket nobody has classified yet is called. */
export const UNCLASSIFIED_LABEL = "לא סווג"

/** "P1 · משביתה" — the level as a pill or an option reads. */
export function priorityLabel(p: InternalPriority): string {
  return `${p} · ${PRIORITY_INFO[p].name}`
}

/** A level from anywhere — a body, a query, a row — or null when it is not one. */
export function normalizePriority(value: unknown): InternalPriority | null {
  if (typeof value !== "string") return null
  const v = value.trim().toUpperCase()
  return (INTERNAL_PRIORITIES as readonly string[]).includes(v) ? (v as InternalPriority) : null
}

/** 1 for P1 … 5 for P5, and 6 for a ticket not classified yet — it sorts last. */
export function priorityRank(value: unknown): number {
  const p = normalizePriority(value)
  return p ? INTERNAL_PRIORITIES.indexOf(p) + 1 : INTERNAL_PRIORITIES.length + 1
}

// ── SLA ─────────────────────────────────────────────────────────────────────

/** Hours on the Sunday–Thursday clock a ticket of each level may stay open. */
export type PrioritySla = Record<InternalPriority, number>

/**
 * The defaults: an outage in 4 hours, a blocked worker in a working day's 8,
 * then 2, 4 and 10 workdays. P4 matches the ordinary ticket SLA and P5 the
 * request SLA (lib/ticketType.ts), so classifying a ticket as ordinary changes
 * nothing about when it goes overdue.
 */
export const DEFAULT_PRIORITY_SLA: PrioritySla = { P1: 4, P2: 8, P3: 48, P4: 96, P5: 240 }

export const PRIORITY_SLA_MIN_HOURS = 1
/** Sixty workdays, the same ceiling as the per-type SLA. */
export const PRIORITY_SLA_MAX_HOURS = 60 * 24

/** One admin-entered value, or null when it is not a whole number of hours in range. */
export function parseSlaHours(value: unknown): number | null {
  const n = typeof value === "number" ? value
    : typeof value === "string" && value.trim() !== "" ? Number(value)
    : NaN
  return Number.isInteger(n) && n >= PRIORITY_SLA_MIN_HOURS && n <= PRIORITY_SLA_MAX_HOURS ? n : null
}

const HOUR_MS = 60 * 60 * 1000

/** Sunday–Thursday. Friday (5) and Saturday (6) are not on the clock. */
function onTheClock(d: Date): boolean {
  const day = d.getDay()
  return day !== 5 && day !== 6
}

function nextMidnight(d: Date): Date {
  const n = new Date(d)
  n.setHours(0, 0, 0, 0)
  n.setDate(n.getDate() + 1)
  return n
}

/** Hours between two moments that fall on Sunday–Thursday. Fractional; 0 when `to` is not after `from`. */
export function workHoursBetween(from: Date | string, to: Date | string = new Date()): number {
  const end = new Date(to).getTime()
  let cursor = new Date(from)
  let ms = 0
  while (cursor.getTime() < end) {
    const dayEnd = nextMidnight(cursor)
    if (onTheClock(cursor)) ms += Math.min(dayEnd.getTime(), end) - cursor.getTime()
    cursor = dayEnd
  }
  return ms / HOUR_MS
}

/** The moment `hours` on the Sunday–Thursday clock have passed since `from`. */
export function slaDeadline(from: Date | string, hours: number): Date {
  let cursor = new Date(from)
  let left = hours * HOUR_MS
  for (;;) {
    const dayEnd = nextMidnight(cursor)
    if (onTheClock(cursor)) {
      const room = dayEnd.getTime() - cursor.getTime()
      if (left <= room) return new Date(cursor.getTime() + left)
      left -= room
    }
    cursor = dayEnd
  }
}

/** "4 שעות", "יום עבודה", "10 ימי עבודה" — an SLA target as the settings show it. */
export function formatSlaHours(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24
    return days === 1 ? "יום עבודה" : `${days} ימי עבודה`
  }
  return hours === 1 ? "שעה" : `${hours} שעות`
}

/** "3 ש׳", "2 ימים", "פחות משעה" — a stretch of time on the clock, for a row. */
export function formatClockSpan(hours: number): string {
  const h = Math.abs(hours)
  if (h < 1) return "פחות משעה"
  if (h < 24) return `${Math.floor(h)} ש׳`
  const days = Math.floor(h / 24)
  return days === 1 ? "יום" : `${days} ימים`
}

export interface SlaState {
  /** Parked or closed: the clock is not running. */
  paused: boolean
  overdue: boolean
  /** Hours left on a classified ticket's clock (negative once overdue); null when unclassified. */
  remainingHours: number | null
}

type ClockTicket = { status: string; createdAt: string | Date; type?: string | null; internalPriority?: string | null }

/**
 * Where a ticket stands against its SLA: its level's, in hours, when staff
 * classified it; its type's, in workdays, when they have not — which is what
 * every queue showed before v3.107.
 */
export function slaState(
  ticket: ClockTicket,
  sla: Sla = DEFAULT_SLA,
  prioritySla: PrioritySla = DEFAULT_PRIORITY_SLA,
  now: Date = new Date(),
): SlaState {
  const paused = pausesTheClock(ticket.status)
  const p = normalizePriority(ticket.internalPriority)
  // isStaleOpen()'s rule, measured to `now` rather than to the wall clock.
  if (!p) return { paused, overdue: !paused && workdaysBetween(ticket.createdAt, now) > slaFor(ticket.type, sla), remainingHours: null }
  const remainingHours = prioritySla[p] - workHoursBetween(ticket.createdAt, now)
  return { paused, overdue: !paused && remainingHours < 0, remainingHours }
}

/** The overdue marker every staff queue draws. */
export function isOverdue(ticket: ClockTicket, sla?: Sla, prioritySla?: PrioritySla, now?: Date): boolean {
  return slaState(ticket, sla, prioritySla, now).overdue
}

// ── Keeping it from users ───────────────────────────────────────────────────

/** A ticket without the field, for anyone who is not staff. */
export function hideInternal<T extends object>(ticket: T): T {
  if (!("internalPriority" in ticket)) return ticket
  const copy = { ...ticket } as Record<string, unknown>
  delete copy.internalPriority
  return copy as T
}

/** True for a history row only staff may read. */
export function isInternalHistory(row: { field: string }): boolean {
  return row.field === PRIORITY_HISTORY_FIELD
}
