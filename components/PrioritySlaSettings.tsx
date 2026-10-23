"use client"
/**
 * components/PrioritySlaSettings.tsx — the SLA per internal priority, for admins (v3.107).
 *
 * Lives in the admin console's שדות מערכת tab, under the SLA per ticket type.
 * Each level is a number and a unit — hours or workdays — because an outage
 * is measured in hours and a P5 in days; it is stored as hours either way
 * (PUT /api/admin/settings/priority-sla). Saving forgets lib/useSla.ts's cache
 * so the next page load reads the new targets.
 */

import { useEffect, useState } from "react"
import { T, PRIORITY } from "@/lib/theme"
import {
  DEFAULT_PRIORITY_SLA, INTERNAL_PRIORITIES, PRIORITY_INFO, formatSlaHours, priorityLabel,
  type InternalPriority, type PrioritySla,
} from "@/lib/internalPriority"
import { forgetPrioritySla } from "@/lib/useSla"

type Unit = "hours" | "days"
type Row = { amount: string; unit: Unit }

/** Whole workdays show as days; anything else as hours. */
const rowFor = (hours: number): Row =>
  hours % 24 === 0 ? { amount: String(hours / 24), unit: "days" } : { amount: String(hours), unit: "hours" }

const rowsFor = (sla: PrioritySla) =>
  Object.fromEntries(INTERNAL_PRIORITIES.map(p => [p, rowFor(sla[p])])) as Record<InternalPriority, Row>

const hoursOf = (row: Row) => Number(row.amount) * (row.unit === "days" ? 24 : 1)

export default function PrioritySlaSettings() {
  const [rows, setRows] = useState(rowsFor(DEFAULT_PRIORITY_SLA))
  const [saved, setSaved] = useState<PrioritySla | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/settings/priority-sla")
      .then(r => (r.ok ? r.json() : null))
      .then((s: PrioritySla | null) => { if (s) { setSaved(s); setRows(rowsFor(s)) } })
      .catch(() => { /* the defaults stay on screen */ })
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const body = Object.fromEntries(INTERNAL_PRIORITIES.map(p => [p, hoursOf(rows[p])]))
      const res = await fetch("/api/admin/settings/priority-sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessage({ ok: false, text: typeof data?.error === "string" ? data.error : "השמירה נכשלה" })
        return
      }
      setSaved(data)
      setRows(rowsFor(data))
      forgetPrioritySla()
      setMessage({ ok: true, text: "נשמר" })
    } catch {
      setMessage({ ok: false, text: "שגיאת רשת — נסו שוב" })
    } finally {
      setSaving(false)
    }
  }

  const dirty = !saved || INTERNAL_PRIORITIES.some(p => hoursOf(rows[p]) !== saved[p])
  const disabled = saving || !dirty
  const field: React.CSSProperties = { padding: "7px 9px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.85rem", background: T.card, color: T.text }

  return (
    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>🚦 זמני טיפול לפי דחיפות פנימית</h3>
      <p style={{ margin: "0 0 14px", fontSize: "0.8rem", color: T.inkFaint, lineHeight: 1.6 }}>
        פנייה שהצוות סיווג נמדדת לפי הרמה שלה במקום לפי הסוג. השעון רץ בימים א׳–ה׳ מסביב לשעון —
        שישי ושבת לא נספרים, ופנייה בהמתנה לא נמדדת. יום עבודה = 24 שעות בשעון הזה.
        פנייה שלא סווגה נשארת על זמן הטיפול של הסוג שלה. הדחיפות הפנימית גלויה לצוות בלבד.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {INTERNAL_PRIORITIES.map(p => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ minWidth: 112, padding: "3px 10px", borderRadius: 8, fontSize: "0.78rem", fontWeight: 700, background: PRIORITY[p].bg, color: PRIORITY[p].fg, textAlign: "center" }}>
              {priorityLabel(p)}
            </span>
            <input
              type="number" min={1} step={1} aria-label={`זמן טיפול ${p}`}
              value={rows[p].amount}
              onChange={e => setRows(r => ({ ...r, [p]: { ...r[p], amount: e.target.value } }))}
              style={{ ...field, width: 72 }}
            />
            <select
              aria-label={`יחידה ${p}`}
              value={rows[p].unit}
              onChange={e => setRows(r => ({ ...r, [p]: { ...r[p], unit: e.target.value as Unit } }))}
              style={{ ...field, width: "auto" }}
            >
              <option value="hours">שעות</option>
              <option value="days">ימי עבודה</option>
            </select>
            <span style={{ fontSize: "0.75rem", color: T.inkFaint, flex: 1, minWidth: 160 }}>{PRIORITY_INFO[p].hint}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={disabled}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: "0.85rem",
            background: disabled ? T.line : T.inverseBg, color: disabled ? T.inkFaint : T.inverseText,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "שומר..." : "שמור"}
        </button>
        {saved && !dirty && (
          <span style={{ fontSize: "0.75rem", color: T.inkFaint }}>
            {INTERNAL_PRIORITIES.map(p => `${p}: ${formatSlaHours(saved[p])}`).join(" · ")}
          </span>
        )}
        {message && (
          <span role="status" style={{ fontSize: "0.8rem", fontWeight: 600, color: message.ok ? T.greenInk : T.redFg }}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
