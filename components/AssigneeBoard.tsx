"use client"
/**
 * components/AssigneeBoard.tsx — the admin console's "לפי מטפל" tab (v3.107).
 *
 * The open tickets of each helpdesk member in one place: a card per person
 * with how many they hold, how many are past their SLA and how many are P1/P2,
 * and below it their tickets ranked by the internal priority. Filtered by
 * assignee first, then by the reporter's urgency and the internal priority.
 * The internal priority and the assignee can be changed from the row — this is
 * where triage and load-balancing happen.
 *
 * The tickets are the console's own (GET /api/tickets/all); what to show and
 * in what order is lib/assigneeBoard.ts.
 */

import { Fragment, useEffect, useMemo, useState } from "react"
import type { TicketWithUser } from "@/types/ticket"
import { T, STATUS, URGENCY, PRIORITY } from "@/lib/theme"
import { ticketLabel } from "@/lib/ticketType"
import { updateTicket } from "@/lib/ticketApi"
import { useSla, usePrioritySla } from "@/lib/useSla"
import { useIsMobile } from "@/lib/useIsMobile"
import { workdaysBetween, formatWorkdays } from "@/lib/workdays"
import {
  INTERNAL_PRIORITIES, UNCLASSIFIED_LABEL, formatClockSpan, normalizePriority, priorityLabel, slaState,
  type InternalPriority,
} from "@/lib/internalPriority"
import {
  NO_FILTERS, assigneeLanes, filterBoard, isOnBoard, matchesSecondary, sameAssignee,
  type BoardClock, type BoardFilters, type PriorityFilter,
} from "@/lib/assigneeBoard"
import { BOT_EMAIL } from "@/lib/staffEmails"
import PrioritySelect from "@/components/PrioritySelect"

interface Props {
  tickets: TicketWithUser[]
  loading: boolean
  staffMembers: { email: string; display: string }[]
  urgencies: string[]
  /** A local change landed: patch the console's copy so every tab agrees. */
  onPatched: (id: string, patch: Partial<TicketWithUser>) => void
  /** Reload from the server — after a change with side effects (self-assign moves פתוח to בטיפול). */
  onReload: () => void
}

const chip = (active: boolean, bg?: string, fg?: string): React.CSSProperties => ({
  padding: "4px 11px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  border: active ? `2px solid ${fg ?? T.text}` : `1px solid ${T.line}`,
  background: active ? (bg ?? T.codeBg) : T.card, color: active ? (fg ?? T.text) : T.inkMuted,
})

const pill: React.CSSProperties = { display: "inline-block", padding: "2px 9px", borderRadius: 8, fontSize: "0.7rem", fontWeight: 600, whiteSpace: "nowrap" }

const initials = (name: string) => name.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase()

