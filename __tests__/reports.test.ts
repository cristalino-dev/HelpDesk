/**
 * __tests__/reports.test.ts — the analytics behind /admin/reports
 *
 * These numbers get read as fact in a management meeting, so the edges matter
 * more than the happy path. The three that would actually mislead someone:
 *
 *   1. A reopened ticket has TWO "closed" history rows. Counted twice, the
 *      backlog line drifts below the real figure and never recovers.
 *   2. Buckets are civil days in Israel. A ticket opened at 01:30 local is
 *      opened *today*; bucketed on the UTC date it lands on yesterday, moving
 *      a whole night of tickets into the wrong column.
 *   3. The backlog must carry everything from before the window, or narrowing
 *      the range makes every period look like a fresh start at zero.
 */

import {
  civilDay, addDays, bucketOf, bucketRange, bucketLabel, bucketEnd,
  buildTimeline, openedWithin, closedWithin, countBy,
  resolutionHours, median, countUndatedClosures, summarize, buildInsights,
  humanHours, CLOSED, type ReportTicket,
} from "@/lib/reports"

const t = (over: Partial<ReportTicket> & { createdAt: string }): ReportTicket => ({
  ticketNumber: 1, closedAt: null, category: "אחר", urgency: "בינוני",
  platform: "מחשב אישי", status: "פתוח", assignedTo: "helpdesk@cristalino.co.il",
  ...over,
})

describe("civil days in Israel, not UTC days", () => {
  it("files a ticket opened after midnight local under the local date", () => {
    // 2026-06-09T22:30Z is 01:30 on the 10th in Israel (UTC+3 in June).
    expect(civilDay("2026-06-09T22:30:00Z")).toBe("2026-06-10")
  })

  it("handles the winter offset too (UTC+2)", () => {
    expect(civilDay("2026-01-09T22:30:00Z")).toBe("2026-01-10")
    expect(civilDay("2026-01-09T21:30:00Z")).toBe("2026-01-09")
  })

  it("addDays crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("bucketing", () => {
  it("starts weeks on Sunday, as the Israeli week does", () => {
    // 2026-09-06 is a Sunday; the 8th (Tuesday) belongs to the same week.
    expect(bucketOf("2026-09-06", "week").start).toBe("2026-09-06")
    expect(bucketOf("2026-09-08", "week").start).toBe("2026-09-06")
    expect(bucketOf("2026-09-05", "week").start).toBe("2026-08-30")
  })

  it("keys months and days by their own calendar unit", () => {
    expect(bucketOf("2026-09-08", "month")).toEqual({ key: "2026-09", start: "2026-09-01" })
    expect(bucketOf("2026-09-08", "day")).toEqual({ key: "2026-09-08", start: "2026-09-08" })
  })

  it("emits empty buckets so a quiet day is a gap in the line, not a missing point", () => {
    const days = bucketRange("2026-09-01", "2026-09-05", "day")
    expect(days.map(b => b.key)).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ])
  })

  it("collapses a month range into one bucket per month", () => {
    expect(bucketRange("2026-01-01", "2026-03-31", "month").map(b => b.key))
      .toEqual(["2026-01", "2026-02", "2026-03"])
  })

  it("knows the last day each bucket covers, so a brush maps back to real dates", () => {
    expect(bucketEnd("2026-09-08", "day")).toBe("2026-09-08")
    expect(bucketEnd("2026-09-06", "week")).toBe("2026-09-12")
    expect(bucketEnd("2026-09-01", "month")).toBe("2026-09-30")
    expect(bucketEnd("2026-02-01", "month")).toBe("2026-02-28")
    expect(bucketEnd("2024-02-01", "month")).toBe("2024-02-29") // leap year
  })

  it("labels months in Hebrew", () => {
    expect(bucketLabel("2026-09-01", "month")).toBe("ספט׳ 2026")
    expect(bucketLabel("2026-09-08", "day")).toBe("8.9")
  })
})

