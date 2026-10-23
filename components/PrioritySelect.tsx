"use client"
/**
 * components/PrioritySelect.tsx — the internal priority, as a pill or a picker (v3.107).
 *
 * Staff-only by construction: the routes strip the field for everyone else, so
 * a page that renders these for a reporter has nothing to show. Still, callers
 * render them behind isStaff — an empty "לא סווג" pill would itself say that
 * there is something to classify.
 */

import { PRIORITY, T } from "@/lib/theme"
import {
  INTERNAL_PRIORITIES, PRIORITY_INFO, UNCLASSIFIED_LABEL, normalizePriority, priorityLabel, type InternalPriority,
} from "@/lib/internalPriority"

const pill: React.CSSProperties = {
  display: "inline-block", padding: "2px 9px", borderRadius: 8, fontSize: "0.7rem", fontWeight: 700,
  whiteSpace: "nowrap", letterSpacing: "0.01em",
}

const option: React.CSSProperties = { background: T.card, color: T.text }

/** The level as a pill; nothing at all when the ticket is not classified, unless `showEmpty`. */
export function PriorityBadge({ value, showEmpty = false, short = false }: { value?: string | null; showEmpty?: boolean; short?: boolean }) {
  const p = normalizePriority(value)
  if (!p) {
    if (!showEmpty) return null
    return <span style={{ ...pill, background: T.fill, color: T.inkFaint, border: `1px dashed ${T.lineStrong}` }}>{UNCLASSIFIED_LABEL}</span>
  }
  return (
    <span title={`דחיפות פנימית — ${PRIORITY_INFO[p].hint}`} style={{ ...pill, background: PRIORITY[p].bg, color: PRIORITY[p].fg }}>
      {short ? p : priorityLabel(p)}
    </span>
  )
}

/** A native select in the level's colours; "" is "not classified". */
export default function PrioritySelect({
  value, onChange, disabled = false, compact = false,
}: {
  value?: string | null
  onChange: (next: InternalPriority | null) => void
  disabled?: boolean
  compact?: boolean
}) {
  const p = normalizePriority(value)
  return (
    <select
      aria-label="דחיפות פנימית"
      value={p ?? ""}
      disabled={disabled}
      title={p ? PRIORITY_INFO[p].hint : "טרם סווגה — בחרו רמה"}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(normalizePriority(e.target.value)) }}
      style={{
        padding: compact ? "3px 6px" : "5px 10px", borderRadius: 8, fontWeight: 700,
        fontSize: compact ? "0.72rem" : "0.8rem", cursor: disabled ? "default" : "pointer",
        border: p ? "1px solid transparent" : `1px dashed ${T.lineStrong}`,
        background: p ? PRIORITY[p].bg : T.card, color: p ? PRIORITY[p].fg : T.inkMuted,
        // globals.css gives every select width 100%; in a wrapping row that is a line of its own.
        opacity: disabled ? 0.55 : 1, width: "auto", maxWidth: "100%",
      }}
    >
      {/* Options take the select's colours in Chrome on Windows unless told
          otherwise — a P1 picker would list every level in white on red. */}
      <option value="" style={option}>— {UNCLASSIFIED_LABEL} —</option>
      {INTERNAL_PRIORITIES.map(level => (
        <option key={level} value={level} style={option}>{priorityLabel(level)}</option>
      ))}
    </select>
  )
}