export default function AssigneeBoard({ tickets, loading, staffMembers, urgencies, onPatched, onReload }: Props) {
  const isMobile = useIsMobile()
  const sla = useSla()
  const prioritySla = usePrioritySla()
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One moment for every row and card, moved on each minute so "נותרו 3 ש׳"
  // counts down while the tab is open.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(tick)
  }, [])
  const clock: BoardClock = useMemo(() => ({ sla, prioritySla, now }), [sla, prioritySla, now])

  const { lanes, visible, totals } = useMemo(() => {
    const open = tickets.filter(isOnBoard)
    // The cards follow the secondary filters, not the assignee one: they are
    // how you pick an assignee, so they keep showing everybody.
    const secondary = open.filter(t => matchesSecondary(t, filters, clock))
    const lanes = assigneeLanes(secondary, staffMembers, clock, [BOT_EMAIL])
    const visible = filterBoard(open, filters, clock)
    const totals = {
      count: secondary.length,
      overdue: lanes.reduce((n, l) => n + l.overdue, 0),
      top: lanes.reduce((n, l) => n + l.byPriority.P1 + l.byPriority.P2, 0),
      unclassified: lanes.reduce((n, l) => n + l.unclassified, 0),
    }
    return { lanes, visible, totals }
  }, [tickets, filters, clock, staffMembers])

  const filtered = filters.urgencies.length > 0 || filters.priorities.length > 0 || filters.overdueOnly
  const toggle = <K extends "urgencies" | "priorities">(key: K, value: BoardFilters[K][number]) =>
    setFilters(f => {
      const list = f[key] as string[]
      return { ...f, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] }
    })

  const save = async (t: TicketWithUser, patch: { internalPriority?: InternalPriority | null; assignedTo?: string }) => {
    setSaving(t.id)
    setError(null)
    try {
      const ok = await updateTicket(t.id, patch)
      if (!ok) { setError(`השמירה של ${ticketLabel(t)} נכשלה — נסו שוב`); onReload(); return }
      onPatched(t.id, patch)
      if (patch.assignedTo !== undefined) onReload()
    } finally {
      setSaving(null)
    }
  }

  const groups = filters.assignee === null
    ? lanes.map(l => ({ ...l, tickets: visible.filter(t => sameAssignee(t.assignedTo, l.email)) })).filter(l => l.tickets.length > 0)
    : [{ email: filters.assignee, display: lanes.find(l => sameAssignee(l.email, filters.assignee))?.display ?? filters.assignee, tickets: visible }]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: T.text }}>מבט לפי מטפל</h2>
        <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: T.inkFaint, lineHeight: 1.6 }}>
          הפניות הפתוחות של כל איש צוות, מדורגות לפי דחיפות פנימית — ובתוך כל רמה, לפי הזמן שנותר ל-SLA.
          הדחיפות הפנימית גלויה לצוות בלבד; המשתמש רואה רק את הדחיפות שבחר.
        </p>
      </div>

      {/* Lane cards — pick an assignee */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        <LaneCard
          name="כולם" count={totals.count} overdue={totals.overdue} top={totals.top} unclassified={totals.unclassified}
          filtered={filtered} active={filters.assignee === null} onClick={() => setFilters(f => ({ ...f, assignee: null }))}
        />
        {lanes.map(l => (
          <LaneCard
            key={l.email || "unassigned"} name={l.display} count={l.tickets.length} overdue={l.overdue}
            top={l.byPriority.P1 + l.byPriority.P2} unclassified={l.unclassified} filtered={filtered}
            active={filters.assignee !== null && sameAssignee(filters.assignee, l.email)}
            onClick={() => setFilters(f => ({ ...f, assignee: f.assignee !== null && sameAssignee(f.assignee, l.email) ? null : l.email }))}
          />
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: T.card, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <FilterRow label="מטפל">
          <select
            aria-label="מטפל"
            value={filters.assignee ?? "__all__"}
            onChange={e => setFilters(f => ({ ...f, assignee: e.target.value === "__all__" ? null : e.target.value }))}
            style={{ width: "auto", padding: "5px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", background: T.card, color: T.text, fontWeight: 600 }}
          >
            <option value="__all__">כל הצוות</option>
            {lanes.map(l => <option key={l.email || "unassigned"} value={l.email}>{l.display} ({l.tickets.length})</option>)}
          </select>
        </FilterRow>
        <FilterRow label="דחיפות">
          {urgencies.map(u => (
            <button key={u} type="button" aria-pressed={filters.urgencies.includes(u)} onClick={() => toggle("urgencies", u)}
              style={chip(filters.urgencies.includes(u), URGENCY[u]?.bg, URGENCY[u]?.fg)}>{u}</button>
          ))}
        </FilterRow>
        <FilterRow label="דחיפות פנימית">
          {([...INTERNAL_PRIORITIES, "none"] as PriorityFilter[]).map(p => {
            const on = filters.priorities.includes(p)
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => toggle("priorities", p)}
                style={chip(on, p === "none" ? undefined : PRIORITY[p].bg, p === "none" ? undefined : PRIORITY[p].fg)}>
                {p === "none" ? UNCLASSIFIED_LABEL : priorityLabel(p)}
              </button>
            )
          })}
        </FilterRow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" aria-pressed={filters.overdueOnly} onClick={() => setFilters(f => ({ ...f, overdueOnly: !f.overdueOnly }))}
            style={chip(filters.overdueOnly, T.orangeBg, T.orangeFgDeep)}>⏰ רק חורגות מ-SLA</button>
          {(filtered || filters.assignee !== null) && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)}
              style={{ background: "none", border: "none", cursor: "pointer", color: T.inkMuted, fontSize: "0.78rem", fontWeight: 600, textDecoration: "underline" }}>
              נקה סינון
            </button>
          )}
          <span style={{ marginRight: "auto", fontSize: "0.78rem", color: T.inkFaint }}>{visible.length} פניות</span>
          <button type="button" onClick={onReload}
            style={{ fontSize: "0.78rem", color: T.text, background: T.codeBg, border: "none", cursor: "pointer", padding: "5px 12px", borderRadius: 8, fontWeight: 600 }}>
            רענן
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "9px 12px", fontSize: "0.82rem", color: T.redFg }}>{error}</div>
      )}

      {loading ? (
        <p style={{ textAlign: "center", padding: "40px 0", color: T.inkFaint, fontSize: "0.875rem" }}>טוען...</p>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 24px", background: T.card, borderRadius: 14, border: `1px solid ${T.line}` }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, color: T.ink }}>אין פניות פתוחות שמתאימות לסינון</p>
          <p style={{ margin: 0, fontSize: "0.82rem", color: T.inkFaint }}>נסו להסיר חלק מהמסננים</p>
        </div>
      ) : groups.map(g => (
        <section key={g.email || "unassigned"} aria-label={g.display} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: T.inverseBg, color: T.inverseText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.64rem", fontWeight: 700, flexShrink: 0 }}>
              {initials(g.display)}
            </span>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: T.text }}>{g.display}</span>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.muted }}>{g.tickets.length}</span>
            <span style={{ flex: 1, height: 2, background: T.line, borderRadius: 1 }} />
          </div>
          {g.tickets.map((t, i) => {
            // Unclassified tickets rank last; a label marks where they start.
            const firstUnclassified = !normalizePriority(t.internalPriority) && (i === 0 || !!normalizePriority(g.tickets[i - 1].internalPriority))
            return (
              <Fragment key={t.id}>
                {firstUnclassified && (
                  <div role="separator" style={{ fontSize: "0.72rem", fontWeight: 700, color: T.inkMuted, margin: "6px 4px 0" }}>
                    טרם סווגו ({g.tickets.length - i}) — בחרו רמה כדי לדרג
                  </div>
                )}
                <BoardRow
                  ticket={t} clock={clock} isMobile={isMobile} saving={saving === t.id}
                  staffMembers={staffMembers}
                  onPriority={p => save(t, { internalPriority: p })}
                  onAssign={email => save(t, { assignedTo: email })}
                />
              </Fragment>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function LaneCard({ name, count, overdue, top, unclassified, filtered, active, onClick }: {
  name: string; count: number; overdue: number; top: number; unclassified: number
  /** Counts are of the filtered tickets — none of them is not the same as free. */
  filtered: boolean
  active: boolean; onClick: () => void
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, cursor: "pointer", textAlign: "right",
        background: active ? T.codeBg : T.card, border: active ? `2px solid ${T.text}` : `1px solid ${T.border}`,
      }}>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ fontSize: "1.15rem", fontWeight: 800, color: T.text }}>{count}</span>
      </span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 18 }}>
        {overdue > 0 && <span style={{ ...pill, background: T.orangeBg, color: T.orangeFgDeep }}>⏰ {overdue} חורגות</span>}
        {top > 0 && <span style={{ ...pill, background: PRIORITY.P1.bg, color: PRIORITY.P1.fg }}>P1–P2: {top}</span>}
        {unclassified > 0 && <span style={{ ...pill, background: T.fill, color: T.inkFaint }}>{unclassified} לא סווגו</span>}
        {count === 0 && !filtered && <span style={{ ...pill, background: T.greenBg, color: T.greenInk }}>פנוי</span>}
      </span>
    </button>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: T.inkMuted, minWidth: 92 }}>{label}</span>
      {children}
    </div>
  )
}

