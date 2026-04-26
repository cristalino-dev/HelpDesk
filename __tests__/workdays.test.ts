/**
 * __tests__/workdays.test.ts
 *
 * Unit tests for lib/workdays.ts — Israeli workday calculations.
 *
 * Israeli work week: Sunday (0)–Thursday (4) are workdays.
 * Friday (5) and Saturday (6) are NOT workdays.
 *
 * All tests pin the system clock via jest.useFakeTimers so results
 * are deterministic regardless of when the suite runs.
 *
 * Reference calendar (all dates in April 2026):
 *   Mon  Tue  Wed  Thu  Fri  Sat  Sun
 *    6    7    8    9   10   11   12
 *   13   14   15   16   17   18   19
 *   20   21   22   23   24   25   26
 *
 * NOW = Tuesday 2026-04-21
 */

export {}

import { workdaysBetween, workdaysAgo, formatWorkdays, formatWorkdaysFull } from "@/lib/workdays"

const NOW = new Date("2026-04-21T09:00:00.000Z") // Tuesday

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW.getTime())
})

afterEach(() => {
  jest.useRealTimers()
})

// ── workdaysBetween ───────────────────────────────────────────────────────────

describe("workdaysBetween", () => {
  it("returns 0 when from === to (same date)", () => {
    expect(workdaysBetween("2026-04-21", "2026-04-21")).toBe(0)
  })

  it("returns 0 when from > to (reversed range)", () => {
    expect(workdaysBetween("2026-04-21", "2026-04-20")).toBe(0)
  })

  it("counts a single Sunday as 1 workday", () => {
    // Apr 19 (Sun) → Apr 20 (Mon): only Sunday counts
    expect(workdaysBetween("2026-04-19", "2026-04-20")).toBe(1)
  })

  it("counts Sun–Mon as 2 workdays", () => {
    // Apr 19 (Sun) + Apr 20 (Mon) → 2
    expect(workdaysBetween("2026-04-19", "2026-04-21")).toBe(2)
  })

  it("skips Friday (not a workday)", () => {
    // Apr 17 (Fri) to Apr 18 (Sat) — only Friday in range, but it's not counted
    expect(workdaysBetween("2026-04-17", "2026-04-18")).toBe(0)
  })

  it("skips Saturday (not a workday)", () => {
    // Apr 18 (Sat) to Apr 19 (Sun) — only Saturday, not counted
    expect(workdaysBetween("2026-04-18", "2026-04-19")).toBe(0)
  })

  it("skips both Friday and Saturday across a weekend", () => {
    // Thu Apr 16 → Mon Apr 20: Thu(16) + Sun(19) = 2  (Fri 17 + Sat 18 skipped)
    expect(workdaysBetween("2026-04-16", "2026-04-20")).toBe(2)
  })

  it("counts 5 workdays in a Sun–Thu business week", () => {
    // Apr 19 (Sun)–Apr 23 (Thu) = 5 workdays; stopping before Fri Apr 24
    expect(workdaysBetween("2026-04-19", "2026-04-24")).toBe(5)
  })

  it("counts 7 workdays spanning one weekend (9 calendar days)", () => {
    // Apr 12 (Sun) to Apr 21 (Tue) = 7 workdays
    // Apr 12 Sun ✓, Apr 13 Mon ✓, Apr 14 Tue ✓, Apr 15 Wed ✓, Apr 16 Thu ✓,
    // Apr 17 Fri ✗, Apr 18 Sat ✗, Apr 19 Sun ✓, Apr 20 Mon ✓ → total 7
    expect(workdaysBetween("2026-04-12", "2026-04-21")).toBe(7)
  })

  it("counts 8 workdays spanning two weekends (12 calendar days)", () => {
    // Apr 9 (Thu) to Apr 21 (Tue) = 8 workdays
    // Apr  9 Thu ✓, Apr 10 Fri ✗, Apr 11 Sat ✗, Apr 12 Sun ✓, Apr 13 Mon ✓,
    // Apr 14 Tue ✓, Apr 15 Wed ✓, Apr 16 Thu ✓, Apr 17 Fri ✗, Apr 18 Sat ✗,
    // Apr 19 Sun ✓, Apr 20 Mon ✓ → total 8
    expect(workdaysBetween("2026-04-09", "2026-04-21")).toBe(8)
  })

  it("accepts Date objects for both arguments", () => {
    const from = new Date("2026-04-20")
    const to   = new Date("2026-04-21")
    expect(workdaysBetween(from, to)).toBe(1)
  })

  it("uses current time as 'to' when second argument is omitted", () => {
    // Monday Apr 20 → Tuesday Apr 21 = 1 workday
    expect(workdaysBetween("2026-04-20")).toBe(1)
  })

  it("returns same result for a date string as for a Date object at midnight", () => {
    // Both representations of Monday Apr 20 should give 1 workday to Apr 21
    expect(workdaysBetween("2026-04-20", "2026-04-21")).toBe(1)
    expect(workdaysBetween(new Date("2026-04-20"), new Date("2026-04-21"))).toBe(1)
  })

  it("handles a purely weekend range (Fri–Mon) with only Sun counted", () => {
    // Apr 17 (Fri) to Apr 20 (Mon): Fri ✗, Sat ✗, Sun ✓ → 1
    expect(workdaysBetween("2026-04-17", "2026-04-20")).toBe(1)
  })
})

