/**
 * app/admin/page.tsx — Admin Control Panel
 *
 * PURPOSE:
 * ─────────
 * The admin-only management interface. Accessible only to users with
 * isAdmin === true (enforced both client-side and server-side by /api/* routes).
 *
 * THREE TABS:
 * ────────────
 *
 * 1. תור פניות (Ticket Queue)
 *    ───────────────────────────
 *    Shows all open/in-progress tickets sorted by urgency priority, then by
 *    creation time (FIFO within each urgency level). Admins can click any
 *    ticket to expand it and change the status to פתוח/בטיפול/סגור.
 *
 *    Sorting: done client-side after fetch.
 *    Priority map: דחוף=0, גבוה=1, בינוני=2, נמוך=3 (lower = higher priority)
 *    Note: Closed tickets (סגור) are filtered OUT of the queue to keep it actionable.
 *
 * 2. ניהול משתמשים (User Management)
 *    ──────────────────────────────────
 *    Searchable table of all registered users. Admins can edit:
 *      - Full name
 *      - Phone number
 *      - Workstation hostname
 *      - isAdmin flag (grants or revokes admin privileges)
 *    Uses an inline modal (editingUser state) — no separate route.
 *    Data is loaded lazily (only when the tab is first opened).
 *
 * 3. יומן שגיאות (Error Logs)
 *    ────────────────────────────
 *    Dark terminal-style read-only textarea showing all log entries for a
 *    selected date. Defaults to today. Admin can pick any past date from
 *    the date picker input.
 *    Data is loaded when the tab is opened and on manual refresh.
 *    Scrollable and selectable — admin can copy log text for external tools.
 *    Displays entry count next to the refresh button.
 *
 * STATE SUMMARY:
 * ───────────────
 *   tab           — active tab ("tickets" | "users" | "logs")
 *   tickets       — array of open/in-progress TicketWithUser objects
 *   loading       — tickets loading indicator
 *   expanded      — id of the currently expanded ticket card (null = none)
 *   updating      — id of the ticket whose status is being saved (for disabled state)
 *   hoverId       — id of the hovered ticket card (for shadow effect)
 *   users         — array of UserRow objects (loaded lazily)
 *   usersLoading  — users loading indicator
 *   userSearch    — search input value for filtering users by name/email
 *   editingUser   — UserRow being edited in the modal (null = modal closed)
 *   userSaving    — modal save button loading state
 *   logDate       — selected date string "YYYY-MM-DD" for log tab
 *   logText       — formatted log text content for the textarea
 *   logCount      — number of log entries for the selected date
 *   logsLoading   — log loading indicator
 */

"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"
import { STAFF_MEMBERS } from "@/lib/staffEmails"
import type { TicketWithUser, TicketNote, TicketMessage } from "@/types/ticket"
import FooterCopyright from "@/components/FooterCopyright"
import { useIsMobile } from "@/lib/useIsMobile"

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

function staffDisplay(email: string) {
  return STAFF_MEMBERS.find(m => m.email === email)?.display ?? email.split("@")[0]
}

