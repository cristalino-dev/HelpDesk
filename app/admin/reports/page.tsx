/**
 * app/admin/reports/page.tsx — Reports: tickets over time, by category, with insights
 *
 * Admin-only. Answers three questions in one screen:
 *   1. What happened over time?      → the timeline (opened / closed / backlog)
 *   2. What kind of tickets were they? → breakdowns by category, urgency,
 *                                        platform, status and technician
 *   3. What does it mean?             → plain-language insights
 *
 * ── WHY THE ARITHMETIC IS CLIENT-SIDE ─────────────────────────────────────
 * /api/admin/reports returns one flat row per ticket, once. Every control on
 * this page — the range presets, the custom dates, day/week/month, dragging a
 * selection across the chart — recomputes from that array through the pure
 * functions in lib/reports.ts. No control costs a round trip, which is what
 * makes the timeline feel like something you can play with rather than a form
 * you submit. See the route's header for the size trade-off.
 *
 * The filter row scopes EVERYTHING below it, so the tiles, the chart, the
 * breakdowns and the insights can never disagree with each other.
 */

"use client"
import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import AppHeader from "@/components/AppHeader"
import AppNav from "@/components/AppNav"
import FooterCopyright from "@/components/FooterCopyright"
import { T, STATUS, URGENCY } from "@/lib/theme"
import { useIsMobile } from "@/lib/useIsMobile"
import TimelineChart, { SERIES, type SeriesKey } from "./TimelineChart"
import BreakdownBars from "./BreakdownBars"
import {
  buildTimeline, summarize, buildInsights, countBy, openedWithin,
  civilDay, addDays, bucketEnd, humanHours,
  type Granularity, type ReportTicket,
} from "@/lib/reports"

// ── Small presentational pieces (module scope: a component declared inside
// another is a new type on every render, and React remounts it — which would
// drop focus from the date inputs on every keystroke). ──────────────────────

function Card({ title, subtitle, children, action }: {
  title?: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px 20px" }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: subtitle ? 2 : 14 }}>
          {title && <h2 style={{ fontSize: "0.98rem", fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>}
          {action}
        </div>
      )}
      {subtitle && <p style={{ fontSize: "0.78rem", color: T.text3, margin: "0 0 14px" }}>{subtitle}</p>}
      {children}
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "15px 17px" }}>
      <div style={{ fontSize: "0.76rem", color: T.text3, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.65rem", fontWeight: 700, color: T.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: "0.73rem", color: T.muted, marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

/** Pill button used by every filter control on the page. */
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600,
        border: `1px solid ${active ? T.dark : T.borderStrong}`,
        background: active ? T.dark : T.card, color: active ? "#FFFFFF" : T.text2,
      }}
    >{children}</button>
  )
}

const exportItem: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
  borderRadius: 8, cursor: "pointer", textDecoration: "none",
  padding: "8px 10px", textAlign: "right", width: "100%", color: T.text,
  fontSize: "0.82rem",
}

const exportHint: React.CSSProperties = { fontSize: "0.72rem", color: T.text3, fontWeight: 500 }

const INSIGHT_TONE = {
  good:    { fg: "#3E7A24", bg: "#E9F4E2", icon: "✓" },
  warn:    { fg: "#A9741A", bg: "#FBF1DE", icon: "!" },
  neutral: { fg: "#5B6260", bg: "#F1F2F0", icon: "•" },
} as const

const DIMENSIONS = [
  { key: "category",   label: "קטגוריה" },
  { key: "urgency",    label: "דחיפות" },
  { key: "platform",   label: "פלטפורמה" },
  { key: "status",     label: "סטטוס" },
  { key: "assignedTo", label: "משויך ל" },
] as const
type DimKey = (typeof DIMENSIONS)[number]["key"]