describe("the timeline", () => {
  const tickets = [
    t({ ticketNumber: 1, createdAt: "2026-09-01T08:00:00Z", closedAt: "2026-09-01T12:00:00Z", status: CLOSED }),
    t({ ticketNumber: 2, createdAt: "2026-09-01T09:00:00Z" }),
    t({ ticketNumber: 3, createdAt: "2026-09-02T09:00:00Z", closedAt: "2026-09-03T09:00:00Z", status: CLOSED }),
  ]

  it("counts opens and closes into their own days", () => {
    const tl = buildTimeline(tickets, "2026-09-01", "2026-09-03", "day")
    expect(tl.map(b => b.opened)).toEqual([2, 1, 0])
    expect(tl.map(b => b.closed)).toEqual([1, 0, 1])
  })

  it("runs the backlog as opened minus closed, cumulatively", () => {
    const tl = buildTimeline(tickets, "2026-09-01", "2026-09-03", "day")
    expect(tl.map(b => b.backlog)).toEqual([1, 2, 1])
  })

  it("carries the backlog in from before the window — the whole point of the line", () => {
    // Two tickets opened in August and never closed. A window starting in
    // September must open at 2, not at 0.
    const withHistory = [
      ...tickets,
      t({ ticketNumber: 8, createdAt: "2026-08-01T09:00:00Z" }),
      t({ ticketNumber: 9, createdAt: "2026-08-02T09:00:00Z" }),
    ]
    const tl = buildTimeline(withHistory, "2026-09-01", "2026-09-03", "day")
    expect(tl[0].backlog).toBe(3) // 2 carried in + 2 opened − 1 closed
    expect(tl.map(b => b.opened)).toEqual([2, 1, 0]) // August is not re-counted
  })

  it("does not let a ticket closed before the window inflate the carried backlog", () => {
    const withHistory = [
      t({ ticketNumber: 8, createdAt: "2026-08-01T09:00:00Z", closedAt: "2026-08-05T09:00:00Z", status: CLOSED }),
    ]
    expect(buildTimeline(withHistory, "2026-09-01", "2026-09-02", "day")[0].backlog).toBe(0)
  })

  it("counts a reopened-then-closed ticket once — the bug that would sink the backlog", () => {
    // The caller resolves the LAST close, so this module sees one closedAt.
    // Backlog must land at 0, not −1.
    const reopened = [
      t({ ticketNumber: 5, createdAt: "2026-09-01T08:00:00Z", closedAt: "2026-09-03T08:00:00Z", status: CLOSED }),
    ]
    const tl = buildTimeline(reopened, "2026-09-01", "2026-09-04", "day")
    expect(tl.map(b => b.closed)).toEqual([0, 0, 1, 0])
    expect(tl[tl.length - 1].backlog).toBe(0)
  })

  it("ignores a ticket entirely outside the window", () => {
    const tl = buildTimeline([t({ createdAt: "2027-01-01T08:00:00Z" })], "2026-09-01", "2026-09-02", "day")
    expect(tl.every(b => b.opened === 0 && b.backlog === 0)).toBe(true)
  })
})

describe("slicing by opened vs closed", () => {
  const tickets = [
    t({ ticketNumber: 1, createdAt: "2026-08-20T08:00:00Z", closedAt: "2026-09-02T08:00:00Z", status: CLOSED }),
    t({ ticketNumber: 2, createdAt: "2026-09-01T08:00:00Z" }),
  ]

  it("keeps the two populations apart", () => {
    // #1 was opened in August and closed in September: it belongs to the
    // closed-in-September set and NOT to the opened-in-September set.
    expect(openedWithin(tickets, "2026-09-01", "2026-09-30").map(x => x.ticketNumber)).toEqual([2])
    expect(closedWithin(tickets, "2026-09-01", "2026-09-30").map(x => x.ticketNumber)).toEqual([1])
  })

  it("never counts an unclosed ticket as closed", () => {
    expect(closedWithin([t({ createdAt: "2026-09-01T08:00:00Z" })], "2026-01-01", "2027-01-01")).toEqual([])
  })
})

describe("breakdowns", () => {
  const tickets = [
    t({ createdAt: "2026-09-01T08:00:00Z", category: "תוכנה" }),
    t({ createdAt: "2026-09-01T08:00:00Z", category: "תוכנה" }),
    t({ createdAt: "2026-09-01T08:00:00Z", category: "חומרה" }),
  ]

  it("ranks largest first and reports each share", () => {
    const rows = countBy(tickets, "category")
    expect(rows[0]).toEqual({ label: "תוכנה", count: 2, share: 2 / 3 })
    expect(rows[1].label).toBe("חומרה")
  })

  it("breaks ties by label so the order does not wobble between renders", () => {
    const rows = countBy([
      t({ createdAt: "2026-09-01T08:00:00Z", category: "ב" }),
      t({ createdAt: "2026-09-01T08:00:00Z", category: "א" }),
    ], "category")
    expect(rows.map(r => r.label)).toEqual(["א", "ב"])
  })

  it("folds blank values into a dash rather than an empty bar", () => {
    expect(countBy([t({ createdAt: "2026-09-01T08:00:00Z", category: "  " })], "category")[0].label).toBe("—")
  })

  it("returns nothing for no tickets, instead of a zero-share divide", () => {
    expect(countBy([], "category")).toEqual([])
  })
})

