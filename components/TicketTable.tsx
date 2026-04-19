/**
 * components/TicketTable.tsx — Ticket Card List (User Dashboard View)
 *
 * PURPOSE:
 * ─────────
 * Renders the list of tickets on the user's dashboard. Each ticket is shown
 * as a horizontal card with a colour-coded right border indicating urgency.
 *
 * This component is display-only — it has no interaction beyond hover effects.
 * Status changes are performed by admins in admin/page.tsx, not here.
 *
 * PROPS:
 * ───────
 *   tickets  {Ticket[]}  Array of ticket objects from GET /api/tickets.
 *                        Rendered in the order provided (newest first, as
 *                        returned by the API).
 *
 * EMPTY STATE:
 * ─────────────
 * When `tickets` is empty, renders a centred placeholder with an icon and
 * a call-to-action message instead of an empty list.
 *
 * COLOUR CODING:
 * ───────────────
 * Both the right border and the urgency badge use a colour system that makes
 * ticket priority immediately scannable without reading the Hebrew text:
 *
 *   נמוך   (low)    → green  (#22c55e border, #dcfce7 badge bg)
 *   בינוני (medium) → yellow (#f59e0b border, #fef3c7 badge bg)
 *   גבוה   (high)   → orange (#f97316 border, #ffedd5 badge bg)
 *   דחוף   (urgent) → red    (#ef4444 border, #fee2e2 badge bg)
 *
 * HOVER EFFECT:
 * ──────────────
 * On hover, the card lifts by 1px (translateY(-1px)) and its shadow deepens.
 * Implemented via React state (`hoverId`) rather than CSS :hover so it works
 * with inline styles (which don't support pseudo-selectors).
 */

"use client"
import { useState } from "react"
import type { Ticket } from "@/types/ticket"

type Props = {
  tickets: Ticket[]
  onClose?: (id: string) => Promise<void> | void
}

/**
 * Inline style objects for status badges.
 * Each status has its own background/text colour combination.
 *
 *   פתוח   (open)        → blue
 *   בטיפול (in progress) → yellow/amber
 *   סגור   (closed)      → green
 */
const STATUS_STYLES: Record<string, React.CSSProperties> = {
  "פתוח":   { backgroundColor: "#dbeafe", color: "#1e40af" },
  "בטיפול": { backgroundColor: "#fef3c7", color: "#92400e" },
  "סגור":   { backgroundColor: "#dcfce7", color: "#166534" },
}

/**
 * Inline style objects for urgency badges.
 * These intentionally use lighter shades than the border colours
 * so badges look good on the white card background.
 */
const URGENCY_STYLES: Record<string, React.CSSProperties> = {
  "נמוך":   { backgroundColor: "#dcfce7", color: "#166534" },
  "בינוני": { backgroundColor: "#fef3c7", color: "#92400e" },
  "גבוה":   { backgroundColor: "#ffedd5", color: "#9a3412" },
  "דחוף":   { backgroundColor: "#fee2e2", color: "#991b1b" },
}

/**
 * Border colours for the left (logical right in RTL) accent stripe on each card.
 * These are more saturated than the badge backgrounds to stand out as borders.
 */
const URGENCY_BORDER: Record<string, string> = {
  "נמוך":   "#22c55e",
  "בינוני": "#f59e0b",
  "גבוה":   "#f97316",
  "דחוף":   "#ef4444",
}

/** Shared pill badge style used for both status and urgency labels. */
const badge: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 600,
  display: "inline-block",
  letterSpacing: "0.01em",
}

export default function TicketTable({ tickets, onClose }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!tickets.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", backgroundColor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#374151", fontSize: "0.95rem" }}>אין פניות עדיין</p>
        <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.82rem" }}>לחצו על &quot;פנייה חדשה&quot; כדי לפתוח את הפנייה הראשונה שלכם</p>
      </div>
    )
  }

  // ── Ticket list ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {tickets.map((ticket) => (
        <div
          key={ticket.id}
          onMouseEnter={() => setHoverId(ticket.id)}
          onMouseLeave={() => setHoverId(null)}
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            border: "1px solid #f3f4f6",
            borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb"}`,
            boxShadow: hoverId === ticket.id
              ? "0 4px 16px rgba(0,0,0,0.1)"
              : "0 1px 3px rgba(0,0,0,0.05)",
            display: "grid",
            gridTemplateColumns: onClose ? "1fr auto auto auto auto" : "1fr auto auto auto",
            alignItems: "center",
            gap: "16px",
            padding: "14px 16px 14px 20px",
            transition: "box-shadow 0.15s, transform 0.1s",
            transform: hoverId === ticket.id ? "translateY(-1px)" : "none",
          }}
        >
          {/* ── Subject + meta row (clickable link) ── */}
          <a href={`/tickets/HDTC-${ticket.ticketNumber}`} style={{ minWidth: 0, textDecoration: "none", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 7px", letterSpacing: "0.03em", flexShrink: 0 }}>
                HDTC-{ticket.ticketNumber}
              </span>
              <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ticket.subject}
              </span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              {ticket.computerName} · {ticket.category} · {ticket.platform} · {new Date(ticket.createdAt).toLocaleDateString("he-IL")}
            </div>
          </a>

          {/* ── Urgency badge ── */}
          <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}) }}>
            {ticket.urgency}
          </span>

          {/* ── Status badge ── */}
          <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}) }}>
            {ticket.status}
          </span>

          {/* ── Quick close button (only when onClose is provided) ── */}
          {onClose && (
            ticket.status !== "סגור" ? (
              <button
                onClick={async () => {
                  setClosingId(ticket.id)
                  try { await onClose(ticket.id) } finally { setClosingId(null) }
                }}
                disabled={closingId === ticket.id}
                title="סגור פנייה"
                style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: closingId === ticket.id ? "#e5e7eb" : "#dcfce7", color: closingId === ticket.id ? "#9ca3af" : "#15803d", fontWeight: 700, fontSize: "0.72rem", cursor: closingId === ticket.id ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {closingId === ticket.id ? "..." : "✓ סגור"}
              </button>
            ) : <div style={{ width: 60 }} />
          )}

          {/* ── RTL arrow indicator ── */}
          <a href={`/tickets/HDTC-${ticket.ticketNumber}`} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
              <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      ))}
    </div>
  )
}
