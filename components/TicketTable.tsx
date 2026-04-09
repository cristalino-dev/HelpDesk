"use client"
import { useState } from "react"

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

const badge: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "0.72rem",
  fontWeight: 600,
  display: "inline-block",
  letterSpacing: "0.01em",
}

export default function TicketTable({ tickets }: { tickets: any[] }) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  if (!tickets.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", backgroundColor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#374151", fontSize: "0.95rem" }}>אין פניות עדיין</p>
        <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.82rem" }}>לחצו על "פנייה חדשה" כדי לפתוח את הפנייה הראשונה שלכם</p>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {tickets.map((ticket: any) => (
        <div
          key={ticket.id}
          onMouseEnter={() => setHoverId(ticket.id)}
          onMouseLeave={() => setHoverId(null)}
          style={{
            backgroundColor: "#fff",
            borderRadius: "12px",
            border: "1px solid #f3f4f6",
            borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb"}`,
            boxShadow: hoverId === ticket.id ? "0 4px 16px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.05)",
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            alignItems: "center",
            gap: "16px",
            padding: "14px 16px 14px 20px",
            transition: "box-shadow 0.15s, transform 0.1s",
            transform: hoverId === ticket.id ? "translateY(-1px)" : "none",
            cursor: "default",
          }}
        >
          {/* Subject + meta */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#111827", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>
              {ticket.subject}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              {ticket.computerName} · {ticket.category} · {new Date(ticket.createdAt).toLocaleDateString("he-IL")}
            </div>
          </div>

          {/* Urgency */}
          <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>

          {/* Status */}
          <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}) }}>{ticket.status}</span>

          {/* Arrow */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
            <path d="M15 18l-6-6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      ))}
    </div>
  )
}
