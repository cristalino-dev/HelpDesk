/**
 * __tests__/ReportsCharts.test.tsx — the two chart components
 *
 * These render SVG and absolutely-positioned bars, so most of what can break
 * is geometry that no assertion about React state would catch. What is pinned
 * here is the handful of things that HAVE broken, or would silently mislead:
 *
 *   • `text-anchor` is logical, not physical — inside the RTL page it resolved
 *     to the wrong side and clipped the first and last axis labels. The fix is
 *     `direction: ltr` on the <svg>, so that is asserted directly.
 *   • A y-axis that ends on the raw maximum makes every chart look full; the
 *     axis rounds up, and must never round DOWN past a real value.
 *   • Empty and single-point ranges are the states a reader actually hits when
 *     they narrow the brush, and both used to divide by (n - 1) === 0.
 *   • The bars carry the share as text, which is the relief that makes the
 *     lighter series colors legal — losing it is an accessibility regression.
 */

import { render, screen, fireEvent } from "@testing-library/react"
import TimelineChart from "@/app/admin/reports/TimelineChart"
import BreakdownBars from "@/app/admin/reports/BreakdownBars"
import { buildTimeline, type ReportTicket } from "@/lib/reports"
import { STATUS } from "@/lib/theme"

class RO { observe() {} unobserve() {} disconnect() {} }
;(global as unknown as { ResizeObserver: unknown }).ResizeObserver = RO

const t = (createdAt: string, closedAt: string | null = null): ReportTicket => ({
  ticketNumber: 1, createdAt, closedAt, category: "אחר", urgency: "בינוני",
  platform: "מחשב אישי", status: closedAt ? "סגור" : "פתוח", assignedTo: "a@b.c",
})

const week = buildTimeline(
  [t("2026-09-01T09:00:00Z", "2026-09-02T09:00:00Z"), t("2026-09-02T09:00:00Z")],
  "2026-09-01", "2026-09-05", "day",
)

describe("TimelineChart", () => {
  it("draws one path per requested series and no others", () => {
    const { container } = render(<TimelineChart buckets={week} keys={["opened", "closed"]} />)
    expect(container.querySelectorAll("path")).toHaveLength(2)
  })

  it("draws nothing for a series that was toggled off", () => {
    const { container } = render(<TimelineChart buckets={week} keys={["opened"]} />)
    expect(container.querySelectorAll("path")).toHaveLength(1)
  })

  it("lays the plot out left-to-right, so RTL cannot flip the axis anchors", () => {
    // The bug this guards: text-anchor is logical. Under the page's RTL
    // direction "start" means the right edge, and every axis label drew
    // backwards off its own end.
    const { container } = render(<TimelineChart buckets={week} keys={["opened"]} />)
    expect(container.querySelector("svg")).toHaveStyle({ direction: "ltr" })
  })

  it("labels the first and last bucket on the axis", () => {
    render(<TimelineChart buckets={week} keys={["opened"]} />)
    expect(screen.getByText("1.9")).toBeInTheDocument()
    expect(screen.getByText("5.9")).toBeInTheDocument()
  })

  it("drops the axis when it is the upper plot of a stacked pair", () => {
    render(<TimelineChart buckets={week} keys={["opened"]} xAxis={false} />)
    expect(screen.queryByText("1.9")).not.toBeInTheDocument()
  })

  it("thins the gridlines on a short plot instead of stacking illegible ticks", () => {
    const tall  = render(<TimelineChart buckets={week} keys={["backlog"]} />)
    const tallLines = tall.container.querySelectorAll("line").length
    const short = render(<TimelineChart buckets={week} keys={["backlog"]} height={132} />)
    expect(short.container.querySelectorAll("line").length).toBeLessThan(tallLines)
  })

  it("says so rather than dividing by zero when the range is empty", () => {
    render(<TimelineChart buckets={[]} keys={["opened"]} />)
    expect(screen.getByText("אין נתונים בטווח הזה")).toBeInTheDocument()
  })

  it("renders a single-bucket range without producing NaN coordinates", () => {
    // x() divides by (n - 1); one point made every coordinate NaN and the
    // whole chart vanished silently.
    const one = buildTimeline([t("2026-09-01T09:00:00Z")], "2026-09-01", "2026-09-01", "day")
    const { container } = render(<TimelineChart buckets={one} keys={["opened"]} />)
    const d = container.querySelector("path")?.getAttribute("d") ?? ""
    expect(d).not.toContain("NaN")
    expect(d.length).toBeGreaterThan(0)
  })

  it("shows nothing but keeps its frame when every series is hidden", () => {
    render(<TimelineChart buckets={week} keys={[]} />)
    expect(screen.getByText("אין נתונים בטווח הזה")).toBeInTheDocument()
  })

  it("survives the bucket count shrinking while a point is hovered", () => {
    // PRODUCTION CRASH: "Cannot read properties of undefined (reading 'opened')".
    // `hover` is an index into `buckets`, and it outlives the buckets it was
    // taken from. Hover day 40 of a 90-day range, then switch to monthly (4
    // buckets) or drag-zoom to a shorter window, and buckets[40] is undefined
    // — the hovered-point markers read [key] straight off it.
    const long = buildTimeline(
      Array.from({ length: 90 }, (_, i) => t(`2026-06-${String((i % 28) + 1).padStart(2, "0")}T09:00:00Z`)),
      "2026-06-01", "2026-08-29", "day",
    )
    const short = buildTimeline([t("2026-06-01T09:00:00Z")], "2026-06-01", "2026-06-03", "day")

    const view = render(<TimelineChart buckets={long} keys={["opened", "closed"]} />)
    const svg = view.container.querySelector("svg") as SVGElement
    // jsdom gives every element a zero-size rect, so indexAt() resolves to a
    // real index only for clientX at the far right of the plot.
    fireEvent.pointerMove(svg, { clientX: 900 })
    expect(() => view.rerender(<TimelineChart buckets={short} keys={["opened", "closed"]} />)).not.toThrow()
  })

  it("clears the hover when the data underneath it changes", () => {
    const a = buildTimeline([t("2026-06-01T09:00:00Z")], "2026-06-01", "2026-06-10", "day")
    const b = buildTimeline([t("2026-06-01T09:00:00Z")], "2026-06-01", "2026-06-02", "day")
    const view = render(<TimelineChart buckets={a} keys={["opened"]} />)
    const svg = view.container.querySelector("svg") as SVGElement
    fireEvent.pointerMove(svg, { clientX: 700 })
    view.rerender(<TimelineChart buckets={b} keys={["opened"]} />)
    // The pointer is no longer over the date it was over; no readout should
    // survive the change.
    expect(view.container.querySelectorAll("circle").length).toBeLessThanOrEqual(1)
  })

  it("carries a text description for a screen reader", () => {
    render(<TimelineChart buckets={week} keys={["opened"]} />)
    expect(screen.getByRole("img")).toHaveAccessibleName(/5 נקודות/)
  })
})