describe("resolution time", () => {
  it("measures hours between open and close", () => {
    expect(resolutionHours([
      t({ createdAt: "2026-09-01T08:00:00Z", closedAt: "2026-09-01T12:00:00Z", status: CLOSED }),
    ])).toEqual([4])
  })

  it("skips tickets that were never closed", () => {
    expect(resolutionHours([t({ createdAt: "2026-09-01T08:00:00Z" })])).toEqual([])
  })

  it("uses the median, so one week-long ticket cannot skew the figure", () => {
    // Mean would be 51.5h; the median says 2h, which is the honest summary.
    expect(median([1, 2, 3, 200])).toBe(2.5)
    expect(median([1, 2, 3])).toBe(2)
    expect(median([])).toBeNull()
  })

  it("counts closed tickets that carry no close date, so the gap can be disclosed", () => {
    expect(countUndatedClosures([
      t({ createdAt: "2026-09-01T08:00:00Z", status: CLOSED }),
      t({ createdAt: "2026-09-01T08:00:00Z", status: CLOSED, closedAt: "2026-09-02T08:00:00Z" }),
      t({ createdAt: "2026-09-01T08:00:00Z" }),
    ])).toBe(1)
  })
})

describe("the summary", () => {
  const tickets = [
    t({ ticketNumber: 1, createdAt: "2026-09-01T08:00:00Z", closedAt: "2026-09-01T12:00:00Z", status: CLOSED, category: "תוכנה" }),
    t({ ticketNumber: 2, createdAt: "2026-09-01T09:00:00Z", category: "תוכנה" }),
    t({ ticketNumber: 3, createdAt: "2026-09-02T09:00:00Z", category: "חומרה" }),
  ]
  const tl = buildTimeline(tickets, "2026-09-01", "2026-09-03", "day")
  const s = summarize(tickets, "2026-09-01", "2026-09-03", tl)

  it("counts what was opened and what was closed in the window", () => {
    expect(s.opened).toBe(3)
    expect(s.closed).toBe(1)
    expect(s.closureRate).toBeCloseTo(1 / 3)
  })

  it("reports how many of the period's own tickets are still open", () => {
    expect(s.stillOpen).toBe(2)
  })

  it("names the busiest bucket and the leading category", () => {
    expect(s.busiestCount).toBe(2)
    expect(s.topCategory).toBe("תוכנה")
    expect(s.topCategoryShare).toBeCloseTo(2 / 3)
  })

  it("has no closure rate when nothing was opened, rather than dividing by zero", () => {
    const empty = summarize([], "2026-09-01", "2026-09-03", buildTimeline([], "2026-09-01", "2026-09-03", "day"))
    expect(empty.closureRate).toBeNull()
    expect(empty.medianHours).toBeNull()
  })
})

describe("insights", () => {
  const range = ["2026-09-01", "2026-09-03"] as const

  it("says so plainly when the period is empty", () => {
    const tl = buildTimeline([], ...range, "day")
    const out = buildInsights(summarize([], ...range, tl), tl)
    expect(out).toHaveLength(1)
    expect(out[0].text).toContain("לא נפתחו פניות")
  })

  it("flags a growing queue as a warning", () => {
    const tickets = [
      t({ createdAt: "2026-09-01T08:00:00Z" }),
      t({ createdAt: "2026-09-01T09:00:00Z" }),
      t({ createdAt: "2026-09-02T09:00:00Z" }),
    ]
    const tl = buildTimeline(tickets, ...range, "day")
    const out = buildInsights(summarize(tickets, ...range, tl), tl)
    expect(out.some(i => i.tone === "warn" && i.text.includes("התור גדל"))).toBe(true)
  })

  it("calls a shrinking queue good news", () => {
    const tickets = [
      t({ createdAt: "2026-08-01T08:00:00Z", closedAt: "2026-09-02T08:00:00Z", status: CLOSED }),
      t({ createdAt: "2026-08-01T08:00:00Z", closedAt: "2026-09-02T09:00:00Z", status: CLOSED }),
      t({ createdAt: "2026-09-01T08:00:00Z", closedAt: "2026-09-01T09:00:00Z", status: CLOSED }),
    ]
    const tl = buildTimeline(tickets, ...range, "day")
    const out = buildInsights(summarize(tickets, ...range, tl), tl)
    expect(out.some(i => i.tone === "good")).toBe(true)
  })

  it("discloses undated closures rather than quietly under-reporting", () => {
    const tickets = [
      t({ createdAt: "2026-09-01T08:00:00Z", status: CLOSED }), // closed, no date
      t({ createdAt: "2026-09-01T08:00:00Z" }),
    ]
    const tl = buildTimeline(tickets, ...range, "day")
    const out = buildInsights(summarize(tickets, ...range, tl), tl)
    expect(out.some(i => i.text.includes("ללא תאריך סגירה"))).toBe(true)
  })
})

describe("humanHours", () => {
  it("speaks minutes, hours or days depending on the size", () => {
    expect(humanHours(0.5)).toBe("30 דקות")
    expect(humanHours(4)).toBe("4.0 שעות")
    expect(humanHours(96)).toBe("4.0 ימים")
  })
})
