/**
 * lib/reports.ts — Ticket analytics: timelines, breakdowns and insights
 *
 * Pure and side-effect free, like lib/workdays.ts. Everything here takes plain
 * rows and returns plain data, so the numbers on /admin/reports can be tested
 * without a database, a session or a browser.
 *
 * ── WHERE "CLOSED" COMES FROM ──────────────────────────────────────────────
 * `Ticket` has `createdAt` but NO `closedAt` column. A closure is recorded as a
 * TicketHistory row — `field: "status"`, `newValue: "סגור"` — written by the
 * PATCH route and by /api/automation/close. The sweep cron only rewrites
 * urgency, so it cannot close a ticket behind our back.
 *
 * A ticket can be closed, reopened and closed again, which leaves several such
 * rows. This module counts a ticket as closed **once, at its most recent
 * transition to "סגור", and only while it is currently closed** (`closedAt` is
 * null otherwise). That definition is what makes the backlog line honest:
 *
 *     cumulative opened − cumulative closed = tickets actually open
 *
 * Counting every close *event* instead would double-count reopened tickets and
 * the backlog would drift below the true figure, silently.
 *
 * A ticket closed before history was recorded has no row and so no `closedAt`.
 * It still counts as opened. `countUndatedClosures()` reports how many such
 * tickets exist so the UI can say so out loud rather than quietly under-reporting.
 *
 * ── TIME ZONE ─────────────────────────────────────────────────────────────
 * Buckets are civil days in **Asia/Jerusalem**, not UTC days. A ticket opened at
 * 01:30 Israel time is opened *today*; bucketing on the UTC date would file it
 * under yesterday and shift a whole night's tickets into the wrong column. All
 * bucketing goes through `civilDate()`.
 */

export const TZ = "Asia/Jerusalem"

/** The closed status, spelled once. */
export const CLOSED = "סגור"

export type Granularity = "day" | "week" | "month"

/** One ticket, flattened to just what the reports need. */
export type ReportTicket = {
  ticketNumber: number
  createdAt: string   // ISO
  closedAt: string | null // ISO — most recent transition to "סגור", if closed
  category: string
  urgency: string
  platform: string
  status: string
  assignedTo: string
}

export type Bucket = {
  /** Sort/identity key — "2026-09-06", "2026-W36" and "2026-09" respectively. */
  key: string
  /** Inclusive civil start of the bucket, as YYYY-MM-DD. */
  start: string
  /** Human label, Hebrew-friendly and short enough for an axis tick. */
  label: string
  opened: number
  closed: number
  /** Tickets still open at the END of this bucket. */
  backlog: number
}

// ── Civil dates ─────────────────────────────────────────────────────────────

/**
 * The calendar date in Israel for an instant, as {y, m, d} with m 1-indexed.
 * `Intl` is the only correct way to do this — it knows when DST moved.
 */