// ── workdaysAgo ───────────────────────────────────────────────────────────────

describe("workdaysAgo", () => {
  it("returns 0 for today's date", () => {
    expect(workdaysAgo("2026-04-21")).toBe(0)
  })

  it("returns 0 for a future date (from > now)", () => {
    expect(workdaysAgo("2026-04-22")).toBe(0)
  })

  it("returns 1 for yesterday (Monday)", () => {
    expect(workdaysAgo("2026-04-20")).toBe(1)
  })

  it("returns 3 for Thursday two weeks ago-ish — skipping one Fri+Sat", () => {
    // Apr 16 (Thu) → Apr 21 (Tue): Thu✓, Fri✗, Sat✗, Sun✓, Mon✓ = 3
    expect(workdaysAgo("2026-04-16")).toBe(3)
  })

  it("returns 5 for two Tuesdays ago (Apr 14)", () => {
    // Apr 14 (Tue) to Apr 21 (Tue): Tue,Wed,Thu,(skip Fri+Sat),Sun,Mon = 5
    expect(workdaysAgo("2026-04-14")).toBe(5)
  })

  it("returns 7 for Sunday Apr 12", () => {
    // Apr 12 (Sun) to Apr 21: Sun,Mon,Tue,Wed,Thu,(skip Fri+Sat),Sun,Mon = 7
    expect(workdaysAgo("2026-04-12")).toBe(7)
  })

  it("accepts a Date object", () => {
    expect(workdaysAgo(new Date("2026-04-20"))).toBe(1)
  })
})

// ── formatWorkdays ────────────────────────────────────────────────────────────

describe("formatWorkdays", () => {
  it("returns 'היום' for 0", () => {
    expect(formatWorkdays(0)).toBe("היום")
  })

  it("returns 'יע 1' for 1", () => {
    expect(formatWorkdays(1)).toBe("יע 1")
  })

  it("returns 'יע 5' for 5", () => {
    expect(formatWorkdays(5)).toBe("יע 5")
  })

  it("returns 'יע 100' for large numbers", () => {
    expect(formatWorkdays(100)).toBe("יע 100")
  })
})

// ── formatWorkdaysFull ────────────────────────────────────────────────────────

describe("formatWorkdaysFull", () => {
  it("returns 'היום' for 0", () => {
    expect(formatWorkdaysFull(0)).toBe("היום")
  })

  it("returns 'יום עסקים אחד' for 1", () => {
    expect(formatWorkdaysFull(1)).toBe("יום עסקים אחד")
  })

  it("returns 'N ימי עסקים' for 2", () => {
    expect(formatWorkdaysFull(2)).toBe("2 ימי עסקים")
  })

  it("returns 'N ימי עסקים' for 10", () => {
    expect(formatWorkdaysFull(10)).toBe("10 ימי עסקים")
  })

  it("returns 'N ימי עסקים' for large numbers", () => {
    expect(formatWorkdaysFull(365)).toBe("365 ימי עסקים")
  })
})
