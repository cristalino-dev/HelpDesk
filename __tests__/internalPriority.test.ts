/**
 * __tests__/internalPriority.test.ts — the helpdesk's own urgency (v3.107).
 *
 * Five levels with an SLA each, in hours on a Sunday–Thursday clock; a ticket
 * nobody classified keeps the SLA of its type; a parked ticket is never
 * overdue; and the field never reaches a reporter.
 *
 * Dates are built in local time, as the clock reads them. November 2026,
 * clear of any daylight-saving change (Israel's falls on 25 October):
 * Mon 9 … Thu 12, Fri 13, Sat 14, Sun 15, Mon 16.
 */

import {
  DEFAULT_PRIORITY_SLA, INTERNAL_PRIORITIES, PRIORITY_HISTORY_FIELD, formatClockSpan, formatSlaHours, hideInternal,
  isInternalHistory, isOverdue, normalizePriority, parseSlaHours, priorityLabel, priorityRank, slaDeadline, slaState,
  workHoursBetween,
} from "@/lib/internalPriority"
import { DEFAULT_SLA } from "@/lib/ticketType"
import { STATUS_TOKENS, PRIORITY_TOKENS } from "@/lib/theme"

const at = (day: number, hour = 0, minute = 0) => new Date(2026, 10, day, hour, minute)

describe("the levels", () => {
  it("are P1 to P5, each with a name and a pill colour", () => {
    expect(INTERNAL_PRIORITIES).toEqual(["P1", "P2", "P3", "P4", "P5"])
    expect(priorityLabel("P1")).toBe("P1 · משביתה")
    expect(Object.keys(PRIORITY_TOKENS).sort()).toEqual([...INTERNAL_PRIORITIES])
  })

  it("reads a level from anywhere, and nothing else", () => {
    expect(normalizePriority("P2")).toBe("P2")
    expect(normalizePriority(" p3 ")).toBe("P3")
    expect(normalizePriority("P6")).toBeNull()
    expect(normalizePriority("")).toBeNull()
    expect(normalizePriority(null)).toBeNull()
    expect(normalizePriority(1)).toBeNull()
  })

  it("ranks P1 first and an unclassified ticket after P5", () => {
    expect(priorityRank("P1")).toBe(1)
    expect(priorityRank("P5")).toBe(5)
    expect(priorityRank(null)).toBe(6)
    expect(priorityRank("junk")).toBe(6)
  })

  it("does not collide with a status name — a history row's field is its own", () => {
    expect(Object.keys(STATUS_TOKENS)).not.toContain(PRIORITY_HISTORY_FIELD)
  })
})

describe("the Sunday–Thursday clock", () => {
  it("counts a weekday's hours as they are", () => {
    expect(workHoursBetween(at(9, 9), at(9, 13))).toBe(4)
  })

  it("does not count Friday or Saturday", () => {
    // Thursday 20:00 → Sunday 02:00: four hours on Thursday, two on Sunday.
    expect(workHoursBetween(at(12, 20), at(15, 2))).toBe(6)
    expect(workHoursBetween(at(13, 9), at(14, 18))).toBe(0)
  })

  it("is zero when the end is not after the start", () => {
    expect(workHoursBetween(at(20, 10), at(20, 9))).toBe(0)
  })

  it("puts a deadline past the weekend", () => {
    // A P1 (4 h) opened Thursday 22:00 is due Sunday 02:00.
    expect(slaDeadline(at(12, 22), 4)).toEqual(at(15, 2))
    // Opened on a Saturday, the clock starts on Sunday.
    expect(slaDeadline(at(14, 15), 8)).toEqual(at(15, 8))
  })

  it("makes 24 hours on it one workday", () => {
    expect(slaDeadline(at(12, 10), 24)).toEqual(at(15, 10))
  })
})

