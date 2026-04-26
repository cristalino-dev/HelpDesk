/**
 * __tests__/staleTicket.test.ts
 *
 * Tests for lib/staleTicket.ts helpers.
 * All tests manipulate the system clock via jest.useFakeTimers so they
 * don't depend on the real wall-clock date.
 *
 * Since staleTicket.ts now measures **workdays** (Israeli week: Sun–Thu),
 * test fixtures use specific calendar dates that correspond to known workday
 * counts from NOW.
 *
 * Reference calendar (April 2026):
 *   Mon  Tue  Wed  Thu  Fri  Sat  Sun
 *    6    7    8    9   10   11   12
 *   13   14   15   16   17   18   19
 *   20   21   22   23   24   25   26
 *
 * NOW = Tuesday 2026-04-21T09:00:00Z
 *
 * Workday counts back from NOW:
 *   Apr 20 (Mon) → 1 workday ago
 *   Apr 19 (Sun) → 2 workdays ago
 *   Apr 16 (Thu) → 3 workdays ago  (Apr 17 Fri + Apr 18 Sat skipped)
 *   Apr 15 (Wed) → 4 workdays ago  (boundary)
 *   Apr 14 (Tue) → 5 workdays ago  (first "stale" with threshold 4)
 *   Apr  9 (Thu) → 7 workdays ago
 */

import { isStaleOpen, openDays, STALE_DAYS } from "@/lib/staleTicket"

const NOW = new Date("2026-04-21T09:00:00.000Z") // Tuesday

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW.getTime())
})

afterEach(() => {
  jest.useRealTimers()
})

// ── isStaleOpen ───────────────────────────────────────────────────────────────

describe("isStaleOpen", () => {
  it("returns false for a ticket opened today (0 workdays old)", () => {
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-21T08:00:00.000Z" })).toBe(false)
  })

  it("returns false for a ticket opened 3 workdays ago (below threshold)", () => {
    // Apr 16 (Thu) = 3 workdays ago — still under the 4-wd threshold
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-16T08:00:00.000Z" })).toBe(false)
  })

  it("returns false for a ticket opened exactly at the threshold (4 workdays)", () => {
    // Apr 15 (Wed) = 4 workdays ago — NOT stale, threshold is strictly greater-than
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-15T08:00:00.000Z" })).toBe(false)
  })

  it("returns true for a ticket opened 5 workdays ago (over threshold)", () => {
    // Apr 14 (Tue) = 5 workdays ago — stale
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-14T08:00:00.000Z" })).toBe(true)
  })

  it("returns true for a ticket opened 7 workdays ago", () => {
    // Apr 12 (Sun) = 7 workdays ago (7 workdays: Sun,Mon,Tue,Wed,Thu,Sun,Mon)
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-12T08:00:00.000Z" })).toBe(true)
  })

  it("returns true for a 'בטיפול' ticket older than the threshold", () => {
    // A ticket stuck in-progress for 7 workdays is just as stale as an open one
    expect(isStaleOpen({ status: "בטיפול", createdAt: "2026-04-12T08:00:00.000Z" })).toBe(true)
  })

  it("returns false for a 'בטיפול' ticket within the threshold", () => {
    // Apr 19 (Sun) = 2 workdays ago — not stale
    expect(isStaleOpen({ status: "בטיפול", createdAt: "2026-04-19T08:00:00.000Z" })).toBe(false)
  })

  it("returns false for a 'סגור' ticket even if very old", () => {
    expect(isStaleOpen({ status: "סגור", createdAt: "2026-01-01T08:00:00.000Z" })).toBe(false)
  })

  it("returns false for a 'סגור' ticket regardless of age", () => {
    expect(isStaleOpen({ status: "סגור", createdAt: "2025-01-01T08:00:00.000Z" })).toBe(false)
  })

  it("respects a custom staleWorkdays threshold (threshold = 2)", () => {
    // Apr 16 (Thu) = 3 workdays ago; 3 > 2 → stale
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-16T08:00:00.000Z" }, 2)).toBe(true)
  })

  it("respects a custom staleWorkdays threshold (threshold = 10)", () => {
    // Apr 12 (Sun) = 7 workdays ago; 7 > 10 → NOT stale
    expect(isStaleOpen({ status: "פתוח", createdAt: "2026-04-12T08:00:00.000Z" }, 10)).toBe(false)
  })

  it("accepts a Date object for createdAt", () => {
    // Apr 14 (Tue) = 5 workdays ago → stale
    const date = new Date("2026-04-14T08:00:00.000Z")
    expect(isStaleOpen({ status: "פתוח", createdAt: date })).toBe(true)
  })
})

// ── openDays ──────────────────────────────────────────────────────────────────

describe("openDays", () => {
  it("returns 0 for a ticket created today", () => {
    expect(openDays("2026-04-21T08:00:00.000Z")).toBe(0)
  })

  it("returns 1 for a ticket created yesterday (Monday)", () => {
    expect(openDays("2026-04-20T08:00:00.000Z")).toBe(1)
  })

  it("returns 3 for a ticket created on Thursday (skipping Fri+Sat)", () => {
    // Apr 16 (Thu): Thu✓, skip Fri+Sat, Sun✓, Mon✓ = 3 workdays
    expect(openDays("2026-04-16T08:00:00.000Z")).toBe(3)
  })

  it("returns 7 for a ticket created 7 workdays ago (Sunday 2 weeks earlier)", () => {
    // Apr 12 (Sun) = 7 workdays ago
    expect(openDays("2026-04-12T08:00:00.000Z")).toBe(7)
  })

  it("returns 8 for a ticket created on Thursday 10 days ago (two weekends skipped)", () => {
    // Apr 9 (Thu) = 8 workdays ago: Thu,Sun,Mon,Tue,Wed,Thu,Sun,Mon = 8
    expect(openDays("2026-04-09T08:00:00.000Z")).toBe(8)
  })

  it("accepts a Date object", () => {
    expect(openDays(new Date("2026-04-16T08:00:00.000Z"))).toBe(3)
  })
})

// ── STALE_DAYS constant ───────────────────────────────────────────────────────

describe("STALE_DAYS", () => {
  it("is 4", () => {
    expect(STALE_DAYS).toBe(4)
  })
})
