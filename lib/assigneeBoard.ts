/**
 * lib/assigneeBoard.ts — the open tickets, by who holds them (v3.107).
 *
 * The admin console's "לפי מטפל" tab: one lane per helpdesk member with the
 * open tickets assigned to them, filtered by assignee first and then by the
 * reporter's urgency and the internal priority, and ranked by the internal
 * priority. The page draws it; the decisions are here, so they can be tested
 * without one.
 *
 * Ranking, within a lane:
 *   1. internal priority, P1 first — a ticket nobody classified yet comes
 *      after P5, and the page marks it, so triage has somewhere to look;
 *   2. among classified tickets of one level, the least time left on the SLA
 *      clock first, so an overdue ticket leads; a parked one (its clock
 *      stopped) goes after the running ones of its level;
 *   3. among unclassified ones, the reporter's urgency, then the oldest first —
 *      the order the queue has always used.
 *
 * Client-safe: no Prisma.
 */

import { CLOSED } from "@/lib/ticketStatus"
import { DEFAULT_SLA, type Sla } from "@/lib/ticketType"
import {
  DEFAULT_PRIORITY_SLA, INTERNAL_PRIORITIES, normalizePriority, priorityRank, slaState,
  type InternalPriority, type PrioritySla,
} from "@/lib/internalPriority"

export interface BoardTicket {
  id: string
  status: string
  urgency: string
  assignedTo: string
  createdAt: string | Date
  type?: string | null
  internalPriority?: string | null
  mergedIntoId?: string | null
}

/** "none" picks the tickets nobody has classified yet. */
export type PriorityFilter = InternalPriority | "none"

export interface BoardFilters {
  /** An assignee's address; null for everyone. "" is the unassigned. */
  assignee: string | null
  /** Reporter urgencies to keep; empty keeps all. */
  urgencies: string[]
  /** Internal priorities to keep; empty keeps all. */
  priorities: PriorityFilter[]
  /** Only the tickets past their SLA. */
  overdueOnly: boolean
}

export const NO_FILTERS: BoardFilters = { assignee: null, urgencies: [], priorities: [], overdueOnly: false }

export interface BoardClock {
  sla: Sla
  prioritySla: PrioritySla
  now: Date
}

export const defaultClock = (): BoardClock => ({ sla: DEFAULT_SLA, prioritySla: DEFAULT_PRIORITY_SLA, now: new Date() })

const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }

/** Assignees are plain strings; never match an address exactly (rule 45). */
export const sameAssignee = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase()

/** Open: not closed, and not merged into another ticket (a merged one is closed anyway). */
export function isOnBoard(t: BoardTicket): boolean {
  return t.status !== CLOSED && !t.mergedIntoId
}

export function compareForBoard(a: BoardTicket, b: BoardTicket, clock: BoardClock = defaultClock()): number {
  const rank = priorityRank(a.internalPriority) - priorityRank(b.internalPriority)
  if (rank !== 0) return rank
  if (normalizePriority(a.internalPriority)) {
    const left = (t: BoardTicket) => {
      const s = slaState(t, clock.sla, clock.prioritySla, clock.now)
      return s.paused ? Number.POSITIVE_INFINITY : (s.remainingHours ?? 0)
    }
    const diff = left(a) - left(b)
    if (diff !== 0 && !Number.isNaN(diff)) return diff
  } else {
    const urgency = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
    if (urgency !== 0) return urgency
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

/** The secondary filters — urgency, internal priority, overdue — without the assignee. */
export function matchesSecondary(t: BoardTicket, f: BoardFilters, clock: BoardClock): boolean {
  if (f.urgencies.length > 0 && !f.urgencies.includes(t.urgency)) return false
  if (f.priorities.length > 0) {
    const p = normalizePriority(t.internalPriority)
    if (!f.priorities.includes(p ?? "none")) return false
  }
  if (f.overdueOnly && !slaState(t, clock.sla, clock.prioritySla, clock.now).overdue) return false
  return true
}

/** Every open ticket the filters keep, ranked. */
export function filterBoard<T extends BoardTicket>(tickets: readonly T[], f: BoardFilters, clock: BoardClock = defaultClock()): T[] {
  return tickets
    .filter(t => isOnBoard(t)
      && (f.assignee === null || sameAssignee(t.assignedTo, f.assignee))
      && matchesSecondary(t, f, clock))
    .sort((a, b) => compareForBoard(a, b, clock))
}

export interface RosterMember { email: string; display: string }

export interface Lane<T extends BoardTicket> {
  email: string
  display: string
  tickets: T[]
  overdue: number
  unclassified: number
  byPriority: Record<InternalPriority, number>
}

/** What a lane is called when the roster does not know the address. */
export function assigneeDisplay(email: string, roster: readonly RosterMember[]): string {
  if (!email.trim()) return "לא משויך"
  return roster.find(m => sameAssignee(m.email, email))?.display ?? email.split("@")[0]
}

/**
 * One lane per person: everybody on the roster — an empty lane says "free",
 * which is half of what a workload view is for — except a member with no
 * tickets whose address is in `hideWhenEmpty` (the bot); plus anyone holding
 * tickets who is not on the roster any more. Busiest first.
 */
export function assigneeLanes<T extends BoardTicket>(
  tickets: readonly T[],
  roster: readonly RosterMember[],
  clock: BoardClock = defaultClock(),
  hideWhenEmpty: readonly string[] = [],
): Lane<T>[] {
  const lanes: Lane<T>[] = []
  const laneFor = (email: string) => {
    let lane = lanes.find(l => sameAssignee(l.email, email))
    if (!lane) {
      lane = {
        email, display: assigneeDisplay(email, roster), tickets: [], overdue: 0, unclassified: 0,
        byPriority: Object.fromEntries(INTERNAL_PRIORITIES.map(p => [p, 0])) as Record<InternalPriority, number>,
      }
      lanes.push(lane)
    }
    return lane
  }
  for (const m of roster) laneFor(m.email)
  for (const t of tickets) {
    const lane = laneFor(t.assignedTo ?? "")
    lane.tickets.push(t)
    const p = normalizePriority(t.internalPriority)
    if (p) lane.byPriority[p]++
    else lane.unclassified++
    if (slaState(t, clock.sla, clock.prioritySla, clock.now).overdue) lane.overdue++
  }
  for (const lane of lanes) lane.tickets.sort((a, b) => compareForBoard(a, b, clock))
  return lanes
    .filter(l => l.tickets.length > 0 || !hideWhenEmpty.some(e => sameAssignee(e, l.email)))
    .sort((a, b) => b.tickets.length - a.tickets.length || b.overdue - a.overdue || a.display.localeCompare(b.display, "he"))
}