export function civilDate(iso: string | Date): { y: number; m: number; d: number } {
  const date = iso instanceof Date ? iso : new Date(iso)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** "YYYY-MM-DD" for an instant, in Israel time. */
export function civilDay(iso: string | Date): string {
  const { y, m, d } = civilDate(iso)
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Day-of-week for a civil date, 0 = Sunday. Computed from the civil parts via a
 * UTC probe, so it never re-reads the original instant's zone.
 */
function civilWeekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay()
}

/** Shift a "YYYY-MM-DD" by whole days. */
export function addDays(day: string, n: number): string {
  const t = new Date(`${day}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/**
 * The bucket a civil day falls in. The Israeli week starts on **Sunday**, so a
 * week bucket is keyed by the Sunday on or before the day.
 */
export function bucketOf(day: string, g: Granularity): { key: string; start: string } {
  if (g === "day")   return { key: day, start: day }
  if (g === "month") return { key: day.slice(0, 7), start: `${day.slice(0, 7)}-01` }
  const start = addDays(day, -civilWeekday(day))
  return { key: `w${start}`, start }
}

/** Every bucket start from `from` to `to` inclusive — including empty ones. */
export function bucketRange(from: string, to: string, g: Granularity): { key: string; start: string }[] {
  const out: { key: string; start: string }[] = []
  const seen = new Set<string>()
  // Walking day by day is O(days) and needs no month-length arithmetic; a
  // ten-year range is 3,650 iterations, which is nothing next to the query.
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const b = bucketOf(day, g)
    if (!seen.has(b.key)) { seen.add(b.key); out.push(b) }
  }
  return out
}

/**
 * The last civil day covered by a bucket — the inclusive end of the range it
 * represents. The timeline brush uses this to turn "the reader dragged across
 * these three months" back into a concrete `to` date.
 */
export function bucketEnd(start: string, g: Granularity): string {
  if (g === "day")  return start
  if (g === "week") return addDays(start, 6)
  const [y, m] = start.split("-").map(Number)
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${start.slice(0, 7)}-${pad(last)}`
}

const HE_MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"]

/** Short axis label for a bucket start. */
export function bucketLabel(start: string, g: Granularity): string {
  const [y, m, d] = start.split("-").map(Number)
  if (g === "month") return `${HE_MONTHS[m - 1]} ${y}`
  if (g === "week")  return `${d}.${m}`
  return `${d}.${m}`
}

// ── The timeline ────────────────────────────────────────────────────────────

/**
 * Opened / closed / backlog per bucket across [from, to].
 *
 * The backlog is seeded with everything that happened **before** `from`, so
 * narrowing the range pans the window over the real curve instead of restarting
 * it at zero. That is the difference between a chart you can trust and one that
 * makes every period look like a fresh start.
 */
export function buildTimeline(
  tickets: ReportTicket[], from: string, to: string, g: Granularity,
): Bucket[] {
  const buckets = bucketRange(from, to, g)
  const index = new Map(buckets.map((b, i) => [b.key, i]))

  const opened = new Array(buckets.length).fill(0)
  const closed = new Array(buckets.length).fill(0)
  let backlogBefore = 0

  for (const t of tickets) {
    const openDay = civilDay(t.createdAt)
    if (openDay < from) backlogBefore++
    else if (openDay <= to) {
      const i = index.get(bucketOf(openDay, g).key)
      if (i !== undefined) opened[i]++
    }

    if (!t.closedAt) continue
    const closeDay = civilDay(t.closedAt)
    if (closeDay < from) backlogBefore--
    else if (closeDay <= to) {
      const i = index.get(bucketOf(closeDay, g).key)
      if (i !== undefined) closed[i]++
    }
  }

  let running = backlogBefore
  return buckets.map((b, i) => {
    running += opened[i] - closed[i]
    return {
      key: b.key, start: b.start, label: bucketLabel(b.start, g),
      opened: opened[i], closed: closed[i], backlog: running,
    }
  })
}

// ── Slicing ─────────────────────────────────────────────────────────────────

/**
 * Tickets **opened** within [from, to]. Every breakdown below is scoped this
 * way: mixing "opened in the period" with "closed in the period" in one pie is
 * how a report starts lying — the two populations are not the same tickets.
 */
export function openedWithin(tickets: ReportTicket[], from: string, to: string): ReportTicket[] {
  return tickets.filter(t => { const d = civilDay(t.createdAt); return d >= from && d <= to })
}

/** Tickets **closed** within [from, to]. */
export function closedWithin(tickets: ReportTicket[], from: string, to: string): ReportTicket[] {
  return tickets.filter(t => {
    if (!t.closedAt) return false
    const d = civilDay(t.closedAt)
    return d >= from && d <= to
  })
}

// ── Breakdowns ──────────────────────────────────────────────────────────────

export type Slice = { label: string; count: number; share: number }

/**
 * Counts per distinct value of one field, largest first, with each slice's
 * share of the total (0–1). Ties break alphabetically so the order is stable
 * between renders rather than depending on Map insertion.
 */
export function countBy(tickets: ReportTicket[], field: "category" | "urgency" | "platform" | "status" | "assignedTo"): Slice[] {
  const counts = new Map<string, number>()
  for (const t of tickets) {
    const key = (t[field] || "—").trim() || "—"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = tickets.length
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "he"))
}

// ── Resolution time ─────────────────────────────────────────────────────────

/** Hours from open to close, for tickets that have both. */
export function resolutionHours(tickets: ReportTicket[]): number[] {
  return tickets
    .filter(t => t.closedAt)
    .map(t => (new Date(t.closedAt as string).getTime() - new Date(t.createdAt).getTime()) / 3_600_000)
    // A negative span means the close row predates the ticket, which should be
    // impossible; drop it rather than let it drag an average below zero.
    .filter(h => h >= 0)
}

/** Middle value — the average is worthless here, one week-long ticket skews it. */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** How many currently-closed tickets carry no recorded close date. */
export function countUndatedClosures(tickets: ReportTicket[]): number {
  return tickets.filter(t => t.status === CLOSED && !t.closedAt).length
}

// ── Summary ─────────────────────────────────────────────────────────────────

export type Summary = {
  opened: number
  closed: number
  /** closed ÷ opened for the period — >1 means the queue shrank. */
  closureRate: number | null
  stillOpen: number
  medianHours: number | null
  busiestLabel: string | null
  busiestCount: number
  topCategory: string | null
  topCategoryShare: number
  undatedClosures: number
}

export function summarize(
  all: ReportTicket[], from: string, to: string, timeline: Bucket[],
): Summary {
  const opened = openedWithin(all, from, to)
  const closed = closedWithin(all, from, to)
  const cats = countBy(opened, "category")
  const busiest = timeline.reduce<Bucket | null>(
    (best, b) => (best === null || b.opened > best.opened ? b : best), null,
  )
  return {
    opened: opened.length,
    closed: closed.length,
    closureRate: opened.length ? closed.length / opened.length : null,
    // Of the tickets opened in this window, how many are still not closed.
    stillOpen: opened.filter(t => t.status !== CLOSED).length,
    medianHours: median(resolutionHours(closed)),
    busiestLabel: busiest && busiest.opened > 0 ? busiest.label : null,
    busiestCount: busiest?.opened ?? 0,
    topCategory: cats[0]?.label ?? null,
    topCategoryShare: cats[0]?.share ?? 0,
    undatedClosures: countUndatedClosures(all),
  }
}

// ── Insights ────────────────────────────────────────────────────────────────

export type Insight = { tone: "good" | "warn" | "neutral"; text: string }

/** Round hours to something a person would say out loud. */
export function humanHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} דקות`
  if (h < 48) return `${h.toFixed(1)} שעות`
  return `${(h / 24).toFixed(1)} ימים`
}

/**
 * Plain-language readings of the numbers above. Deliberately few: a wall of
 * generated sentences is noise, and every line here has to be one a person
 * would actually act on.
 */
export function buildInsights(s: Summary, timeline: Bucket[]): Insight[] {
  const out: Insight[] = []

  if (s.opened === 0) {
    return [{ tone: "neutral", text: "לא נפתחו פניות בטווח הזה." }]
  }

  if (s.closureRate !== null) {
    const pct = Math.round(s.closureRate * 100)
    if (s.closureRate >= 1) {
      out.push({ tone: "good", text: `נסגרו ${pct}% ממספר הפניות שנפתחו — התור הצטמצם בתקופה הזו.` })
    } else if (s.closureRate >= 0.8) {
      out.push({ tone: "neutral", text: `נסגרו ${pct}% ממספר הפניות שנפתחו — התור כמעט מאוזן.` })
    } else {
      out.push({ tone: "warn", text: `נסגרו רק ${pct}% ממספר הפניות שנפתחו — התור גדל.` })
    }
  }

  if (s.medianHours !== null) {
    out.push({
      tone: s.medianHours <= 24 ? "good" : s.medianHours <= 72 ? "neutral" : "warn",
      text: `זמן טיפול חציוני: ${humanHours(s.medianHours)}.`,
    })
  }

  if (s.topCategory && s.topCategoryShare >= 0.25) {
    out.push({
      tone: "neutral",
      text: `${Math.round(s.topCategoryShare * 100)}% מהפניות בקטגוריה אחת — «${s.topCategory}».`,
    })
  }

  if (s.busiestLabel && timeline.length > 1) {
    out.push({ tone: "neutral", text: `היום העמוס ביותר: ${s.busiestLabel} — ${s.busiestCount} פניות.` })
  }

  // The backlog trend across the window, stated only when it actually moved.
  const first = timeline[0], last = timeline[timeline.length - 1]
  if (first && last && timeline.length > 1) {
    const delta = last.backlog - first.backlog
    if (delta > 0)      out.push({ tone: "warn", text: `מצבת הפניות הפתוחות גדלה ב-${delta} בתקופה הזו.` })
    else if (delta < 0) out.push({ tone: "good", text: `מצבת הפניות הפתוחות קטנה ב-${-delta} בתקופה הזו.` })
  }

  if (s.undatedClosures > 0) {
    out.push({
      tone: "neutral",
      text: `${s.undatedClosures} פניות סגורות ללא תאריך סגירה מתועד — הן נספרות כנפתחו, אך לא בגרף הסגירות.`,
    })
  }

  return out
}
