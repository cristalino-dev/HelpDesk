"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import TicketForm from "@/components/TicketForm"
import TicketTable from "@/components/TicketTable"
import type { Ticket } from "@/types/ticket"
import APP_VERSION from "@/lib/version"

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  const loadTickets = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/tickets")
      const data = await res.json()
      setTickets(Array.isArray(data) ? data : [])
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated") loadTickets()
  }, [status])

  if (status === "loading") return null

  const open = tickets.filter(t => t.status === "פתוח").length
  const inProgress = tickets.filter(t => t.status === "בטיפול").length
  const closed = tickets.filter(t => t.status === "סגור").length

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5" }}>
      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px",
        boxShadow: "0 4px 16px rgba(37,99,235,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff", letterSpacing: "-0.01em" }}>מערכת הלפדסק</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={44} height={44} style={{ objectFit: "contain", borderRadius: "6px" }} />
          {session?.user?.isAdmin && (
            <a href="/admin" style={{
              fontSize: "0.8rem",
              color: "#fff",
              fontWeight: 600,
              textDecoration: "none",
              backgroundColor: "rgba(255,255,255,0.2)",
              padding: "5px 14px",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.3)",
              letterSpacing: "0.01em",
            }}>
              ניהול פניות
            </a>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "rgba(255,255,255,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", fontWeight: 700, color: "#fff",
              flexShrink: 0,
            }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.85)", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.user?.name}</span>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
          >
            יציאה
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "920px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Stats row */}
        {!loading && tickets.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {[
              { label: "פתוחות", count: open, color: "#2563eb", bg: "#eff6ff" },
              { label: "בטיפול", count: inProgress, color: "#d97706", bg: "#fffbeb" },
              { label: "סגורות", count: closed, color: "#16a34a", bg: "#f0fdf4" },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ backgroundColor: "#fff", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "12px", border: "1px solid #f3f4f6" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, color }}>{count}</div>
                <span style={{ fontSize: "0.82rem", color: "#6b7280", fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Title + button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937", letterSpacing: "-0.01em" }}>הפניות שלי</h2>
          <button
            onClick={() => setShowForm(f => !f)}
            style={{
              backgroundColor: showForm ? "#f3f4f6" : "#2563eb",
              color: showForm ? "#374151" : "#fff",
              fontWeight: 600,
              padding: "9px 18px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              boxShadow: showForm ? "none" : "0 4px 12px rgba(37,99,235,0.3)",
              transition: "all 0.15s",
            }}
          >
            {showForm ? "ביטול" : "+ פנייה חדשה"}
          </button>
        </div>

        {showForm && <TicketForm onSuccess={() => { setShowForm(false); loadTickets() }} />}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען פניות...</p>
          </div>
        ) : (
          <TicketTable tickets={tickets} />
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "24px 0 32px", fontSize: "0.72rem", color: "#d1d5db" }}>
        v{APP_VERSION} &copy; 2026 Alon Kerem
      </footer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
