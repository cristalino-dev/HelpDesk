"use client"
/**
 * components/SlaSettings.tsx — the SLA per ticket type, for admins (v3.87).
 *
 * Lives in the admin console's שדות מערכת tab. Shows GET /api/settings/sla and
 * saves through PUT /api/admin/settings/sla. The queues read the values through
 * lib/useSla.ts; saving forgets its cache so the next page load reads the new
 * numbers.
 */

import { useEffect, useState } from "react"
import { T } from "@/lib/theme"
import {
  DEFAULT_SLA, SLA_MAX_WORKDAYS, SLA_MIN_WORKDAYS, TICKET_TYPES, TYPE_LABEL, TYPE_PREFIX, type Sla,
} from "@/lib/ticketType"
import { forgetSla } from "@/lib/useSla"

const asText = (sla: Sla) => ({ ticket: String(sla.ticket), request: String(sla.request) })

export default function SlaSettings() {
  const [values, setValues] = useState<Record<string, string>>(asText(DEFAULT_SLA))
  const [saved, setSaved] = useState<Sla | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch("/api/settings/sla")
      .then(r => (r.ok ? r.json() : null))
      .then((s: Sla | null) => { if (s) { setSaved(s); setValues(asText(s)) } })
      .catch(() => { /* the defaults stay on screen */ })
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/admin/settings/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: Number(values.ticket), request: Number(values.request) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setMessage({ ok: false, text: typeof body?.error === "string" ? body.error : "השמירה נכשלה" })
        return
      }
      setSaved(body)
      setValues(asText(body))
      forgetSla()
      setMessage({ ok: true, text: "נשמר" })
    } catch {
      setMessage({ ok: false, text: "שגיאת רשת — נסו שוב" })
    } finally {
      setSaving(false)
    }
  }

  const dirty = !saved || TICKET_TYPES.some(t => values[t] !== String(saved[t]))
  const disabled = saving || !dirty

  return (
    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>⏱️ זמני טיפול (SLA)</h3>
      <p style={{ margin: "0 0 14px", fontSize: "0.8rem", color: T.inkFaint, lineHeight: 1.6 }}>
        אחרי כמה ימי עבודה (א׳–ה׳) פנייה פתוחה מסומנת כחורגת — בתורים ובסיכום היומי.
        מספר שלם, {SLA_MIN_WORKDAYS}–{SLA_MAX_WORKDAYS}.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        {TICKET_TYPES.map(t => (
          <label key={t} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", fontWeight: 600, color: T.ink }}>
            {TYPE_LABEL[t]} ({TYPE_PREFIX[t]})
            <input
              type="number" min={SLA_MIN_WORKDAYS} max={SLA_MAX_WORKDAYS} step={1}
              value={values[t]}
              onChange={e => setValues(v => ({ ...v, [t]: e.target.value }))}
              style={{ width: 90, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.9rem" }}
            />
          </label>
        ))}
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
        {message && (
          <span role="status" style={{ fontSize: "0.8rem", fontWeight: 600, color: message.ok ? T.greenInk : T.redFg }}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
