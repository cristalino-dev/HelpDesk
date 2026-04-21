/**
 * components/TicketTable.tsx — Ticket Card List (User Dashboard View)
 *
 * PURPOSE:
 * ─────────
 * Renders the list of tickets on the user's dashboard. Each ticket is shown
 * as a card with a colour-coded right border indicating urgency.
 *
 * LAYOUT:
 * ────────
 * Active tickets (פתוח / בטיפול) are shown first, in full colour.
 * Closed tickets (סגור) are shown below in a separate grayed-out section
 * labelled "פניות סגורות". They remain clickable for reviewing past details.
 *
 * CLOSE BUTTON:
 * ─────────────
 * Desktop: fades in on hover (hidden otherwise to keep the list clean).
 * Mobile:  always visible as a small badge — hover doesn't exist on touch.
 *
 * PROPS:
 * ───────
 *   tickets  {Ticket[]}  Array of ticket objects from GET /api/tickets.
 *   onClose  {fn}        Optional close handler; when omitted close buttons
 *                        are never rendered (e.g. in read-only views).
 *
 * COLOUR CODING:
 * ───────────────
 *   נמוך   (low)    → green  (#22c55e border, #dcfce7 badge bg)
 *   בינוני (medium) → yellow (#f59e0b border, #fef3c7 badge bg)
 *   גבוה   (high)   → orange (#f97316 border, #ffedd5 badge bg)
 *   דחוף   (urgent) → red    (#ef4444 border, #fee2e2 badge bg)
 */

"use client"
import { useState } from "react"
import type { Ticket } from "@/types/ticket"
import { useIsMobile } from "@/lib/useIsMobile"

type Props = {
  tickets: Ticket[]
  onClose?: (id: string) => Promise<void> | void
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  "פתוח":   { backgroundColor: "#dbeafe", color: "#1e40af" },
  "בטיפול": { backgroundColor: "#fef3c7", color: "#92400e" },
  "סגור":   { backgroundColor: "#dcfce7", color: "#166534" },
}

const URGENCY_STYLES: Record<string, React.CSSProperties> = {
  "נמוך":   { backgroundColor: "#dcfce7", color: "#166534" },
  "בינוני": { backgroundColor: "#fef3c7", color: "#92400e" },
  "גבוה":   { backgroundColor: "#ffedd5", color: "#9a3412" },
  "דחוף":   { backgroundColor: "#fee2e2", color: "#991b1b" },
}

const URGENCY_BORDER: Record<string, string> = {
  "נמוך":   "#22c55e",
  "בינוני": "#f59e0b",
  "גבוה":   "#f97316",
  "דחוף":   "#ef4444",
}

const pill: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 600,
  display: "inline-block",
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
}

