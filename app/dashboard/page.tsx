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
 *     3. GET /api/tickets/assigned → STAFF ONLY (v3.81): the open tickets
 *        assigned to them, shown as "משויכות אליי" above their own tickets.
 *        A separate list because it takes separate actions — see the note on
 *        that section below.
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
import { useSession } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import TicketForm from "@/components/TicketForm"
import { TicketCreatedDialog } from "@/components/TicketCreated"
import TicketTable from "@/components/TicketTable"
import type { Ticket, TicketWithUser } from "@/types/ticket"
import FooterCopyright from "@/components/FooterCopyright"
import { useIsMobile } from "@/lib/useIsMobile"
import { setTicketStatus, setTicketStatusOrError } from "@/lib/ticketApi"
import ErrorToast from "@/components/ErrorToast"
import { matchesTicketNumber, withNumberSuggestion } from "@/lib/ticketSearch"
import { T, HDR } from "@/lib/theme"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import AppHeader from "@/components/AppHeader"
import AppNav from "@/components/AppNav"

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [showForm, setShowForm] = useState(false)
  /** The ticket just created, while its confirmation is on screen. */
  const [created, setCreated] = useState<{ id: string; ticketNumber: number; subject: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ phone?: string; station?: string }>({})
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  /** Server refusal of a close (e.g. an unfinished offboarding checklist). */
  const [statusError, setStatusError] = useState<string | null>(null)
  /** Open tickets assigned to the caller — staff only. See /api/tickets/assigned. */
  const [assigned, setAssigned] = useState<TicketWithUser[]>([])

  // Rule 26: admin implies staff. Derived from the session, not stored.
  const isStaff = !!session?.user?.isAdmin || STAFF_EMAILS.includes(session?.user?.email ?? "")


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
    // Urgency is automatically downgraded to "נמוך" by the server on closure.
    // An offboarding ticket refuses to close until its return checklist is
    // finished, and the reason is worth showing rather than swallowing.
    setStatusError(await setTicketStatusOrError(id, "סגור"))
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

  // The tickets this staff member is handling (v3.81). Before v3.72 an admin
  // saw them here only because they saw every ticket; scoping /api/tickets to
  // "opened by me" removed them along with the flood. Employees never ask:
  // the endpoint would refuse them, and there is nothing to show.
  useEffect(() => {
    if (status !== "authenticated" || !isStaff) return
    let cancelled = false
    fetch("/api/tickets/assigned")
      .then(r => (r.ok ? r.json() : []))   // rule 18: the maintenance page is not JSON
      .then(d => { if (!cancelled) setAssigned(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setAssigned([]) })
    return () => { cancelled = true }
  }, [status, isStaff])

  const isMobile = useIsMobile()

  // Combined filter: status card + free-text search across all fields
  // Must be declared before any early return to satisfy Rules of Hooks.
  const { displayTickets, numberSuggestion } = useMemo(() => {
    let list = statusFilter ? tickets.filter(t => t.status === statusFilter) : tickets
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(t =>
        matchesTicketNumber(t.ticketNumber, q) ||
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.urgency.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.platform.toLowerCase().includes(q) ||
        t.computerName.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        new Date(t.createdAt).toLocaleDateString("he-IL").includes(q)
      )
    }
    // An exact HDTC-N query always surfaces its ticket — open or closed, and
    // regardless of the active status card.
    const pinned = withNumberSuggestion(list, tickets, search)
    return { displayTickets: pinned.list, numberSuggestion: pinned.suggestion }
  }, [tickets, statusFilter, search])

  if (status === "loading") return null

  const open = tickets.filter(t => t.status === "פתוח").length
  const inProgress = tickets.filter(t => t.status === "בטיפול").length
  const onHold = tickets.filter(t => t.status === "בהמתנה").length
  const closed = tickets.filter(t => t.status === "סגור").length

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.bg }}>
      <ErrorToast message={statusError} onClose={() => setStatusError(null)} />
      <AppHeader><AppNav /></AppHeader>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: "920px", margin: "0 auto", padding: isMobile ? "16px 12px" : "32px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ── Assigned to me (staff) ───────────────────────────────────────
            Its own list, above the caller's own tickets, and deliberately
            WITHOUT onClose / onReopen: on this page those are the OWNER's
            actions, and the stat cards and search below count the owner's
            tickets. A ticket you are handling is worked from its own page. */}
        {isStaff && assigned.length > 0 && (
          <>
          <section aria-label="משויכות אליי" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
                משויכות אליי
                <span style={{ marginRight: 8, fontSize: "0.8rem", fontWeight: 600, color: T.muted }}>{assigned.length}</span>
              </h2>
              <Link href="/tickets" style={{ fontSize: "0.8rem", color: T.greenInk, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                לכל הפניות ←
              </Link>
            </div>
            <TicketTable tickets={assigned} />
          </section>

          {/* The break between the two lists: what you are HANDLING above, what
              you ASKED FOR below. Not a plain hairline — every card on the page
              already has one, and the line between two lists has to read as a
              different kind of line from the edge of a card. The lime dot is
              the brand's own mark, as on the logo and the "פנייה חדשה" button. */}
          <div
            role="separator"
            aria-label="סוף הפניות המשויכות"
            style={{ display: "flex", alignItems: "center", gap: "12px", margin: "10px 0" }}
          >
            <span style={{ flex: 1, height: 1, background: T.borderStrong }} />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
            <span style={{ flex: 1, height: 1, background: T.borderStrong }} />
          </div>
          </>
        )}

        {/* Stats row — clickable to filter the list.
            MOBILE: 2×2 grid — 4 cards in one row overflow narrow screens. */}
        {!loading && tickets.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : `repeat(${onHold > 0 ? 4 : 3}, 1fr)`, gap: isMobile ? "8px" : "12px" }}>
            {[
              { label: "פתוחות",   status: "פתוח",     count: open,       color: T.pillBlueFg, dark: false },
              { label: "בטיפול",   status: "בטיפול",   count: inProgress, color: T.pillAmberFg, dark: false },
              ...(onHold > 0 ? [{ label: "בהמתנה", status: "בהמתנה", count: onHold,     color: T.text3, dark: false }] : []),
              { label: "סגורות",   status: "סגור",     count: closed,     color: T.green,   dark: true  },
            ].map(({ label, status, count, color, dark }) => {
              const isActive = statusFilter === status
              return (
                <button
                  key={label}
                  onClick={() => setStatusFilter(f => f === status ? null : status)}
                  style={{
                    backgroundColor: dark ? T.inverseBg : T.card,
                    borderRadius: "14px",
                    padding: isMobile ? "13px 15px" : "18px 22px",
                    boxShadow: isActive ? `0 0 0 2px ${T.greenBorder}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                    border: isActive ? `1px solid ${T.green}` : `1px solid ${dark ? T.inverseBg : T.border}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    width: "100%", textAlign: "right",
                  }}
                >
                  <span style={{ fontSize: isMobile ? "0.76rem" : "0.82rem", color: dark ? HDR.link : T.text3, fontWeight: 500 }}>{label}</span>
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
              backgroundColor: showForm ? T.bg : T.inverseBg,
              color: showForm ? T.text2 : T.inverseText,
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
              <circle cx="11" cy="11" r="8" stroke={T.ink} strokeWidth="2"/>
              <path d="M21 21l-4.35-4.35" stroke={T.ink} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש לפי מספר פנייה (HDTC-123), נושא, סטטוס, קטגוריה..."
              style={{
                width: "100%",
                padding: "9px 36px 9px 36px",
                borderRadius: 10,
                border: `1px solid ${T.line}`,
                fontSize: "0.87rem",
                background: T.card,
                boxSizing: "border-box",
                outline: "none",
                boxShadow: `0 1px 3px ${T.shadow1}`,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "0.75rem", color: T.inkFaint, padding: "2px 6px" }}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Active filter summary */}
        {!loading && (search || statusFilter) && (
          <div style={{ fontSize: "0.78rem", color: T.inkMuted, display: "flex", alignItems: "center", gap: 8 }}>
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

        {/* Ticket-number suggestion — an exact HDTC-N hit, open or closed */}
        {!loading && numberSuggestion && (
          <a
            href={`/tickets/HDTC-${numberSuggestion.ticketNumber}`}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.card, border: `1px solid ${T.border}`, borderRight: `4px solid ${T.text}`, borderRadius: 12, textDecoration: "none", boxShadow: `0 1px 3px ${T.shadow1}`, flexWrap: "wrap" }}
          >
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 7px", flexShrink: 0 }}>
              HDTC-{numberSuggestion.ticketNumber}
            </span>
            <span style={{ fontWeight: 600, color: T.text, fontSize: "0.86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
              {numberSuggestion.subject}
            </span>
            <span style={{ fontSize: "0.72rem", color: T.text3, flexShrink: 0 }}>{numberSuggestion.status} — פתחו ←</span>
          </a>
        )}

        {showForm && (
          <TicketForm
            onSuccess={t => { setShowForm(false); loadTickets(); setCreated(t) }}
            defaultPhone={profile.phone} defaultStation={profile.station}
            isAdmin={session?.user?.isAdmin}
          />
        )}

        {/* The number is the only handle anyone has on a ticket, and this is
            the one moment it is on screen. See components/TicketCreated. */}
        {created && (
          <TicketCreatedDialog
            ticketNumber={created.ticketNumber}
            subject={created.subject}
            onClose={() => setCreated(null)}
          >
            <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={`/tickets/HDTC-${created.ticketNumber}`}
                style={{ padding: "9px 18px", borderRadius: 10, background: T.card, border: `1px solid ${T.borderStrong}`, color: T.text2, fontWeight: 700, fontSize: "0.84rem", textDecoration: "none" }}
              >צפה בפנייה</Link>
              <button
                onClick={() => setCreated(null)}
                style={{ padding: "9px 18px", borderRadius: 10, background: "none", border: "none", color: T.text3, fontWeight: 600, fontSize: "0.84rem", cursor: "pointer" }}
              >סגור</button>
            </div>
          </TicketCreatedDialog>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint }}>
            <div style={{ width: "36px", height: "36px", border: `3px solid ${T.line}`, borderTopColor: T.green, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
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
