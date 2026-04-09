"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import type { TicketWithUser } from "@/types/ticket"
import APP_VERSION from "@/lib/version"

const URGENCY_STYLES: Record<string, React.CSSProperties> = {
  "נמוך":   { backgroundColor: "#dcfce7", color: "#166534" },
  "בינוני": { backgroundColor: "#fef3c7", color: "#92400e" },
  "גבוה":   { backgroundColor: "#ffedd5", color: "#9a3412" },
  "דחוף":   { backgroundColor: "#fee2e2", color: "#991b1b" },
}

const STATUS_STYLES: Record<string, React.CSSProperties> = {
  "פתוח":   { backgroundColor: "#dbeafe", color: "#1e40af" },
  "בטיפול": { backgroundColor: "#fef3c7", color: "#92400e" },
  "סגור":   { backgroundColor: "#dcfce7", color: "#166534" },
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

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    if (status === "authenticated" && !session?.user?.isAdmin) router.push("/dashboard")
  }, [status, session, router])

  const loadTickets = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/tickets")
      const data = await res.json()
      const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }
      const open = (Array.isArray(data) ? data : [] as TicketWithUser[])
        .filter((t: TicketWithUser) => t.status !== "סגור")
        .sort((a: TicketWithUser, b: TicketWithUser) => {
          const urgencyDiff = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
          if (urgencyDiff !== 0) return urgencyDiff
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        })
      setTickets(open)
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id)
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      })
      await loadTickets()
    } finally {
      setUpdating(null)
      setExpanded(null)
    }
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.isAdmin) loadTickets()
  }, [status, session])

  if (status === "loading") return null

  const urgentCount = tickets.filter(t => t.urgency === "דחוף").length
  const highCount = tickets.filter(t => t.urgency === "גבוה").length

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5" }}>
      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px",
        boxShadow: "0 4px 16px rgba(79,70,229,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>helpdesk מערכת</span>
          <span style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.25)" }}>ניהול</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={44} height={44} style={{ objectFit: "contain", borderRadius: "6px" }} />
          <a href="/dashboard" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>לוח משתמש</a>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.85)" }}>{session?.user?.name}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", background: "none", border: "none", cursor: "pointer" }}>יציאה</button>
        </div>
      </header>

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Stats row */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {[
              { label: "סה״כ בתור", count: tickets.length, color: "#4f46e5", bg: "#ede9fe" },
              { label: "דחוף", count: urgentCount, color: "#dc2626", bg: "#fee2e2" },
              { label: "גבוה", count: highCount, color: "#ea580c", bg: "#ffedd5" },
              { label: "בטיפול", count: tickets.filter(t => t.status === "בטיפול").length, color: "#d97706", bg: "#fef3c7" },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ backgroundColor: "#fff", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "12px", border: "1px solid #f3f4f6" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", fontWeight: 800, color }}>{count}</div>
                <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937" }}>תור פניות פתוחות</h2>
            {!loading && <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#9ca3af" }}>ממוין לפי דחיפות, אחר כך לפי זמן פתיחה</p>}
          </div>
          <button
            onClick={loadTickets}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", color: "#4f46e5", background: "#ede9fe", border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: "8px", fontWeight: 600 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            רענן
          </button>
        </div>

        {/* Ticket list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid #e5e7eb", borderTopColor: "#4f46e5", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 24px", backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>✓</div>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#374151" }}>כל הפניות טופלו!</p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#9ca3af" }}>אין פניות פתוחות כרגע</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {tickets.map((ticket, i) => (
              <div
                key={ticket.id}
                onMouseEnter={() => setHoverId(ticket.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #f3f4f6",
                  borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb"}`,
                  boxShadow: hoverId === ticket.id ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)",
                  overflow: "hidden",
                  transition: "box-shadow 0.15s",
                }}
              >
                {/* Main row */}
                <div
                  onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                  style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto", alignItems: "center", gap: "14px", padding: "14px 18px", cursor: "pointer" }}
                >
                  {/* Queue position */}
                  <div style={{
                    width: "26px", height: "26px", borderRadius: "50%",
                    backgroundColor: i === 0 ? "#fef3c7" : "#f3f4f6",
                    color: i === 0 ? "#92400e" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 800, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Subject + user info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#111827", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ticket.subject}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" }}>
                      {ticket.user?.name ?? ticket.user?.email} · {ticket.phone} · {ticket.computerName} · {ticket.category}
                    </div>
                  </div>

                  {/* Urgency */}
                  <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>

                  {/* Status */}
                  <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}) }}>{ticket.status}</span>

                  {/* Time */}
                  <div style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "left", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                    <div>{new Date(ticket.createdAt).toLocaleDateString("he-IL")}</div>
                    <div>{new Date(ticket.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>

                  {/* Expand chevron */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transition: "transform 0.2s", transform: expanded === ticket.id ? "rotate(-90deg)" : "rotate(0)" }}>
                    <path d="M6 9l6 6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Expanded panel */}
                {expanded === ticket.id && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: "16px 20px", backgroundColor: "#fafbfc" }}>
                    <p style={{ margin: "0 0 16px", fontSize: "0.875rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600 }}>שנה סטטוס:</span>
                      {["פתוח", "בטיפול", "סגור"].map(s => (
                        <button
                          key={s}
                          disabled={updating === ticket.id || ticket.status === s}
                          onClick={e => { e.stopPropagation(); updateStatus(ticket.id, s) }}
                          style={{
                            padding: "5px 14px",
                            borderRadius: "999px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            border: "none",
                            cursor: ticket.status === s || updating === ticket.id ? "default" : "pointer",
                            opacity: updating === ticket.id ? 0.5 : 1,
                            ...(ticket.status === s ? STATUS_STYLES[s] : { backgroundColor: "#f3f4f6", color: "#374151" }),
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "24px 0 32px", fontSize: "0.72rem", color: "#d1d5db" }}>
        v{APP_VERSION} &copy; 2026 Alon Kerem
      </footer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
