/**
 * components/MergeTicketsModal.tsx — the merge dialog (v3.92)
 *
 * Opened from a ticket's page (with that ticket, plus a field to name the
 * other one) or from the queue's selection bar (with the selected tickets).
 * Staff pick the ticket that STAYS — by default the oldest, where the problem
 * was first reported — and see, before anything is written:
 *
 *   • each ticket's subject, owner, status and how much it carries;
 *   • who will become a participant of the one that stays;
 *   • why the merge cannot go ahead, when it cannot (the server's own rules,
 *     GET /api/tickets/merge — a ticket already merged, a source with an
 *     equipment list);
 *   • that a merge cannot be undone.
 *
 * The rules themselves are lib/ticketMerge.ts; this is only their face.
 */

"use client"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { T } from "@/lib/theme"
import type { MergePreviewTicket } from "@/types/ticket"

export interface MergeResult {
  target: { id: string; label: string }
  merged: { id: string; label: string }[]
}

interface Props {
  isOpen: boolean
  /** The tickets to start with — ids or labels. */
  initialRefs: string[]
  /** Offer a field to add a ticket by its number (the ticket page). */
  allowAdd?: boolean
  onClose: () => void
  onMerged: (result: MergeResult) => void
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("he-IL")
const nameOf = (p: { name: string | null; email: string }) => p.name || p.email

/** The ticket that stays by default: the oldest one that can. */
function defaultTarget(list: MergePreviewTicket[]): string | null {
  const byAge = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return (byAge.find(t => t.problems.length === 0) ?? byAge[0])?.id ?? null
}

export default function MergeTicketsModal({ isOpen, initialRefs, allowAdd = false, onClose, onMerged }: Props) {
  const [refs, setRefs]           = useState<string[]>([])
  const [tickets, setTickets]     = useState<MergePreviewTicket[]>([])
  const [notFound, setNotFound]   = useState<string[]>([])
  const [targetId, setTargetId]   = useState<string | null>(null)
  const [adding, setAdding]       = useState("")
  const [loading, setLoading]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState("")

  const load = useCallback(async (list: string[], keepTarget: string | null) => {
    if (list.length === 0) { setTickets([]); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/tickets/merge?refs=${encodeURIComponent(list.join(","))}`)
      const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null
      if (!res.ok || !body) { setError(body?.error ?? "טעינת הפניות נכשלה"); return }
      const found: MergePreviewTicket[] = body.tickets ?? []
      setTickets(found)
      setNotFound(body.notFound ?? [])
      setTargetId(keepTarget && found.some(t => t.id === keepTarget) ? keepTarget : defaultTarget(found))
    } catch {
      setError("טעינת הפניות נכשלה")
    } finally {
      setLoading(false)
    }
  }, [])

  // A fresh dialog every time it opens.
  useEffect(() => {
    if (!isOpen) return
    setRefs(initialRefs)
    setTickets([])
    setNotFound([])
    setTargetId(null)
    setAdding("")
    setSubmitting(false)
    setError("")
    load(initialRefs, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const target  = tickets.find(t => t.id === targetId) ?? null
  const sources = tickets.filter(t => t.id !== targetId)

  /** People who will follow the ticket that stays, as the server will add them. */
  const joining = useMemo(() => {
    if (!target) return []
    const known = new Set([target.owner.email, ...target.participants.map(p => p.email)])
    const out: { name: string | null; email: string }[] = []
    for (const s of sources) {
      for (const p of [s.owner, ...s.participants]) {
        if (known.has(p.email)) continue
        known.add(p.email)
        out.push(p)
      }
    }
    return out
  }, [target, sources])

  if (!isOpen) return null

  const addRef = () => {
    const r = adding.trim()
    if (!r) return
    const next = [...refs, r]
    setRefs(next)
    setAdding("")
    load(next, targetId)
  }

  const removeTicket = (t: MergePreviewTicket) => {
    const next = tickets.filter(x => x.id !== t.id).map(x => x.id)
    setRefs(next)
    load(next, targetId === t.id ? null : targetId)
  }

  const problems = target ? target.problems : []
  const canMerge = !!target && sources.length > 0 && problems.length === 0 && !loading && !submitting

  const merge = async () => {
    if (!target || !canMerge) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/tickets/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id, sourceIds: sources.map(s => s.id) }),
      })
      const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? "המיזוג נכשל. נסו שנית.")
        setSubmitting(false)
        return
      }
      onMerged({ target: body.target, merged: body.merged })
    } catch {
      setError("המיזוג נכשל. נסו שנית.")
      setSubmitting(false)
    }
  }

  const button = (primary: boolean, disabled: boolean): React.CSSProperties => ({
    padding: "9px 18px", borderRadius: 9, fontWeight: 700, fontSize: "0.85rem",
    cursor: disabled ? "not-allowed" : "pointer",
    border: primary ? "none" : `1px solid ${T.lineStrong}`,
    background: primary ? (disabled ? T.line : T.inverseBg) : T.card,
    color: primary ? (disabled ? T.inkFaint : T.inverseText) : T.ink,
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="מיזוג פניות"
      dir="rtl"
      onClick={() => { if (!submitting) onClose() }}
      style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 120 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 22, maxWidth: 580, width: "100%", maxHeight: "calc(100vh - 32px)", overflowY: "auto", boxShadow: `0 20px 50px ${T.shadow4}`, boxSizing: "border-box" }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: "1.02rem", fontWeight: 800, color: T.text }}>🔗 מיזוג פניות</h2>
        <p style={{ margin: "0 0 14px", fontSize: "0.84rem", color: T.text2, lineHeight: 1.65 }}>
          בחרו את הפנייה <strong>שנשארת</strong>. האחרות ייסגרו, וההודעות, ההערות והקבצים שלהן יעברו אליה.
        </p>

        {allowAdd && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <input
              aria-label="מספר פנייה למיזוג"
              placeholder="מספר פנייה למיזוג, למשל HDTC-512"
              value={adding}
              onChange={e => setAdding(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addRef() }}
              dir="ltr"
              style={{ flex: "1 1 200px", minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.86rem", background: T.card, color: T.text, textAlign: "right" }}
            />
            <button onClick={addRef} disabled={!adding.trim() || loading} style={button(false, !adding.trim() || loading)}>
              הוסף
            </button>
          </div>
        )}

        {notFound.length > 0 && (
          <div style={{ fontSize: "0.8rem", color: T.redFg, marginBottom: 10 }}>
            לא נמצאה פנייה: {notFound.join(", ")}
          </div>
        )}

        {loading && tickets.length === 0 && (
          <div style={{ fontSize: "0.85rem", color: T.inkFaint, padding: "14px 0" }}>טוען...</div>
        )}

        {/* The tickets — one radio each: which one stays */}
        <div role="radiogroup" aria-label="הפנייה שנשארת" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: loading ? 0.6 : 1 }}>
          {tickets.map(t => {
            const stays = t.id === targetId
            return (
              <label
                key={t.id}
                style={{
                  display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  border: `1.5px solid ${stays ? T.green : T.line}`,
                  background: stays ? T.greenBg : T.fill2,
                }}
              >
                <input
                  type="radio"
                  name="merge-target"
                  checked={stays}
                  onChange={() => setTargetId(t.id)}
                  style={{ marginTop: 3, accentColor: T.inverseBg, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 7px" }}>{t.label}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: T.text, overflowWrap: "anywhere" }}>{t.subject}</span>
                  </div>
                  <div style={{ fontSize: "0.74rem", color: T.inkMuted, marginTop: 3, lineHeight: 1.5 }}>
                    {nameOf(t.owner)} · {t.status} · נפתחה {fmtDate(t.createdAt)}
                    {" · "}💬 {t.counts.messages} · 📝 {t.counts.notes} · 📎 {t.counts.attachments}
                    {t.counts.equipment > 0 && <> · 📦 רשימת ציוד</>}
                  </div>
                  {t.mergedInto && (
                    <div style={{ fontSize: "0.74rem", color: T.orangeFgDeep, marginTop: 3 }}>כבר מוזגה ל-{t.mergedInto}</div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <span style={{
                    fontSize: "0.68rem", fontWeight: 700, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap",
                    background: stays ? T.green : T.fill, color: stays ? T.onGreen : T.inkMuted,
                  }}>
                    {stays ? "נשארת" : "תיסגר ותמוזג"}
                  </span>
                  {tickets.length > 2 && (
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); removeTicket(t) }}
                      aria-label={`הסר את ${t.label} מהמיזוג`}
                      style={{ background: "none", border: "none", color: T.inkFaint, cursor: "pointer", fontSize: "0.72rem", padding: 0 }}
                    >
                      ✕ הסר
                    </button>
                  )}
                </div>
              </label>
            )
          })}
        </div>

        {tickets.length === 1 && !loading && (
          <p style={{ margin: "12px 0 0", fontSize: "0.82rem", color: T.inkMuted }}>
            {allowAdd ? "הוסיפו את מספר הפנייה שתמוזג." : "יש לבחור לפחות שתי פניות."}
          </p>
        )}

        {target && sources.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {problems.length > 0 ? (
              <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "9px 12px", fontSize: "0.82rem", color: T.redFg, lineHeight: 1.6 }}>
                {problems.map(p => <div key={p}>• {p}</div>)}
              </div>
            ) : (
              <div style={{ fontSize: "0.82rem", color: T.ink, lineHeight: 1.65 }}>
                {sources.map(s => s.label).join(", ")} {sources.length === 1 ? "תיסגר ותמוזג" : "ייסגרו וימוזגו"} לתוך <strong>{target.label}</strong>.
                {joining.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    👥 יתווספו כמשתתפים ב-{target.label}: <strong>{joining.map(nameOf).join(", ")}</strong> — יראו את הפנייה ויקבלו עדכונים עליה.
                  </div>
                )}
              </div>
            )}
            <div style={{ fontSize: "0.8rem", color: T.redFgDeep, fontWeight: 700 }}>⚠️ לא ניתן לבטל מיזוג.</div>
          </div>
        )}

        {error && (
          <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "9px 12px", fontSize: "0.82rem", color: T.redFg, marginTop: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", marginTop: 18, flexWrap: "wrap" }}>
          <button onClick={merge} disabled={!canMerge} style={button(true, !canMerge)}>
            {submitting ? "ממזג..." : target && sources.length > 0 ? `מזג לתוך ${target.label}` : "מזג"}
          </button>
          <button onClick={onClose} disabled={submitting} style={button(false, submitting)}>ביטול</button>
        </div>
      </div>
    </div>
  )
}