describe("slaState", () => {
  const ticket = (over: Record<string, unknown> = {}) =>
    ({ status: "פתוח", type: "ticket", createdAt: at(9, 9), internalPriority: null, ...over })

  it("measures a classified ticket against its level, in hours", () => {
    const s = slaState(ticket({ internalPriority: "P1" }), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(9, 12))
    expect(s).toEqual({ paused: false, overdue: false, remainingHours: 1 })
    const late = slaState(ticket({ internalPriority: "P1" }), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(9, 15))
    expect(late.overdue).toBe(true)
    expect(late.remainingHours).toBe(-2)
  })

  it("follows the admins' targets", () => {
    const s = slaState(ticket({ internalPriority: "P1" }), DEFAULT_SLA, { ...DEFAULT_PRIORITY_SLA, P1: 8 }, at(9, 15))
    expect(s.overdue).toBe(false)
  })

  it("leaves an unclassified ticket on its type's SLA in workdays, as before", () => {
    // Opened Monday the 9th; 4 workdays → overdue once five have passed.
    expect(slaState(ticket(), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(13, 12)).overdue).toBe(false)
    expect(slaState(ticket(), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(16, 12)).overdue).toBe(true)
    expect(slaState(ticket(), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(16, 12)).remainingHours).toBeNull()
  })

  it("stops the clock for a parked or closed ticket", () => {
    for (const status of ["בהמתנה", "ממתין לגורם חיצוני", "סגור"]) {
      const s = slaState(ticket({ status, internalPriority: "P1" }), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(15, 12))
      expect(s.paused).toBe(true)
      expect(s.overdue).toBe(false)
    }
  })

  it("is what isOverdue() answers", () => {
    expect(isOverdue(ticket({ internalPriority: "P2" }), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(9, 18))).toBe(true)
    expect(isOverdue(ticket({ internalPriority: "P4" }), DEFAULT_SLA, DEFAULT_PRIORITY_SLA, at(9, 18))).toBe(false)
  })
})

describe("the defaults", () => {
  it("put an outage hours away and match the type SLA at P4 and P5", () => {
    expect(DEFAULT_PRIORITY_SLA.P1).toBeLessThan(DEFAULT_PRIORITY_SLA.P2)
    expect(DEFAULT_PRIORITY_SLA.P4).toBe(DEFAULT_SLA.ticket * 24)
    expect(DEFAULT_PRIORITY_SLA.P5).toBe(DEFAULT_SLA.request * 24)
    const values = INTERNAL_PRIORITIES.map(p => DEFAULT_PRIORITY_SLA[p])
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })
})

describe("formatting", () => {
  it("says a target in hours or workdays", () => {
    expect(formatSlaHours(4)).toBe("4 שעות")
    expect(formatSlaHours(1)).toBe("שעה")
    expect(formatSlaHours(24)).toBe("יום עבודה")
    expect(formatSlaHours(240)).toBe("10 ימי עבודה")
  })

  it("says a stretch of time, either side of zero", () => {
    expect(formatClockSpan(0.4)).toBe("פחות משעה")
    expect(formatClockSpan(-3.7)).toBe("3 ש׳")
    expect(formatClockSpan(30)).toBe("יום")
    expect(formatClockSpan(-50)).toBe("2 ימים")
  })

  it("accepts whole hours from 1 to 60 workdays' worth", () => {
    expect(parseSlaHours(4)).toBe(4)
    expect(parseSlaHours("48")).toBe(48)
    expect(parseSlaHours(0)).toBeNull()
    expect(parseSlaHours(1.5)).toBeNull()
    expect(parseSlaHours(1441)).toBeNull()
    expect(parseSlaHours("")).toBeNull()
  })
})

describe("keeping it from reporters", () => {
  it("takes the field off a ticket and leaves the rest", () => {
    const t = { id: "t1", subject: "x", internalPriority: "P1" }
    expect(hideInternal(t)).toEqual({ id: "t1", subject: "x" })
    expect("internalPriority" in hideInternal(t)).toBe(false)
    expect(t.internalPriority).toBe("P1") // a copy — the original is untouched
  })

  it("hides the field even when it is null — its name alone says something", () => {
    expect("internalPriority" in hideInternal({ id: "t1", internalPriority: null })).toBe(false)
  })

  it("knows which history rows are the helpdesk's", () => {
    expect(isInternalHistory({ field: PRIORITY_HISTORY_FIELD })).toBe(true)
    expect(isInternalHistory({ field: "urgency" })).toBe(false)
  })
})