const PRESETS = [
  { label: "7 ימים",  days: 7 },
  { label: "30 יום",  days: 30 },
  { label: "90 יום",  days: 90 },
  { label: "שנה",     days: 365 },
] as const

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "יומי" }, { key: "week", label: "שבועי" }, { key: "month", label: "חודשי" },
]

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()

  const [tickets, setTickets] = useState<ReportTicket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useMemo(() => civilDay(new Date()), [])

  const [from, setFrom] = useState(() => addDays(civilDay(new Date()), -29))
  const [to, setTo] = useState(today)
  const [gran, setGran] = useState<Granularity>("day")
  const [dim, setDim] = useState<DimKey>("category")
  const [showTable, setShowTable] = useState(false)
  /** The export menu, and the ticket number typed into its third option. */
  const [exportOpen, setExportOpen] = useState(false)
  const [exportTicket, setExportTicket] = useState("")
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({ opened: true, closed: true, backlog: false })

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    if (status === "authenticated" && !session?.user?.isAdmin) router.push("/dashboard")
  }, [status, session, router])

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.isAdmin) return
    fetch("/api/admin/reports")
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then(d => setTickets(Array.isArray(d.tickets) ? d.tickets : []))
      .catch(() => setError("טעינת הנתונים נכשלה"))
  }, [status, session])

  // Everything below recomputes from `tickets` — no refetch on any control.
  const timeline = useMemo(
    () => (tickets ? buildTimeline(tickets, from, to, gran) : []),
    [tickets, from, to, gran],
  )
  const summary  = useMemo(
    () => (tickets ? summarize(tickets, from, to, timeline) : null),
    [tickets, from, to, timeline],
  )
  const insights = useMemo(
    () => (summary ? buildInsights(summary, timeline) : []),
    [summary, timeline],
  )
  const openedRows = useMemo(
    () => (tickets ? openedWithin(tickets, from, to) : []),
    [tickets, from, to],
  )
  const breakdown = useMemo(() => countBy(openedRows, dim), [openedRows, dim])

  const applyPreset = (days: number) => { setFrom(addDays(today, -(days - 1))); setTo(today) }
  const showAll = () => {
    if (!tickets || tickets.length === 0) return
    setFrom(civilDay(tickets.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt))
    setTo(today)
  }

  // Dragging across the chart narrows the range to the selected buckets.
  const onBrush = (i: number, j: number) => {
    const start = timeline[i]?.start, end = timeline[j]?.start
    if (!start || !end) return
    setFrom(start)
    setTo(bucketEnd(end, gran))
  }

  // The two flow series share one plot; the backlog gets its own (see the
  // chart component's header for why).
  const flowKeys = (["opened", "closed"] as SeriesKey[]).filter(k => show[k])

  // Each export is a plain link to the endpoint, which streams the file with
  // its own filename. An anchor rather than a scripted navigation: it is the
  // element that means "download", it can be opened in a new tab or copied,
  // and there is no blob or object URL to leak.
  const exportHref = (params: Record<string, string>) =>
    `/api/admin/reports/export?${new URLSearchParams(params)}`

  /** Digits only — people say "HDTC-565" as often as "565". */
  const exportTicketNumber = exportTicket.replace(/\D/g, "")

  const dimColors = dim === "status" ? STATUS : dim === "urgency" ? URGENCY : undefined

  if (status === "loading" || (!tickets && !error)) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
        טוען דוחות…
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <AppHeader logoHref="/admin" subtitle="דוחות"><AppNav /></AppHeader>

      <main style={{ flex: 1, maxWidth: 1180, width: "100%", margin: "0 auto", padding: isMobile ? "18px 14px 40px" : "26px 28px 52px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: T.text, margin: "0 0 4px" }}>דוחות</h1>
          <p style={{ fontSize: "0.85rem", color: T.text3, margin: 0 }}>
            פניות שנפתחו ונסגרו לאורך זמן. בחרו טווח, או גררו על הגרף כדי להתמקד בתקופה.
          </p>
        </div>

        {error && (
          <div style={{ background: "#FBEAEA", color: "#B4453F", border: "1px solid #F0D2D1", borderRadius: 12, padding: "12px 16px", fontSize: "0.87rem" }}>{error}</div>
        )}

        {/* ── Filters: one row, above everything they scope ─────────────── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "13px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map(p => {
              const isActive = to === today && from === addDays(today, -(p.days - 1))
              return <Pill key={p.days} active={isActive} onClick={() => applyPreset(p.days)}>{p.label}</Pill>
            })}
            <Pill active={false} onClick={showAll}>הכל</Pill>
          </div>

          <span style={{ width: 1, height: 22, background: T.border }} />

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: T.text3 }}>
            מ־
            <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)}
              style={{ border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: "5px 8px", fontSize: "0.8rem", color: T.text, background: T.card }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: T.text3 }}>
            עד
            <input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)}
              style={{ border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: "5px 8px", fontSize: "0.8rem", color: T.text, background: T.card }} />
          </label>

          <span style={{ width: 1, height: 22, background: T.border }} />

          <div style={{ display: "flex", gap: 6 }}>
            {GRANULARITIES.map(g => <Pill key={g.key} active={gran === g.key} onClick={() => setGran(g.key)}>{g.label}</Pill>)}
          </div>

          <div style={{ position: "relative", marginRight: "auto" }}>
            <button
              onClick={() => setExportOpen(o => !o)}
              aria-expanded={exportOpen} aria-haspopup="menu"
              style={{
                display: "flex", alignItems: "center", gap: 7, background: T.dark, color: "#FFFFFF",
                border: "none", borderRadius: 9, padding: "8px 15px", fontSize: "0.82rem",
                fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              ייצוא לאקסל
            </button>

            {exportOpen && (
              <div
                role="menu" aria-label="ייצוא לאקסל"
                style={{
                  position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 50, minWidth: 250,
                  background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: 12,
                  boxShadow: "0 10px 30px rgba(20,22,26,0.14)", padding: 7,
                  display: "flex", flexDirection: "column", gap: 2,
                }}
              >
                <a href={exportHref({ scope: "all" })} onClick={() => setExportOpen(false)} style={exportItem}>
                  <span style={{ fontWeight: 700 }}>כל הפניות</span>
                  <span style={exportHint}>כל מה שנפתח אי פעם</span>
                </a>

                <a href={exportHref({ scope: "range", from, to })} onClick={() => setExportOpen(false)} style={exportItem}>
                  <span style={{ fontWeight: 700 }}>הטווח הנבחר</span>
                  <span style={exportHint}>{from} — {to}</span>
                </a>

                <div style={{ height: 1, background: T.border, margin: "5px 4px" }} />

                <div style={{ padding: "4px 10px 8px" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: T.text, marginBottom: 6 }}>פנייה בודדת</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={exportTicket}
                      onChange={e => setExportTicket(e.target.value)}
                      placeholder="מספר פנייה, למשל 565"
                      aria-label="מספר פנייה לייצוא"
                      style={{ flex: 1, minWidth: 0, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: "6px 9px", fontSize: "0.8rem", background: T.card, color: T.text }}
                    />
                    {/* An anchor only when there is something to fetch: a link
                        to an export of nothing is worse than no link. */}
                    {exportTicketNumber ? (
                      <a
                        href={exportHref({ scope: "ticket", ticket: exportTicketNumber })}
                        onClick={() => setExportOpen(false)}
                        style={{ background: T.dark, color: "#FFFFFF", borderRadius: 8, padding: "6px 13px", fontSize: "0.8rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                      >ייצוא</a>
                    ) : (
                      <span
                        aria-disabled="true"
                        style={{ background: T.cardMuted, color: T.muted, borderRadius: 8, padding: "6px 13px", fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap" }}
                      >ייצוא</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Headline numbers ──────────────────────────────────────────── */}
        {summary && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
            <Stat label="נפתחו בתקופה" value={String(summary.opened)} />
            <Stat label="נסגרו בתקופה" value={String(summary.closed)}
              hint={summary.closureRate !== null ? `${Math.round(summary.closureRate * 100)}% מהנפתחות` : undefined} />
            <Stat label="עדיין פתוחות" value={String(summary.stillOpen)} hint="מתוך אלו שנפתחו בתקופה" />
            <Stat label="זמן טיפול חציוני" value={summary.medianHours !== null ? humanHours(summary.medianHours) : "—"}
              hint={summary.medianHours !== null ? "מפתיחה עד סגירה" : "אין סגירות בתקופה"} />
          </div>
        )}

        {/* ── The timeline ──────────────────────────────────────────────── */}
        <Card
          title="ציר זמן"
          subtitle="גררו לרוחב הגרף כדי להתמקד בתקופה. לחיצה על מקרא מסתירה או מציגה סדרה."
          action={
            <button onClick={() => setShowTable(v => !v)}
              style={{ fontSize: "0.76rem", color: T.text3, background: "none", border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}>
              {showTable ? "הסתר טבלה" : "הצג כטבלה"}
            </button>
          }
        >
          {/* Legend — always present for two or more series, so identity never
              rests on color alone. */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
            {(Object.keys(SERIES) as SeriesKey[]).map(k => (
              <button key={k} onClick={() => setShow(s => ({ ...s, [k]: !s[k] }))}
                style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: "3px 0", opacity: show[k] ? 1 : 0.4 }}>
                <span style={{ width: 14, height: 2, borderRadius: 2, background: SERIES[k].color }} />
                <span style={{ fontSize: "0.8rem", color: T.text2, fontWeight: 600 }}>{SERIES[k].label}</span>
              </button>
            ))}
          </div>

          {/* Flow and backlog are plotted separately: the backlog is an order
              of magnitude larger, and sharing one y-axis flattens the daily
              flow into an unreadable band. Same x, stacked — never a second
              y-axis. */}
          {flowKeys.length > 0 && (
            <TimelineChart buckets={timeline} keys={flowKeys} onBrush={onBrush} xAxis={!show.backlog} />
          )}
          {show.backlog && (
            <TimelineChart
              buckets={timeline} keys={["backlog"]} onBrush={onBrush}
              height={flowKeys.length > 0 ? 132 : 300}
            />
          )}
          {flowKeys.length === 0 && !show.backlog && (
            <p style={{ color: T.muted, fontSize: "0.85rem", margin: "40px 0", textAlign: "center" }}>
              כל הסדרות מוסתרות — לחצו על המקרא כדי להציג אותן.
            </p>
          )}

          {showTable && (
            <div style={{ marginTop: 14, maxHeight: 280, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ background: T.cardMuted, position: "sticky", top: 0 }}>
                    {["תקופה", "נפתחו", "נסגרו", "פתוחות במצטבר"].map(h => (
                      <th key={h} style={{ textAlign: "right", padding: "8px 12px", color: T.text3, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map(b => (
                    <tr key={b.key}>
                      <td style={{ padding: "7px 12px", color: T.text2, borderBottom: `1px solid ${T.border}` }}>{b.label}</td>
                      <td style={{ padding: "7px 12px", color: T.text, fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${T.border}` }}>{b.opened}</td>
                      <td style={{ padding: "7px 12px", color: T.text, fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${T.border}` }}>{b.closed}</td>
                      <td style={{ padding: "7px 12px", color: T.text, fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${T.border}` }}>{b.backlog}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.15fr 1fr", gap: 16, alignItems: "start" }}>
          {/* ── Breakdowns ─────────────────────────────────────────────── */}
          <Card
            title="פילוח הפניות"
            subtitle="לפי הפניות שנפתחו בטווח הנבחר"
            action={
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {DIMENSIONS.map(d => <Pill key={d.key} active={dim === d.key} onClick={() => setDim(d.key)}>{d.label}</Pill>)}
              </div>
            }
          >
            <BreakdownBars rows={breakdown} colors={dimColors} />
          </Card>

          {/* ── Insights ──────────────────────────────────────────────── */}
          <Card title="תובנות">
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {insights.map((ins, i) => {
                const tone = INSIGHT_TONE[ins.tone]
                return (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: tone.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <span style={{ color: tone.fg, fontWeight: 700, fontSize: "0.85rem", lineHeight: 1.5 }}>{tone.icon}</span>
                    <span style={{ fontSize: "0.84rem", color: T.text2, lineHeight: 1.55 }}>{ins.text}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </main>
      <FooterCopyright />
    </div>
  )
}
