/**
 * app/admin/reports/TimelineChart.tsx — opened / closed / backlog over time
 *
 * Hand-rolled SVG. The app has no charting dependency and this needs one line
 * generator, one axis and a hover layer; a library would be more bytes than
 * code. Everything is laid out in pixel space measured from the container, so
 * the chart is responsive without a viewBox rescaling the type.
 *
 * ── HOW IT IS READ ────────────────────────────────────────────────────────
 * • Two series carry the flow — opened and closed — plus an optional backlog
 *   line. All three are counts of tickets, so they share ONE y-axis. (A second
 *   axis would let any two of them be posed into whatever relationship the
 *   reader wanted to see; same unit, same scale, always.)
 * • A crosshair snaps to the nearest bucket and the tooltip lists every series
 *   at that x, so the pointer never has to find a 2px line.
 * • Dragging across the plot selects a period — that is the "play with it"
 *   part; the parent turns the selection into a date range.
 *
 * Colors are the documented categorical slots 1–3, validated for CVD
 * separation and contrast against a white card. They are chart colors, not
 * brand colors: the brand green sits at 2.15:1 on white, which is too faint to
 * carry a 2px line on its own.
 *
 * Time runs left→right even though the page is RTL — a time axis is read the
 * same way in both, and the dates themselves are LTR. The y-axis labels sit on
 * the RIGHT, which is the near edge for a Hebrew reader.
 *
 * ── TWO TRAPS THIS FILE ALREADY FELL INTO ────────────────────────────────
 * 1. `text-anchor` is LOGICAL, not physical. Inside the RTL page "start" means
 *    the right edge, so every axis label drew backwards off its own end and the
 *    first and last ticks were clipped. The <svg> therefore sets
 *    `direction: ltr` — the plot is an LTR coordinate space with Hebrew labels
 *    in it, and bidi still lays out each label correctly on its own.
 * 2. The backlog is an order of magnitude larger than the daily flow, so
 *    plotting it beside opened/closed flattened both into an unreadable band at
 *    the baseline. It gets its OWN plot instead, stacked beneath and sharing the
 *    x positions — small multiples, never a second y-axis.
 */

"use client"
import { useEffect, useRef, useState } from "react"
import { T } from "@/lib/theme"
import type { Bucket } from "@/lib/reports"

export const SERIES = {
  opened:  { color: "#2a78d6", label: "נפתחו" },
  closed:  { color: "#eb6834", label: "נסגרו" },
  backlog: { color: "#1baf7a", label: "פתוחות במצטבר" },
} as const

export type SeriesKey = keyof typeof SERIES

// `left` leaves room for the first x-label to sit fully inside the plot.
const PAD = { top: 18, right: 48, bottom: 30, left: 26 }

type Props = {
  buckets: Bucket[]
  /** Which series this plot draws, in order. */
  keys: SeriesKey[]
  /** Called with inclusive bucket indices when the reader drags a selection. */
  onBrush?: (fromIndex: number, toIndex: number) => void
  height?: number
  /** Off for the upper plot of a stacked pair, so one axis serves both. */
  xAxis?: boolean
}

/** Round a maximum up to a clean axis top (5 / 10 / 25 / 50 / 100 …). */
export function axisMax(v: number): number {
  if (v <= 5) return 5
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * mag
    if (candidate >= v) return candidate
  }
  return 10 * mag
}