// ── Chevron SVG ───────────────────────────────────────────────────────────────

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
      <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Single card ───────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onClose,
  closingId,
  setClosingId,
  hoverId,
  setHoverId,
  isMobile,
}: {
  ticket: Ticket
  onClose?: (id: string) => Promise<void> | void
  closingId: string | null
  setClosingId: (id: string | null) => void
  hoverId: string | null
  setHoverId: (id: string | null) => void
  isMobile: boolean
}) {
  const isClosed  = ticket.status === "סגור"
  const isHovered = hoverId === ticket.id
  const isClosing = closingId === ticket.id
  const showClose = !!onClose && !isClosed

  const borderColor = isClosed ? "#d1d5db" : (URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb")
  const meta = `${ticket.computerName} · ${ticket.category} · ${ticket.platform} · ${new Date(ticket.createdAt).toLocaleDateString("he-IL")}`

  const urgencyStyle = isClosed
    ? { backgroundColor: "#f3f4f6", color: "#9ca3af" }
    : (URGENCY_STYLES[ticket.urgency] ?? {})

  const closeBtn = showClose ? (
    <button
      onClick={async (e) => {
        e.preventDefault()
        setClosingId(ticket.id)
        try { await onClose!(ticket.id) } finally { setClosingId(null) }
      }}
      disabled={isClosing}
      title="סגור פנייה"
      style={{
        padding: "3px 10px",
        borderRadius: 8,
        border: "1px solid #bbf7d0",
        background: isClosing ? "#e5e7eb" : "#dcfce7",
        color:  isClosing ? "#9ca3af" : "#15803d",
        fontWeight: 700,
        fontSize: "0.72rem",
        cursor: isClosing ? "default" : "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        // Desktop: fade in on hover. Mobile: always visible.
        opacity: isMobile || isHovered || isClosing ? 1 : 0,
        pointerEvents: isMobile || isHovered || isClosing ? "auto" : "none",
        transition: "opacity 0.18s",
      }}
    >
      {isClosing ? "..." : "✓ סגור"}
    </button>
  ) : null

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        backgroundColor: isClosed ? "#f9fafb" : "#fff",
        borderRadius: 12,
        border: "1px solid #f3f4f6",
        borderRight: `4px solid ${borderColor}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        padding: "12px 14px",
        opacity: isClosed ? 0.52 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        {/* Row 1: ticket number + subject + chevron */}
        <a href={`/tickets/HDTC-${ticket.ticketNumber}`} style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", minWidth: 0 }}>
          <span style={{
            fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.03em",
            flexShrink: 0, borderRadius: 6, padding: "1px 7px",
            color:      isClosed ? "#9ca3af" : "#2563eb",
            background: isClosed ? "#f3f4f6"  : "#eff6ff",
          }}>
            HDTC-{ticket.ticketNumber}
          </span>
          <span style={{
            fontWeight: 600, fontSize: "0.88rem",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: isClosed ? "#6b7280" : "#111827",
            flex: 1, minWidth: 0,
          }}>
            {ticket.subject}
          </span>
          <Chevron />
        </a>

        {/* Row 2: meta */}
        <div style={{ fontSize: "0.72rem", color: "#9ca3af", lineHeight: 1.4 }}>
          {meta}
        </div>

        {/* Row 3: badges + close button */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ ...pill, ...urgencyStyle }}>{ticket.urgency}</span>
          <span style={{ ...pill, ...(STATUS_STYLES[ticket.status] ?? {}) }}>{ticket.status}</span>
          {closeBtn}
        </div>
      </div>
    )
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <div
      onMouseEnter={() => setHoverId(ticket.id)}
      onMouseLeave={() => setHoverId(null)}
      style={{
        backgroundColor: isClosed ? "#f9fafb" : "#fff",
        borderRadius: "12px",
        border: "1px solid #f3f4f6",
        borderRight: `4px solid ${borderColor}`,
        boxShadow: isHovered && !isClosed
          ? "0 4px 16px rgba(0,0,0,0.10)"
          : "0 1px 3px rgba(0,0,0,0.05)",
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        alignItems: "center",
        gap: "16px",
        padding: "14px 16px 14px 20px",
        transition: "box-shadow 0.15s, transform 0.1s, opacity 0.15s",
        transform: isHovered && !isClosed ? "translateY(-1px)" : "none",
        opacity: isClosed ? 0.52 : 1,
      }}
    >
      {/* Subject + meta */}
      <a href={`/tickets/HDTC-${ticket.ticketNumber}`} style={{ minWidth: 0, textDecoration: "none", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.03em",
            flexShrink: 0, borderRadius: 6, padding: "1px 7px",
            color:      isClosed ? "#9ca3af" : "#2563eb",
            background: isClosed ? "#f3f4f6"  : "#eff6ff",
          }}>
            HDTC-{ticket.ticketNumber}
          </span>
          <span style={{
            fontWeight: 600, fontSize: "0.9rem",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: isClosed ? "#6b7280" : "#111827",
          }}>
            {ticket.subject}
          </span>
        </div>
        <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{meta}</div>
      </a>

      {/* Urgency badge */}
      <span style={{ ...pill, ...urgencyStyle }}>{ticket.urgency}</span>

      {/* Status badge */}
      <span style={{ ...pill, ...(STATUS_STYLES[ticket.status] ?? {}) }}>{ticket.status}</span>

      {/* Action area: hover-reveal close + arrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {closeBtn}
        <a href={`/tickets/HDTC-${ticket.ticketNumber}`} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
          <Chevron />
        </a>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function TicketTable({ tickets, onClose }: Props) {
  const [hoverId,   setHoverId]   = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const activeTickets = tickets.filter(t => t.status !== "סגור")
  const closedTickets = tickets.filter(t => t.status === "סגור")

  const cardProps = { onClose, closingId, setClosingId, hoverId, setHoverId, isMobile }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!tickets.length) {
    return (
      <div style={{
        textAlign: "center", padding: "60px 24px",
        backgroundColor: "#fff", borderRadius: "16px",
        border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      }}>
        <div style={{
          width: "52px", height: "52px", borderRadius: "14px", backgroundColor: "#eff6ff",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#374151", fontSize: "0.95rem" }}>אין פניות עדיין</p>
        <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.82rem" }}>לחצו על &quot;פנייה חדשה&quot; כדי לפתוח את הפנייה הראשונה שלכם</p>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Active tickets ──────────────────────────────────────────────────── */}
      {activeTickets.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {activeTickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} {...cardProps} />
          ))}
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: "28px 24px",
          backgroundColor: "#fff", borderRadius: "12px",
          border: "1px solid #f3f4f6",
        }}>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.85rem" }}>אין פניות פתוחות כרגע</p>
        </div>
      )}

      {/* ── Closed tickets section ──────────────────────────────────────────── */}
      {closedTickets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 2px" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
              פניות סגורות ({closedTickets.length})
            </span>
            <div style={{ flex: 1, height: "1px", backgroundColor: "#e5e7eb" }} />
          </div>
          {closedTickets.map(ticket => (
            <TicketCard key={ticket.id} ticket={ticket} {...cardProps} />
          ))}
        </div>
      )}
    </div>
  )
}
