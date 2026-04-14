/**
 * app/dashboard/page.tsx — User Dashboard
 *
 * PURPOSE:
 * ─────────
 * The primary page for authenticated employees. Shows their tickets and
 * provides access to the new ticket form.
 *
 * DATA FLOW:
 * ───────────
 *   On mount (status === "authenticated"):
 *     1. GET /api/tickets       → loads the user's ticket list
 *     2. GET /api/profile       → loads saved phone + station for TicketForm pre-fill
 *
 *   User opens "+ פנייה חדשה":
 *     — TicketForm is shown (slide-down by toggling showForm state)
 *     — defaultPhone and defaultStation passed from saved profile
 *
 *   TicketForm.onSuccess:
 *     — hides the form (setShowForm(false))
 *     — re-fetches tickets (loadTickets()) to show the new entry
 *
 * STATS CARDS:
 * ─────────────
 * The three summary cards (פתוחות, בטיפול, סגורות) only render when:
 *   - Loading is complete (loading === false)
 *   - There is at least one ticket (tickets.length > 0)
 * This avoids showing 0/0/0 counters while loading or for new users.
 *
 * NAVIGATION:
 * ────────────
 * Header contains: logo | עזרה | צרו קשר | [admin link if isAdmin] | profile avatar | יציאה
 *
 * PROTECTION:
 * ────────────
 * useEffect watches `status` and redirects to /login if unauthenticated.
 * While the session is loading, returns null (blank screen) to avoid flash.
 */

"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import TicketForm from "@/components/TicketForm"
import TicketTable from "@/components/TicketTable"
import type { Ticket } from "@/types/ticket"
import FooterCopyright from "@/components/FooterCopyright"
import { STAFF_EMAILS } from "@/lib/staffEmails"

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
  const [profile, setProfile] = useState<{ phone?: string; station?: string }>({})


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
    if (status === "authenticated") {
      loadTickets()
      fetch("/api/profile").then(r => r.json()).then(d => setProfile({ phone: d.phone ?? "", station: d.station ?? "" }))
    }
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
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff", letterSpacing: "-0.01em" }}>מערכת helpdesk</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={44} height={44} loading="eager" style={{ objectFit: "contain", borderRadius: "6px" }} />
          <Link href="/help" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>עזרה</Link>
          <Link href="/contact" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>צרו קשר</Link>
          {STAFF_EMAILS.includes(session?.user?.email ?? "") && (
            <Link href="/tickets" style={{ fontSize: "0.8rem", color: "#fff", fontWeight: 600, textDecoration: "none", backgroundColor: "rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.3)" }}>
              כל הפניות
            </Link>
          )}
          {session?.user?.isAdmin && (
            <Link href="/admin" style={{ fontSize: "0.8rem", color: "#fff", fontWeight: 600, textDecoration: "none", backgroundColor: "rgba(255,255,255,0.2)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.3)" }}>
              ניהול פניות
            </Link>
          )}
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: "7px", textDecoration: "none", padding: "4px 10px 4px 6px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.9)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{session?.user?.name}</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: "8px", cursor: "pointer", padding: "6px 12px", fontWeight: 500 }}
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

        {showForm && <TicketForm onSuccess={() => { setShowForm(false); loadTickets() }} defaultPhone={profile.phone} defaultStation={profile.station} />}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען פניות...</p>
          </div>
        ) : (
          <TicketTable tickets={tickets} />
        )}
      </main>

      <FooterCopyright />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