function SlaCell({ ticket, clock }: { ticket: TicketWithUser; clock: BoardClock }) {
  const s = slaState(ticket, clock.sla, clock.prioritySla, clock.now)
  const style: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" }
  if (s.paused) return <span style={{ ...style, color: T.inkFaint }}>⏸ מושהה</span>
  if (s.remainingHours !== null) {
    return s.overdue
      ? <span style={{ ...style, color: T.orangeFgDeep }}>⏰ חריגה {formatClockSpan(s.remainingHours)}</span>
      : <span style={{ ...style, color: s.remainingHours < 2 ? T.amberFgDeep : T.inkMuted }}>נותרו {formatClockSpan(s.remainingHours)}</span>
  }
  const age = formatWorkdays(workdaysBetween(ticket.createdAt, clock.now))
  return <span style={{ ...style, color: s.overdue ? T.orangeFgDeep : T.inkFaint }}>{s.overdue ? "⏰ " : ""}{age}</span>
}

function BoardRow({ ticket: t, clock, isMobile, saving, staffMembers, onPriority, onAssign }: {
  ticket: TicketWithUser
  clock: BoardClock
  isMobile: boolean
  saving: boolean
  staffMembers: { email: string; display: string }[]
  onPriority: (p: InternalPriority | null) => void
  onAssign: (email: string) => void
}) {
  const overdue = slaState(t, clock.sla, clock.prioritySla, clock.now).overdue
  const assignee = (
    <select
      aria-label="מטפל"
      value={staffMembers.some(m => sameAssignee(m.email, t.assignedTo)) ? staffMembers.find(m => sameAssignee(m.email, t.assignedTo))!.email : t.assignedTo}
      disabled={saving}
      onChange={e => onAssign(e.target.value)}
      style={{ width: "auto", padding: "3px 6px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.72rem", background: T.card, color: T.text, fontWeight: 600, maxWidth: 130, opacity: saving ? 0.55 : 1 }}
    >
      {!staffMembers.some(m => sameAssignee(m.email, t.assignedTo)) && <option value={t.assignedTo}>{t.assignedTo || "לא משויך"}</option>}
      {staffMembers.map(m => <option key={m.email} value={m.email}>{m.display}</option>)}
    </select>
  )
  const title = (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <a href={`/tickets/${ticketLabel(t)}`}
          style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 7px", flexShrink: 0, textDecoration: "none" }}>
          {ticketLabel(t)}
        </a>
        <a href={`/tickets/${ticketLabel(t)}`}
          style={{ fontWeight: 600, color: T.text, fontSize: "0.86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>
          {t.subject}
        </a>
      </div>
      <div style={{ fontSize: "0.72rem", color: T.inkFaint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t.user?.name ?? t.user?.email ?? "—"} · {t.category} · {new Date(t.createdAt).toLocaleDateString("he-IL")}
      </div>
    </div>
  )
  const badges = (
    <>
      <span style={{ ...pill, background: URGENCY[t.urgency]?.bg ?? T.fill, color: URGENCY[t.urgency]?.fg ?? T.ink }} title="הדחיפות שבחר המדווח">{t.urgency}</span>
      <PrioritySelect value={t.internalPriority} onChange={onPriority} disabled={saving} compact />
      <span style={{ ...pill, background: STATUS[t.status]?.bg ?? T.fill, color: STATUS[t.status]?.fg ?? T.ink }}>{t.status}</span>
    </>
  )
  const frame: React.CSSProperties = {
    background: overdue ? T.orangeBg : T.card, borderRadius: 10,
    border: `1px solid ${overdue ? T.orangeBorder : T.line}`,
    borderRight: `4px solid ${normalizePriority(t.internalPriority) ? PRIORITY[normalizePriority(t.internalPriority)!].bg : T.line}`,
  }
  if (isMobile) {
    return (
      <div style={{ ...frame, display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px" }}>
        {title}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{badges}<SlaCell ticket={t} clock={clock} /></div>
        <div>{assignee}</div>
      </div>
    )
  }
  return (
    <div style={{ ...frame, display: "grid", gridTemplateColumns: "1fr auto auto auto 96px auto", alignItems: "center", gap: 12, padding: "9px 14px" }}>
      {title}
      {badges}
      <SlaCell ticket={t} clock={clock} />
      {assignee}
    </div>
  )
}