export default function TimelineChart({ buckets, keys, onBrush, height = 300, xAxis = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)

  // Measure rather than guess: the card is fluid and the axis has to land on
  // real pixels for the crosshair to sit under the pointer.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.max(320, w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = buckets.length
  const bottom = xAxis ? PAD.bottom : 10
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - bottom

  const active = keys
  const peak = Math.max(1, ...buckets.flatMap(b => active.map(k => b[k])))
  const top = axisMax(peak)

  const x = (i: number) => (n <= 1 ? PAD.left + plotW / 2 : PAD.left + (i * plotW) / (n - 1))
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH

  const path = (key: SeriesKey) =>
    buckets.map((b, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(b[key]).toFixed(1)}`).join(" ")

  /** Nearest bucket index for a pointer event. */
  const indexAt = (clientX: number): number => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || n === 0) return 0
    if (n === 1) return 0
    const raw = ((clientX - rect.left - PAD.left) / plotW) * (n - 1)
    return Math.max(0, Math.min(n - 1, Math.round(raw)))
  }

  // Five gridlines crowd into illegible stripes on the short backlog plot, so
  // the tick count follows the height rather than being fixed.
  const fractions = plotH < 140 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]
  const uniqueTicks = [...new Set(fractions.map(f => Math.round(top * f)))]

  // Label roughly six x-ticks however long the range is, always including the
  // last bucket so the axis ends on a real date rather than mid-stride.
  const step = Math.max(1, Math.ceil(n / 6))
  const xTickIndices = buckets.map((_, i) => i).filter(i => i % step === 0 || i === n - 1)

  if (n === 0 || active.length === 0) {
    return (
      <div ref={wrapRef} style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: "0.88rem" }}>
        אין נתונים בטווח הזה
      </div>
    )
  }

  // `hover` is an index, and it outlives the buckets it was taken from: hover
  // day 40 of a 90-day range, then switch to monthly or drag-zoom to a shorter
  // window, and buckets[40] is gone. Everything below reads THIS, never
  // buckets[hover]. An effect resetting the index would not help — it runs
  // after the render that would already have crashed — and resolving to
  // undefined here is also the behaviour we want: the crosshair lets go until
  // the pointer moves again, because it is no longer over the date it marked.
  const hovered = hover !== null ? buckets[hover] : undefined

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", userSelect: "none" }}>
      <svg
        width={width} height={height} role="img"
        aria-label={`גרף פניות לאורך זמן, ${n} נקודות`}
        // direction:ltr — see trap 1 in the header. Without it every
        // text-anchor resolves to the wrong side and the end labels clip.
        style={{ display: "block", touchAction: "pan-y", direction: "ltr", cursor: onBrush ? "crosshair" : "default" }}
        onPointerMove={e => {
          const i = indexAt(e.clientX)
          setHover(i)
          setDrag(d => (d ? { ...d, to: i } : d))
        }}
        onPointerLeave={() => { setHover(null); setDrag(null) }}
        onPointerDown={e => {
          if (!onBrush) return
          const i = indexAt(e.clientX)
          setDrag({ from: i, to: i })
        }}
        onPointerUp={() => {
          if (drag && onBrush && drag.from !== drag.to) {
            onBrush(Math.min(drag.from, drag.to), Math.max(drag.from, drag.to))
          }
          setDrag(null)
        }}
      >
        {/* Gridlines — hairline, solid, one step off the surface. */}
        {uniqueTicks.map(v => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={T.border} strokeWidth={1} />
            <text x={width - PAD.right + 8} y={y(v) + 4} fontSize={11} fill={T.muted} textAnchor="start">{v}</text>
          </g>
        ))}

        {/* The drag selection, drawn under the data. */}
        {drag && drag.from !== drag.to && (
          <rect
            x={Math.min(x(drag.from), x(drag.to))} y={PAD.top}
            width={Math.abs(x(drag.to) - x(drag.from))} height={plotH}
            fill="#2a78d6" opacity={0.10}
          />
        )}

        {/* Crosshair: the reader aims at a date, not at a line. */}
        {hovered && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke={T.borderStrong} strokeWidth={1} />
        )}

        {active.map(key => (
          <path
            key={key} d={path(key)} fill="none" stroke={SERIES[key].color}
            strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          />
        ))}

        {/* End dot: the last value, without hovering at all. */}
        {active.map(key => (
          <circle
            key={`end-${key}`} cx={x(n - 1)} cy={y(buckets[n - 1][key])} r={4}
            fill={SERIES[key].color} stroke="#FFFFFF" strokeWidth={2}
          />
        ))}

        {/* The hovered point on every active series, ringed so it stays legible
            where two lines cross. */}
        {hovered && hover !== null && active.map(key => (
          <circle
            key={`hv-${key}`} cx={x(hover)} cy={y(hovered[key])} r={4.5}
            fill={SERIES[key].color} stroke="#FFFFFF" strokeWidth={2}
          />
        ))}

        {xAxis && xTickIndices.map(i => (
          <text
            key={i} x={x(i)} y={height - 10} fontSize={11} fill={T.muted}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          >{buckets[i].label}</text>
        ))}
      </svg>

      {hovered && (
        <div
          style={{
            position: "absolute", top: 8,
            // Follow the pointer's half of the card so the readout never covers
            // the point being read.
            [x(hover as number) > width / 2 ? "left" : "right"]: 12,
            background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: 10,
            boxShadow: "0 6px 20px rgba(20,22,26,0.10)", padding: "9px 12px",
            pointerEvents: "none", minWidth: 132, direction: "rtl",
          }}
        >
          <div style={{ fontSize: "0.74rem", color: T.text3, marginBottom: 6, fontWeight: 600 }}>{hovered.label}</div>
          {active.map(key => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
              <span style={{ width: 12, height: 2, background: SERIES[key].color, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: T.text }}>{hovered[key]}</span>
              <span style={{ fontSize: "0.76rem", color: T.text3 }}>{SERIES[key].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