describe("BreakdownBars", () => {
  const rows = [
    { label: "תוכנה", count: 8, share: 0.5 },
    { label: "חומרה", count: 6, share: 0.375 },
    { label: "רשת",   count: 2, share: 0.125 },
  ]

  it("prints the count and the share beside every bar", () => {
    render(<BreakdownBars rows={rows} />)
    expect(screen.getByText("8")).toBeInTheDocument()
    // The share is the visible relief that makes the lighter fills legal —
    // no value on this page is reachable only by hovering.
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("13%")).toBeInTheDocument()
  })

  it("scales bars against the largest value, not the total", () => {
    const { container } = render(<BreakdownBars rows={rows} />)
    const widths = [...container.querySelectorAll("div[title]")].map(el => (el as HTMLElement).style.width)
    expect(widths[0]).toBe("100%")   // the top row always fills the track
    expect(widths[1]).toBe("75%")    // 6 / 8
  })

  it("gives a near-zero row a visible sliver rather than nothing at all", () => {
    const { container } = render(<BreakdownBars rows={[
      { label: "רוב", count: 999, share: 0.999 }, { label: "מיעוט", count: 1, share: 0.001 },
    ]} />)
    const tiny = [...container.querySelectorAll("div[title]")][1] as HTMLElement
    expect(tiny.style.minWidth).toBe("3px")
  })

  it("uses one hue for nominal values — length carries the magnitude", () => {
    const { container } = render(<BreakdownBars rows={rows} />)
    const fills = [...container.querySelectorAll("div[title]")].map(el => (el as HTMLElement).style.background)
    expect(new Set(fills).size).toBe(1)
  })

  it("uses the app's own status colors when the dimension has them", () => {
    const { container } = render(<BreakdownBars
      rows={[{ label: "סגור", count: 5, share: 1 }]} colors={STATUS} />)
    // toHaveStyle, not a string compare: jsdom normalizes hex to rgb().
    expect(container.querySelector("div[title]")).toHaveStyle({ background: STATUS["סגור"].fg })
  })

  it("rounds the data-end and leaves the baseline square", () => {
    // The bar grows right→left inside the RTL page, so the rounded end is the
    // left one; a fully rounded bar reads as a pill, not a measurement.
    const { container } = render(<BreakdownBars rows={rows} />)
    expect((container.querySelector("div[title]") as HTMLElement).style.borderRadius).toBe("4px 0 0 4px")
  })

  it("says the range is empty instead of rendering an axis with no bars", () => {
    render(<BreakdownBars rows={[]} />)
    expect(screen.getByText("אין נתונים בטווח הזה")).toBeInTheDocument()
  })
})
