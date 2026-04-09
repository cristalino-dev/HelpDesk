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

export default function TicketTable({ tickets }: { tickets: Ticket[] }) {
  /**
   * Tracks which ticket card is currently hovered.
   * null = no card hovered. Used to drive the lift/shadow hover effect.
   */
  const [hoverId, setHoverId] = useState<string | null>(null)

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
            // RTL layout: borderRight in CSS is visually the RIGHT side in LTR,
            // but in RTL it renders on the right (which is the reading start),
            // creating the urgency colour stripe on the most-visible edge.
            borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb"}`,
            // Hover lift effect: driven by hoverId state
            boxShadow: hoverId === ticket.id
              ? "0 4px 16px rgba(0,0,0,0.1)"
              : "0 1px 3px rgba(0,0,0,0.05)",
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto", // Subject | Urgency | Status | Arrow
            alignItems: "center",
            gap: "16px",
            padding: "14px 16px 14px 20px",
            transition: "box-shadow 0.15s, transform 0.1s",
            transform: hoverId === ticket.id ? "translateY(-1px)" : "none",
            cursor: "default",
          }}
        >
          {/* ── Subject + meta row ── */}
          <div style={{ minWidth: 0 }}>
            {/* Subject — truncated with ellipsis if too long */}
            <div style={{ fontWeight: 600, color: "#111827", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>
              {ticket.subject}
            </div>
            {/* Secondary info row: computer name · category · date */}
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              {ticket.computerName} · {ticket.category} · {new Date(ticket.createdAt).toLocaleDateString("he-IL")}
            </div>
          </div>

          {/* ── Urgency badge ── */}
          <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}) }}>
            {ticket.urgency}
          </span>

          {/* ── Status badge ── */}
          <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}) }}>
            {ticket.status}
          </span>

          {/* ── RTL arrow indicator (decorative, shows list item affordance) ── */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
            {/* Left-pointing chevron — in RTL layout, this points toward the start */}
            <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      ))}
    </div>
  )
}
