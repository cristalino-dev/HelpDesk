/**
 * __tests__/staleTicket.test.ts
 *
 * Tests for lib/staleTicket.ts helpers.
 * All tests manipulate the system clock via jest.useFakeTimers so they
 * don't depend on the real wall-clock date.
 */

import { isStaleOpen, openDays, STALE_DAYS } from "@/lib/staleTicket"

// Pin the "current" time so age calculations are deterministic.
const NOW = new Date("2026-04-21T09:00:00.000Z")

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW.getTime())
})

afterEach(() => {
  jest.useRealTimers()
})

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a createdAt ISO string N days before NOW. */
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

// ── isStaleOpen ───────────────────────────────────────────────────────────────

describe("isStaleOpen", () => {
  it("returns false for a ticket opened today (0 days old)", () => {
    expect(isStaleOpen({ status: "פתוח", createdAt: daysAgo(0) })).toBe(false)
  })

  it("returns false for a ticket opened 3 days ago (below threshold)", () => {
    expect(isStaleOpen({ status: "פתוח", createdAt: daysAgo(3) })).toBe(false)
  })

  it("returns false for a ticket opened exactly at the threshold (4 days = boundary)", () => {
    // exactly 4 days — NOT stale, threshold is strictly greater-than
    expect(isStaleOpen({ status: "פתוח", createdAt: daysAgo(4) })).toBe(false)
  })

  it("returns true for a ticket opened more than 4 days ago", () => {
    // 4 days + 1 second — just over threshold
    const justOver = new Date(NOW.getTime() - (STALE_DAYS * 24 * 60 * 60 * 1000 + 1000)).toISOString()
    expect(isStaleOpen({ status: "פתוח", createdAt: justOver })).toBe(true)
  })

  it("returns true for a ticket opened 7 days ago", () => {
    expect(isStaleOpen({ status: "פתוח", createdAt: daysAgo(7) })).toBe(true)
  })

  it("returns true for a 'בטיפול' ticket older than the threshold", () => {
    // A ticket stuck in-progress for 7 days is just as stale as an open one
    expect(isStaleOpen({ status: "בטיפול", createdAt: daysAgo(7) })).toBe(true)
  })

  it("returns false for a 'בטיפול' ticket within the threshold", () => {
    expect(isStaleOpen({ status: "בטיפול", createdAt: daysAgo(2) })).toBe(false)
  })

  it("returns false for a 'סגור' ticket even if very old", () => {
    expect(isStaleOpen({ status: "סגור", createdAt: daysAgo(30) })).toBe(false)
  })

  it("returns false for a 'סגור' ticket regardless of status change", () => {
    // Closed tickets are never stale, even past STALE_DAYS
    expect(isStaleOpen({ status: "סגור", createdAt: daysAgo(100) })).toBe(false)
  })

  it("respects a custom staleDays threshold", () => {
    // With threshold = 2, a 3-day-old ticket is stale
    expect(isStaleOpen({ status: "פתוח", createdAt: daysAgo(3) }, 2)).toBe(true)
    // With threshold = 10, a 7-day-old ticket is not stale
    expect(isStaleOpen({ status: "פתוח", createdAt: daysAgo(7) }, 10)).toBe(false)
  })

  it("accepts a Date object for createdAt", () => {
    const date = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000)
    expect(isStaleOpen({ status: "פתוח", createdAt: date })).toBe(true)
  })
})

// ── openDays ──────────────────────────────────────────────────────────────────

describe("openDays", () => {
  it("returns 0 for a ticket created now", () => {
    expect(openDays(NOW.toISOString())).toBe(0)
  })

  it("returns 1 for a ticket created 1 day ago", () => {
    expect(openDays(daysAgo(1))).toBe(1)
  })

  it("returns 7 for a ticket created 7 days ago", () => {
    expect(openDays(daysAgo(7))).toBe(7)
  })

  it("floors partial days (e.g. 1.9 days → 1)", () => {
    const almostTwoDays = new Date(NOW.getTime() - 1.9 * 24 * 60 * 60 * 1000).toISOString()
    expect(openDays(almostTwoDays)).toBe(1)
  })

  it("accepts a Date object", () => {
    expect(openDays(new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000))).toBe(3)
  })
})

// ── STALE_DAYS constant ───────────────────────────────────────────────────────

describe("STALE_DAYS", () => {
  it("is 4", () => {
    expect(STALE_DAYS).toBe(4)
  })
})
