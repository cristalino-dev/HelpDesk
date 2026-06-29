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
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import TicketForm from "@/components/TicketForm"
import TicketTable from "@/components/TicketTable"
import type { Ticket } from "@/types/ticket"
import FooterCopyright from "@/components/FooterCopyright"
import { STAFF_EMAILS, VIEWER_EMAILS } from "@/lib/staffEmails"
import { useIsMobile } from "@/lib/useIsMobile"
import { closeTicket as apiCloseTicket, setTicketStatus } from "@/lib/ticketApi"
import { T } from "@/lib/theme"
import Logo from "@/components/Logo"

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
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [linkCopied, setLinkCopied] = useState(false)


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

  const closeTicket = async (id: string) => {
    // Urgency is automatically downgraded to "נמוך" by the server on closure
    await apiCloseTicket(id)
    await loadTickets()
  }

  const reopenTicket = async (id: string) => {
    await setTicketStatus(id, "פתוח")
    await loadTickets()
  }

  useEffect(() => {
    if (status === "authenticated") {
      loadTickets()
      fetch("/api/profile").then(r => r.json()).then(d => setProfile({ phone: d.phone ?? "", station: d.station ?? "" }))
    }
  }, [status])

  const isMobile = useIsMobile()

  // Combined filter: status card + free-text search across all fields
  // Must be declared before any early return to satisfy Rules of Hooks.
  const displayTickets = useMemo(() => {
    let list = statusFilter ? tickets.filter(t => t.status === statusFilter) : tickets
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.urgency.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.platform.toLowerCase().includes(q) ||
        t.computerName.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        String(t.ticketNumber).includes(q) ||
        new Date(t.createdAt).toLocaleDateString("he-IL").includes(q)
      )
    }
    return list
  }, [tickets, statusFilter, search])

  if (status === "loading") return null

  const open = tickets.filter(t => t.status === "פתוח").length
  const inProgress = tickets.filter(t => t.status === "בטיפול").length
  const onHold = tickets.filter(t => t.status === "בהמתנה").length
  const closed = tickets.filter(t => t.status === "סגור").length

  // Shared nav-link style helpers — Cristalino white chrome (dark text on light)
  const navBtn = {
    fontSize: "0.82rem", color: T.text2, textDecoration: "none",
    padding: "8px 13px", borderRadius: "9px", fontWeight: 500,
  } as const
  const navBtnStrong = {
    ...navBtn, color: T.text, fontWeight: 600,
  } as const

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.bg }}>
      {/* ── Header (white chrome, hairline) ───────────────────────────────── */}
      <header style={{
        background: T.card,
        padding: isMobile ? "0 14px" : "0 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px",
        borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Left: brand mark + wordmark */}
        <div style={{ flexShrink: 0 }}>
          <Logo size={isMobile ? 28 : 32} subtitle={isMobile ? false : "מערכת"} />
        </div>

        {/* Right: nav */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "2px" : "4px" }}>
          {/* Secondary links — hidden on mobile */}
          {!isMobile && <Link href="/help" style={navBtn}>עזרה</Link>}
          {!isMobile && <Link href="/contact" style={navBtn}>צרו קשר</Link>}

          {/* Staff / admin links — always shown (abbreviated on mobile) */}
          {STAFF_EMAILS.includes(session?.user?.email ?? "") && (
            <Link href="/tickets" style={navBtnStrong}>
              {isMobile ? "פניות" : "כל הפניות"}
            </Link>
          )}
          {VIEWER_EMAILS.includes(session?.user?.email ?? "") && (
            <Link href="/tickets/view" style={navBtnStrong}>
              {isMobile ? "פניות" : "כל הפניות"}
            </Link>
          )}
          {session?.user?.isAdmin && (
            <Link href="/admin" style={navBtnStrong}>
              {isMobile ? "ניהול" : "ניהול פניות"}
            </Link>
          )}

          {/* Copy helpdesk link */}
          <button
            title="העתק קישור למערכת"
            onClick={() => {
              navigator.clipboard.writeText("https://helpdesk.cristalino.co.il/")
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 2000)
            }}
            style={{ background: linkCopied ? T.greenBg : "transparent", border: "none", borderRadius: "9px", cursor: "pointer", padding: isMobile ? "6px 8px" : "8px 11px", display: "flex", alignItems: "center", gap: "5px", color: linkCopied ? T.greenInk : T.text2, fontSize: "0.82rem", fontWeight: 500, transition: "background 0.15s, color 0.15s" }}
          >
            {linkCopied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {!isMobile && "הועתק!"}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {!isMobile && "קישור"}
              </>
            )}
          </button>

          {/* Profile avatar (+ name on desktop) — light pill, dark avatar w/ green initials */}
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", padding: isMobile ? "4px" : "5px 7px 5px 12px", borderRadius: "999px", background: T.bg }}>
            {!isMobile && (
              <span style={{ fontSize: "0.81rem", color: T.text, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                {session?.user?.name}
              </span>
            )}
            <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, color: T.green, flexShrink: 0 }}>
              {initials(session?.user?.name)}
            </div>
          </Link>

          {/* Logout */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ fontSize: "0.82rem", color: T.muted, background: "transparent", border: "none", borderRadius: "9px", cursor: "pointer", padding: isMobile ? "6px 8px" : "8px 12px", fontWeight: 500 }}
          >
            {isMobile ? "↩" : "יציאה"}
          </button>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: "920px", margin: "0 auto", padding: isMobile ? "16px 12px" : "32px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Stats row — clickable to filter the list */}
        {!loading && tickets.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${onHold > 0 ? 4 : 3}, 1fr)`, gap: isMobile ? "8px" : "12px" }}>
            {[
              { label: "פתוחות",   status: "פתוח",     count: open,       color: "#3D5A7D", dark: false },
              { label: "בטיפול",   status: "בטיפול",   count: inProgress, color: "#A9741A", dark: false },
              ...(onHold > 0 ? [{ label: "בהמתנה", status: "בהמתנה", count: onHold,     color: "#5B6260", dark: false }] : []),
              { label: "סגורות",   status: "סגור",     count: closed,     color: T.green,   dark: true  },
            ].map(({ label, status, count, color, dark }) => {
              const isActive = statusFilter === status
              return (
                <button
                  key={label}
                  onClick={() => setStatusFilter(f => f === status ? null : status)}
                  style={{
                    backgroundColor: dark ? T.dark : "#fff",
                    borderRadius: "14px",
                    padding: isMobile ? "13px 15px" : "18px 22px",
                    boxShadow: isActive ? `0 0 0 2px rgba(116,197,58,0.30)` : "none",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                    border: isActive ? `1px solid ${T.green}` : `1px solid ${dark ? T.dark : T.border}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    width: "100%", textAlign: "right",
                  }}
                >
                  <span style={{ fontSize: isMobile ? "0.76rem" : "0.82rem", color: dark ? "#A9AEA8" : T.text3, fontWeight: 500 }}>{label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {isActive && <span style={{ fontSize: "0.68rem", color: dark ? T.green : T.muted, fontWeight: 700 }}>✕</span>}
                    <span style={{ fontSize: isMobile ? "1.5rem" : "1.9rem", fontWeight: 800, color: dark ? T.green : color, lineHeight: 1 }}>{count}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Title + new-ticket button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
            הפניות שלי
            {statusFilter && (
              <span style={{ marginRight: 8, fontSize: "0.75rem", fontWeight: 500, color: T.muted }}>
                — מסנן: {statusFilter === "פתוח" ? "פתוחות" : statusFilter === "בטיפול" ? "בטיפול" : statusFilter === "בהמתנה" ? "בהמתנה" : "סגורות"}
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowForm(f => !f)}
            style={{
              backgroundColor: showForm ? T.bg : T.dark,
              color: showForm ? T.text2 : "#fff",
              fontWeight: 600,
              padding: isMobile ? "10px 16px" : "11px 20px",
              borderRadius: "11px",
              border: "none",
              cursor: "pointer",
              fontSize: isMobile ? "0.82rem" : "0.875rem",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: "9px",
            }}
          >
            {!showForm && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: T.green, display: "inline-block" }} />}
            {showForm ? "ביטול" : "פנייה חדשה"}
          </button>
        </div>

        {/* Search bar */}
        {!loading && tickets.length > 0 && (
          <div style={{ position: "relative" }}>
            <svg
              width="15" height="15" viewBox="0 0 24 24" fill="none"
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}
            >
              <circle cx="11" cy="11" r="8" stroke="#374151" strokeWidth="2"/>
              <path d="M21 21l-4.35-4.35" stroke="#374151" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי נושא, סטטוס, קטגוריה, תאריך..."
              style={{
                width: "100%",
                padding: "9px 36px 9px 36px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                fontSize: "0.87rem",
                background: "#fff",
                boxSizing: "border-box",
                outline: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: "#9ca3af", padding: "2px 6px" }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Active filter summary */}
        {!loading && (search || statusFilter) && (
          <div style={{ fontSize: "0.78rem", color: "#6b7280", display: "flex", alignItems: "center", gap: 8 }}>
            <span>מציג {displayTickets.length} מתוך {tickets.length} פניות</span>
            {(search || statusFilter) && (
              <button
                onClick={() => { setSearch(""); setStatusFilter(null) }}
                style={{ fontSize: "0.75rem", color: T.greenInk, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
              >
                נקה הכל
              </button>
            )}
          </div>
        )}

        {showForm && <TicketForm onSuccess={() => { setShowForm(false); loadTickets() }} defaultPhone={profile.phone} defaultStation={profile.station} />}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid #e5e7eb", borderTopColor: T.green, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען פניות...</p>
          </div>
        ) : (
          <TicketTable
            tickets={displayTickets}
            onClose={closeTicket}
            onReopen={reopenTicket}
            isFiltered={!!(search || statusFilter)}
          />
        )}
      </main>

      <FooterCopyright />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