interface UserRow { id: string; name: string | null; email: string; phone: string | null; station: string | null; isAdmin: boolean }

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [statFilter, setStatFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<"tickets" | "users" | "logs">("tickets")
  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ subject: string; description: string; phone: string; computerName: string; urgency: string; category: string; platform: string; status: string }>({ subject: "", description: "", phone: "", computerName: "", urgency: "", category: "", platform: "", status: "" })
  const [editSaving, setEditSaving] = useState(false)
  // Notes per expanded ticket
  const [expandedNotes, setExpandedNotes]       = useState<Record<string, TicketNote[]>>({})
  const [noteText, setNoteText]                 = useState<Record<string, string>>({})
  const [noteImages, setNoteImages]             = useState<Record<string, PendingImage[]>>({})
  const [noteSaving, setNoteSaving]             = useState<string | null>(null)
  // Messages (conversation with user) per expanded ticket
  const [expandedMessages, setExpandedMessages] = useState<Record<string, TicketMessage[]>>({})
  const [replyText, setReplyText]               = useState<Record<string, string>>({})
  const [replySaving, setReplySaving]           = useState<string | null>(null)
  // Users tab
  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState("")
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [userSaving, setUserSaving] = useState(false)
  // Logs tab
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [logText, setLogText] = useState("")
  const [logCount, setLogCount] = useState(0)
  const [logsLoading, setLogsLoading] = useState(false)
  // Assignment
  const [assigning, setAssigning] = useState<string | null>(null)
  // Ticket-tab filters / sort
  const [showAll,  setShowAll]  = useState(false)
  const [ticketSearch, setTicketSearch] = useState("")
  const [sortKey, setSortKey] = useState<"subject" | "urgency" | "status" | "createdAt" | "updatedAt" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    if (status === "authenticated" && !session?.user?.isAdmin) router.push("/dashboard")
  }, [status, session, router])

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

  // ── Derived ticket lists ─────────────────────────────────────────────────
  const { displayTickets, openTickets } = useMemo(() => {
    const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }
    const openTickets = tickets.filter(t => t.status !== "סגור")

    let list = statFilter ? [...tickets] : (showAll ? tickets : openTickets)
    if (ticketSearch.trim()) {
      const q = ticketSearch.trim().toLowerCase()
      list = list.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.user?.name ?? "").toLowerCase().includes(q) ||
        (t.user?.email ?? "").toLowerCase().includes(q) ||
        t.computerName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.urgency.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        new Date(t.createdAt).toLocaleDateString("he-IL").includes(q)
      )
    }

    if (statFilter === "queue")        list = list.filter(t => t.status !== "סגור")
    else if (statFilter === "urgent")  list = list.filter(t => t.urgency === "דחוף" && t.status !== "סגור")
    else if (statFilter === "high")    list = list.filter(t => t.urgency === "גבוה" && t.status !== "סגור")
    else if (statFilter === "inprog")  list = list.filter(t => t.status === "בטיפול")
    else if (statFilter === "closed")  list = list.filter(t => t.status === "סגור")

    const displayTickets = [...list].sort((a, b) => {
      if (sortKey) {
        const dir = sortDir === "asc" ? 1 : -1
        switch (sortKey) {
          case "subject":   return dir * a.subject.localeCompare(b.subject, "he")
          case "urgency":   return dir * ((URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2))
          case "status": {
            const ORDER: Record<string, number> = { "פתוח": 0, "בטיפול": 1, "סגור": 2 }
            return dir * ((ORDER[a.status] ?? 0) - (ORDER[b.status] ?? 0))
          }
          case "createdAt": return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          case "updatedAt": return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
        }
      }
      // Default: urgency priority then FIFO (queue mode), or updatedAt DESC (all mode)
      if (!showAll) {
        const urgencyDiff = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
        if (urgencyDiff !== 0) return urgencyDiff
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return { displayTickets, openTickets }
  }, [tickets, showAll, ticketSearch, sortKey, sortDir, statFilter])

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

  const assignTicket = async (ticketId: string, email: string) => {
    setAssigning(ticketId)
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticketId, assignedTo: email }),
      })
      // Optimistic local update so the row reflects the change immediately
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assignedTo: email } : t))
    } finally {
      setAssigning(null)
    }
  }

  const saveEdit = async () => {
    if (!editingTicketId) return
    setEditSaving(true)
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingTicketId, ...editForm }),
      })
      setEditingTicketId(null)
      await loadTickets()
    } finally {
      setEditSaving(false)
    }
  }

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await fetch("/api/users")
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } finally {
      setUsersLoading(false)
    }
  }

  const loadLogs = async (date: string) => {
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/logs?date=${date}`)
      const data = await res.json()
      if (!Array.isArray(data)) { setLogText(""); setLogCount(0); return }
      setLogCount(data.length)
      if (data.length === 0) {
        setLogText("אין רשומות ביומן לתאריך זה.")
        return
      }
      const formatted = data.map((entry: { timestamp: string; level: string; source?: string; message: string; stack?: string }) => {
        const time = new Date(entry.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        const src = entry.source ? ` [${entry.source}]` : ""
        const stack = entry.stack ? `\n${entry.stack}` : ""
        return `[${time}] [${entry.level.toUpperCase()}]${src}\n${entry.message}${stack}`
      }).join("\n\n---\n\n")
      setLogText(formatted)
    } finally {
      setLogsLoading(false)
    }
  }

  const saveUser = async () => {
    if (!editingUser) return
    setUserSaving(true)
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUser),
      })
      await loadUsers()
      setEditingUser(null)
    } finally {
      setUserSaving(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.isAdmin) loadTickets()
  }, [status, session])

  if (status === "loading") return null

  const filteredUsers = users.filter(u =>
    (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  )

  const urgentCount = openTickets.filter(t => t.urgency === "דחוף").length
  const highCount   = openTickets.filter(t => t.urgency === "גבוה").length

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5", position: "relative" }}>
      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "64px",
        boxShadow: "0 4px 16px rgba(79,70,229,0.3)",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>{isMobile ? "ניהול" : "מערכת helpdesk"}</span>
          {!isMobile && (
            <span style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.25)" }}>ניהול</span>
          )}
        </div>

        {isMobile ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Image src="/logo.jpeg" alt="Cristalino Group" width={36} height={36} loading="eager" style={{ objectFit: "contain", borderRadius: "6px" }} />
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, color: "#fff", fontSize: "1.3rem", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Image src="/logo.jpeg" alt="Cristalino Group" width={44} height={44} loading="eager" style={{ objectFit: "contain", borderRadius: "6px" }} />
            <a href="/admin-manual" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>📖 מדריך מנהל</a>
            <a href="/admin/reviews" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>⭐ ביקורות</a>
            <a href="/admin/logs" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>⚠️ לוג שגיאות</a>
            <a href="/contact" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>צרו קשר</a>
            <a href="/dashboard" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>לוח משתמש</a>
            <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", cursor: "pointer", transition: "opacity 0.2s" }}
              onMouseOver={e => (e.currentTarget.style.opacity = "0.8")}
              onMouseOut={e => (e.currentTarget.style.opacity = "1")}
            >
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#fff" }}>
                {initials(session?.user?.name)}
              </div>
              <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{session?.user?.name}</span>
            </Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", background: "none", border: "none", cursor: "pointer" }}>יציאה</button>
          </div>
        )}
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && isMobile && (
        <div style={{ position: "absolute", top: 64, right: 0, left: 0, zIndex: 100, background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
          <a href="/admin-manual" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>📖 מדריך מנהל</a>
          <a href="/admin/reviews" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>⭐ ביקורות</a>
          <a href="/admin/logs" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>⚠️ לוג שגיאות</a>
          <a href="/contact" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>צרו קשר</a>
          <a href="/dashboard" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: "rgba(255,255,255,0.75)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>לוח משתמש</a>
          <Link href="/profile" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            {session?.user?.name}
          </Link>
          <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/login" }) }} style={{ display: "block", width: "100%", textAlign: "right", padding: "14px 24px", color: "rgba(255,255,255,0.7)", background: "none", border: "none", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer" }}>יציאה</button>
        </div>
      )}

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e5e7eb", paddingBottom: "0", overflowX: isMobile ? "auto" : "visible", flexWrap: isMobile ? "nowrap" : "wrap" }}>
          {([["tickets", "תור פניות"], ["users", "ניהול משתמשים"], ["logs", "יומן שגיאות"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => {
              setTab(key)
              if (key === "users" && users.length === 0) loadUsers()
              if (key === "logs") loadLogs(logDate)
            }}
              style={{ padding: "10px 20px", fontWeight: 600, fontSize: "0.88rem", border: "none", background: "none", cursor: "pointer", color: tab === key ? "#4f46e5" : "#6b7280", borderBottom: tab === key ? "2px solid #4f46e5" : "2px solid transparent", marginBottom: "-2px", borderRadius: 0, whiteSpace: "nowrap", flexShrink: 0 }}>
              {label}
            </button>
          ))}
        </div>



        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Search */}
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="חפש לפי שם או אימייל..."
              style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "0.88rem", backgroundColor: "#fff", width: "100%", boxSizing: "border-box" }}
            />

            {usersLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>טוען...</div>
            ) : (
              <div style={{ backgroundColor: "#fff", borderRadius: "14px", border: "1px solid #f3f4f6", overflow: "hidden" }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px 80px 80px", gap: "12px", padding: "10px 16px", backgroundColor: "#f9fafb", borderBottom: "1px solid #f3f4f6", fontSize: "0.75rem", fontWeight: 700, color: "#6b7280" }}>
                  <span>שם</span><span>אימייל</span><span>טלפון</span><span>תחנה</span><span>מנהל</span><span></span>
                </div>
                {filteredUsers.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#9ca3af", fontSize: "0.88rem" }}>לא נמצאו משתמשים</div>}
                {filteredUsers.map(u => (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px 80px 80px", gap: "12px", padding: "12px 16px", borderBottom: "1px solid #f9fafb", alignItems: "center", fontSize: "0.85rem", color: "#374151" }}>
                    <span style={{ fontWeight: 600 }}>{u.name ?? "—"}</span>
                    <span style={{ color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                    <span>{u.phone ?? "—"}</span>
                    <span>{u.station ?? "—"}</span>
                    <span style={{ color: u.isAdmin ? "#4f46e5" : "#9ca3af", fontWeight: u.isAdmin ? 700 : 400 }}>{u.isAdmin ? "כן" : "לא"}</span>
                    <button onClick={() => setEditingUser({ ...u })} style={{ fontSize: "0.75rem", color: "#4f46e5", background: "#ede9fe", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}>עריכה</button>
                  </div>
                ))}
              </div>
            )}

            {/* Edit modal */}
            {editingUser && (
              <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "28px", width: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937" }}>עריכת משתמש</h3>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{editingUser.email}</div>

                  {[
                    { label: "שם מלא",     key: "name"    as const, placeholder: "ישראל ישראלי" },
                    { label: "טלפון",      key: "phone"   as const, placeholder: "050-0000000" },
                    { label: "תחנת עבודה", key: "station" as const, placeholder: "PC-USER-01" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>{label}</label>
                      <input value={editingUser[key] ?? ""} onChange={e => setEditingUser(u => u ? { ...u, [key]: e.target.value } : u)} placeholder={placeholder}
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "0.88rem", boxSizing: "border-box" }} />
                    </div>
                  ))}

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input type="checkbox" id="isAdmin" checked={editingUser.isAdmin} onChange={e => setEditingUser(u => u ? { ...u, isAdmin: e.target.checked } : u)} />
                    <label htmlFor="isAdmin" style={{ fontSize: "0.88rem", color: "#374151", fontWeight: 600 }}>הרשאת מנהל</label>
                  </div>

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-start" }}>
                    <button onClick={saveUser} disabled={userSaving} style={{ background: "linear-gradient(135deg, #4f46e5, #2563eb)", color: "#fff", fontWeight: 700, padding: "9px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                      {userSaving ? "שומר..." : "שמור"}
                    </button>
                    <button onClick={() => setEditingUser(null)} style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, padding: "9px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>ביטול</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {tab === "logs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Date picker row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <input
                type="date"
                value={logDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => { setLogDate(e.target.value); loadLogs(e.target.value) }}
                style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "0.88rem", backgroundColor: "#fff" }}
              />
              <button
                onClick={() => loadLogs(logDate)}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#ede9fe", color: "#4f46e5", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                רענן
              </button>
              {!logsLoading && (
                <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                  {logCount} {logCount === 1 ? "רשומה" : "רשומות"}
                </span>
              )}
            </div>

            {/* Log viewer */}
            {logsLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>טוען יומן...</div>
            ) : (
              <textarea
                readOnly
                value={logText}
                style={{
                  width: "100%",
                  height: "520px",
                  padding: "16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  backgroundColor: "#0f172a",
                  color: "#e2e8f0",
                  fontFamily: "'Courier New', Consolas, monospace",
                  fontSize: "0.78rem",
                  lineHeight: 1.7,
                  resize: "vertical",
                  boxSizing: "border-box",
                  direction: "ltr",
                  textAlign: "left",
                  whiteSpace: "pre",
                  overflowY: "auto",
                }}
              />
            )}

            <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af" }}>
              יומנים נמחקים אוטומטית לאחר 30 יום.
            </p>
          </div>
        )}

        {/* ── TICKETS TAB ── */}
        {tab === "tickets" && <>

        {/* Stats row */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: "12px" }}>
            {[
              { label: "בתור (פתוח)", count: openTickets.length,                                    color: "#4f46e5", bg: "#ede9fe", filterKey: "queue" },
              { label: "דחוף",        count: urgentCount,                                            color: "#dc2626", bg: "#fee2e2", filterKey: "urgent" },
              { label: "גבוה",        count: highCount,                                              color: "#ea580c", bg: "#ffedd5", filterKey: "high" },
              { label: "בטיפול",      count: openTickets.filter(t => t.status === "בטיפול").length, color: "#d97706", bg: "#fef3c7", filterKey: "inprog" },
              { label: "סגורות",      count: tickets.filter(t => t.status === "סגור").length,        color: "#16a34a", bg: "#f0fdf4", filterKey: "closed" },
            ].map(({ label, count, color, bg, filterKey }) => {
              const isActive = statFilter === filterKey
              return (
                <button
                  key={label}
                  onClick={() => setStatFilter(f => f === filterKey ? null : filterKey)}
                  style={{ backgroundColor: isActive ? bg : "#fff", borderRadius: "14px", padding: "14px 16px", boxShadow: isActive ? `0 0 0 1px ${color}44` : "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "10px", border: isActive ? `2px solid ${color}` : "1px solid #f3f4f6", cursor: "pointer", textAlign: "right", width: "100%" }}
                >
                  <div style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: isActive ? "#fff" : bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: 800, color, flexShrink: 0 }}>{count}</div>
                  <span style={{ fontSize: "0.78rem", color: isActive ? color : "#6b7280", fontWeight: isActive ? 700 : 500, flex: 1 }}>{label}</span>
                  {isActive && <span style={{ fontSize: "0.7rem", color, fontWeight: 700 }}>✕</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
            placeholder="חיפוש לפי נושא, שם, קטגוריה..."
            style={{ flex: 1, minWidth: 200, padding: "8px 13px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.85rem", background: "#fff" }}
          />
          {/* Open / All toggle */}
          <div style={{ display: "flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {[{ label: "פתוחות", val: false }, { label: "הכל", val: true }].map(opt => (
              <button key={String(opt.val)} onClick={() => setShowAll(opt.val)}
                style={{ padding: "7px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem",
                  background: showAll === opt.val ? "#312e81" : "transparent",
                  color:      showAll === opt.val ? "#fff"    : "#6b7280",
                  transition: "all 0.15s" }}
              >{opt.label}</button>
            ))}
          </div>
          {/* Sort buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            {([
              { key: "urgency",   label: "דחיפות" },
              { key: "status",    label: "סטטוס" },
              { key: "createdAt", label: "נפתח" },
              { key: "updatedAt", label: "עודכן" },
              { key: "subject",   label: "נושא" },
            ] as const).map(col => (
              <button key={col.key} onClick={() => handleSort(col.key)}
                style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700,
                  background: sortKey === col.key ? "#ede9fe" : "#f3f4f6",
                  color:      sortKey === col.key ? "#4f46e5" : "#9ca3af" }}
              >
                {col.label}
                <span style={{ fontSize: "0.6rem" }}>
                  {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                </span>
              </button>
            ))}
          </div>
          <button onClick={loadTickets}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#4f46e5", background: "#ede9fe", border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontWeight: 600 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            רענן
          </button>
          <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{displayTickets.length} פניות</span>
        </div>

        {/* Active stat filter indicator */}
        {statFilter && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: 10, fontSize: "0.82rem", color: "#4f46e5" }}>
            <span>מסנן: {statFilter === "queue" ? "בתור (פתוח)" : statFilter === "urgent" ? "דחוף" : statFilter === "high" ? "גבוה" : statFilter === "inprog" ? "בטיפול" : "סגורות"}</span>
            <button onClick={() => setStatFilter(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#4f46e5", fontWeight: 700, fontSize: "0.82rem", padding: 0 }}>— לחץ לביטול ✕</button>
          </div>
        )}

        {/* Title */}
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937" }}>
            {showAll ? "כל הפניות" : "תור פניות פתוחות"}
          </h2>
          {!loading && !sortKey && (
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#9ca3af" }}>
              {showAll ? "ממוין לפי תאריך עדכון אחרון" : "ממוין לפי דחיפות, אחר כך לפי זמן פתיחה"}
            </p>
          )}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid #e5e7eb", borderTopColor: "#4f46e5", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען...</p>
          </div>
        ) : displayTickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 24px", backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>{openTickets.length === 0 && !showAll ? "✓" : "🔍"}</div>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#374151" }}>{openTickets.length === 0 && !showAll ? "כל הפניות טופלו!" : "לא נמצאו פניות"}</p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#9ca3af" }}>{openTickets.length === 0 && !showAll ? "אין פניות פתוחות כרגע" : "נסו לשנות את החיפוש או הסינון"}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {displayTickets.map((ticket, i) => {
              const isClosed = ticket.status === "סגור"
              return (
              <div
                key={ticket.id}
                onMouseEnter={() => setHoverId(ticket.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #f3f4f6",
                  borderRight: `4px solid ${isClosed ? "#d1d5db" : (URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb")}`,
                  boxShadow: hoverId === ticket.id ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)",
                  overflow: "hidden",
                  transition: "box-shadow 0.15s",
                  opacity: isClosed ? 0.72 : 1,
                }}
              >
                {/* Main row */}
                {isMobile ? (
                  <div
                    onClick={async () => {
                      const next = expanded === ticket.id ? null : ticket.id
                      setExpanded(next)
                      if (next && !expandedNotes[next]) {
                        try {
                          const r = await fetch(`/api/tickets/${next}`)
                          if (r.ok) {
                            const d = await r.json()
                            setExpandedNotes(p => ({ ...p, [next]: d.notes ?? [] }))
                            setExpandedMessages(p => ({ ...p, [next]: d.messages ?? [] }))
                          }
                        } catch { /* silent */ }
                      }
                    }}
                    style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>HDTC-{ticket.ticketNumber}</span>
                        <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transition: "transform 0.2s", transform: expanded === ticket.id ? "rotate(-90deg)" : "rotate(0)" }}>
                        <path d="M6 9l6 6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}), padding: "2px 8px" }}>{ticket.urgency}</span>
                      <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}), padding: "2px 8px" }}>{ticket.status}</span>
                      <span style={{ fontSize: "0.68rem", color: "#9ca3af" }}>{new Date(ticket.createdAt).toLocaleDateString("he-IL")}</span>
                    </div>
                  </div>
                ) : (
                <div
                  onClick={async () => {
                    const next = expanded === ticket.id ? null : ticket.id
                    setExpanded(next)
                    if (next && !expandedNotes[next]) {
                      try {
                        const r = await fetch(`/api/tickets/${next}`)
                        if (r.ok) {
                          const d = await r.json()
                          setExpandedNotes(p => ({ ...p, [next]: d.notes ?? [] }))
                          setExpandedMessages(p => ({ ...p, [next]: d.messages ?? [] }))
                        }
                      } catch { /* silent */ }
                    }
                  }}
                  style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto auto", alignItems: "center", gap: "14px", padding: "14px 18px", cursor: "pointer" }}
                >
                  {/* Queue position */}
                  <div style={{
                    width: "26px", height: "26px", borderRadius: "50%",
                    backgroundColor: i === 0 && !showAll && !sortKey ? "#fef3c7" : "#f3f4f6",
                    color: i === 0 && !showAll && !sortKey ? "#92400e" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 800, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Subject + user info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 7px", letterSpacing: "0.03em", flexShrink: 0 }}>
                        HDTC-{ticket.ticketNumber}
                      </span>
                      <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticket.subject}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" }}>
                      {ticket.user?.name ?? ticket.user?.email} · {ticket.phone} · {ticket.computerName} · {ticket.category} · {ticket.platform}
                    </div>
                  </div>

                  {/* Urgency */}
                  <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>

                  {/* Status */}
                  <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}) }}>{ticket.status}</span>

                  {/* Assignee */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
                    title={ticket.assignedTo}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: ticket.assignedTo === session?.user?.email ? "#4f46e5" : "#64748b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 700 }}>
                      {staffDisplay(ticket.assignedTo).slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>{staffDisplay(ticket.assignedTo)}</span>
                  </div>

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
                )}

                {/* Expanded panel */}
                {expanded === ticket.id && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: "16px 20px", backgroundColor: "#fafbfc" }}>
                    {editingTicketId === ticket.id ? (
                      /* ── Edit mode ── */
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>נושא</div>
                            <input value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>טלפון</div>
                            <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>שם מחשב</div>
                          <input value={editForm.computerName} onChange={e => setEditForm(f => ({ ...f, computerName: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>תיאור</div>
                          <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={4}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                          {([
                            { label: "דחיפות", key: "urgency",  opts: ["נמוך", "בינוני", "גבוה", "דחוף"] },
                            { label: "סטטוס",  key: "status",   opts: ["פתוח", "בטיפול", "סגור"] },
                            { label: "קטגוריה", key: "category", opts: ["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"] },
                            { label: "פלטפורמה", key: "platform", opts: ["comax", "comax sales tracker", "אנדרואיד", "אייפד", "מחשב אישי"] },
                          ] as const).map(({ label, key, opts }) => (
                            <div key={key}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{label}</div>
                              <select value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", background: "#fff" }}>
                                {opts.map(o => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={e => { e.stopPropagation(); saveEdit() }} disabled={editSaving}
                            style={{ background: "linear-gradient(135deg,#4f46e5,#2563eb)", color: "#fff", fontWeight: 700, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem", opacity: editSaving ? 0.6 : 1 }}>
                            {editSaving ? "שומר..." : "שמור"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); setEditingTicketId(null) }}
                            style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                            ביטול
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <>
                        {/* Assignment row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", flexShrink: 0 }}>👤 מוקצה ל:</span>
                          <select
                            value={ticket.assignedTo}
                            disabled={assigning === ticket.id}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); assignTicket(ticket.id, e.target.value) }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", background: "#fff", fontWeight: 600, color: "#1e3a8a", cursor: "pointer", opacity: assigning === ticket.id ? 0.5 : 1 }}
                          >
                            {STAFF_MEMBERS.map(m => (
                              <option key={m.email} value={m.email}>{m.display}</option>
                            ))}
                          </select>
                          {ticket.assignedTo !== session?.user?.email && (
                            <button
                              onClick={e => { e.stopPropagation(); assignTicket(ticket.id, session?.user?.email ?? "") }}
                              disabled={assigning === ticket.id || !session?.user?.email}
                              style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", opacity: assigning === ticket.id ? 0.5 : 1 }}
                            >
                              הקצה לעצמי
                            </button>
                          )}
                          {assigning === ticket.id && <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>שומר...</span>}
                        </div>

                        <p style={{ margin: "0 0 16px", fontSize: "0.875rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: 14 }}>
                          <span style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600 }}>שנה סטטוס:</span>
                          {["פתוח", "בטיפול", "סגור"].map(s => (
                            <button key={s} disabled={updating === ticket.id || ticket.status === s}
                              onClick={e => { e.stopPropagation(); updateStatus(ticket.id, s) }}
                              style={{ padding: "5px 14px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: ticket.status === s || updating === ticket.id ? "default" : "pointer", opacity: updating === ticket.id ? 0.5 : 1, ...(ticket.status === s ? STATUS_STYLES[s] : { backgroundColor: "#f3f4f6", color: "#374151" }) }}>
                              {s}
                            </button>
                          ))}
                          <button
                            onClick={e => { e.stopPropagation(); setEditingTicketId(ticket.id); setEditForm({ subject: ticket.subject, description: ticket.description, phone: ticket.phone, computerName: ticket.computerName, urgency: ticket.urgency, category: ticket.category, platform: ticket.platform, status: ticket.status }) }}
                            style={{ padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: "#ede9fe", color: "#4f46e5" }}>
                            ✏️ עריכה
                          </button>
                          <a href={`/tickets/HDTC-${ticket.ticketNumber}`} onClick={e => e.stopPropagation()}
                            style={{ marginRight: "auto", padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, textDecoration: "none", background: "#f0fdf4", color: "#15803d" }}>
                            🔍 פתח פנייה מלאה
                          </a>
                        </div>

                        {/* ── Conversation with user ── */}
                        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14, marginBottom: 14 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 10 }}>💬 שיחה עם המגיש</div>
                          {(expandedMessages[ticket.id] ?? []).length === 0
                            ? <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginBottom: 10 }}>אין הודעות עדיין</div>
                            : (expandedMessages[ticket.id] ?? []).map((msg: TicketMessage) => (
                                <div key={msg.id} style={{ display: "flex", gap: 8, marginBottom: 10, flexDirection: msg.authorRole === "staff" ? "row-reverse" : "row", alignItems: "flex-start" }}>
                                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.authorRole === "staff" ? "#4f46e5" : "#0891b2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0 }}>
                                    {msg.authorName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                                  </div>
                                  <div style={{ maxWidth: "70%" }}>
                                    <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginBottom: 2, textAlign: msg.authorRole === "staff" ? "left" : "right" }}>
                                      {msg.authorName} · {new Date(msg.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                                    </div>
                                    <div style={{ background: msg.authorRole === "staff" ? "#eef2ff" : "#f0f9ff", borderRadius: 8, padding: "7px 11px", fontSize: "0.82rem", color: "#1f2937", whiteSpace: "pre-wrap" }}>{msg.content}</div>
                                  </div>
                                </div>
                              ))
                          }
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                            <textarea
                              rows={2}
                              placeholder="כתוב תגובה למגיש..."
                              value={replyText[ticket.id] ?? ""}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                              style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", resize: "none", boxSizing: "border-box" }}
                            />
                            <button
                              onClick={async e => {
                                e.stopPropagation()
                                const content = (replyText[ticket.id] ?? "").trim()
                                if (!content) return
                                setReplySaving(ticket.id)
                                try {
                                  const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ content }),
                                  })
                                  if (res.ok) {
                                    const msg: TicketMessage = await res.json()
                                    setExpandedMessages(prev => ({ ...prev, [ticket.id]: [...(prev[ticket.id] ?? []), msg] }))
                                    setReplyText(prev => ({ ...prev, [ticket.id]: "" }))
                                  }
                                } finally { setReplySaving(null) }
                              }}
                              disabled={replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim()}
                              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? "#e5e7eb" : "#2563eb", color: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? "#9ca3af" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
                            >
                              {replySaving === ticket.id ? "..." : "שלח"}
                            </button>
                          </div>
                        </div>

                        {/* ── Notes ── */}
                        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 10 }}>📝 הערות טכנאי</div>
                          {(expandedNotes[ticket.id] ?? []).length === 0
                            ? <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginBottom: 10 }}>אין הערות עדיין</div>
                            : (expandedNotes[ticket.id] ?? []).map((note: TicketNote) => (
                                <div key={note.id} style={{ borderRight: "3px solid #6366f1", paddingRight: 10, marginBottom: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#4f46e5" }}>{note.authorName}</span>
                                    <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{new Date(note.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
                                  </div>
                                  <div style={{ fontSize: "0.82rem", color: "#374151", whiteSpace: "pre-wrap" }}>{note.content}</div>
                                </div>
                              ))
                          }
                          <textarea
                            rows={2}
                            placeholder="הוסף הערה... @alon @daniel @dev @helpdesk"
                            value={noteText[ticket.id] ?? ""}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setNoteText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", resize: "none", boxSizing: "border-box", marginBottom: 4 }}
                          />
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: "0.68rem", color: "#9ca3af", alignSelf: "center" }}>הזכר:</span>
                            {STAFF_MEMBERS.map(m => (
                              <button key={m.handle} type="button"
                                onClick={e => { e.stopPropagation(); setNoteText(prev => { const cur = prev[ticket.id] ?? ""; return { ...prev, [ticket.id]: cur ? `${cur} @${m.handle}` : `@${m.handle}` } }) }}
                                style={{ padding: "1px 8px", borderRadius: 20, border: "1px solid #e0e7ff", background: "#eef2ff", color: "#4f46e5", fontSize: "0.68rem", fontWeight: 600, cursor: "pointer" }}
                              >@{m.handle}</button>
                            ))}
                          </div>
                          <div onClick={e => e.stopPropagation()} style={{ marginBottom: 8 }}>
                            <ImageAttachments
                              images={noteImages[ticket.id] ?? []}
                              onChange={imgs => setNoteImages(prev => ({ ...prev, [ticket.id]: imgs }))}
                            />
                          </div>
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              const content = (noteText[ticket.id] ?? "").trim()
                              const imgs = noteImages[ticket.id] ?? []
                              if (!content && !imgs.length) return
                              setNoteSaving(ticket.id)
                              try {
                                for (const img of imgs) {
                                  await fetch(`/api/tickets/${ticket.id}/attachments`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
                                  })
                                }
                                if (content) {
                                  const res = await fetch(`/api/tickets/${ticket.id}/notes`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ content }),
                                  })
                                  if (res.ok) {
                                    const note: TicketNote = await res.json()
                                    setExpandedNotes(prev => ({ ...prev, [ticket.id]: [...(prev[ticket.id] ?? []), note] }))
                                  }
                                }
                                setNoteText(prev => ({ ...prev, [ticket.id]: "" }))
                                setNoteImages(prev => ({ ...prev, [ticket.id]: [] }))
                              } finally { setNoteSaving(null) }
                            }}
                            disabled={noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length)}
                            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length) ? "#e5e7eb" : "#4f46e5", color: noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length) ? "#9ca3af" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
                          >
                            {noteSaving === ticket.id ? "..." : "הוסף"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
            })}
          </div>
        )}
        </> }
      </main>

      <FooterCopyright />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
