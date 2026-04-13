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
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import type { TicketWithUser } from "@/types/ticket"
import FooterCopyright from "@/components/FooterCopyright"

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

interface UserRow { id: string; name: string | null; email: string; phone: string | null; station: string | null; isAdmin: boolean }

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<"tickets" | "users" | "logs">("tickets")
  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
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
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>מערכת helpdesk</span>
          <span style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.25)" }}>ניהול</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={44} height={44} loading="eager" style={{ objectFit: "contain", borderRadius: "6px" }} />
          <a href="/contact" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>צרו קשר</a>
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

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e5e7eb", paddingBottom: "0" }}>
          {([["tickets", "תור פניות"], ["users", "ניהול משתמשים"], ["logs", "יומן שגיאות"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => {
              setTab(key)
              if (key === "users" && users.length === 0) loadUsers()
              if (key === "logs") loadLogs(logDate)
            }}
              style={{ padding: "10px 20px", fontWeight: 600, fontSize: "0.88rem", border: "none", background: "none", cursor: "pointer", color: tab === key ? "#4f46e5" : "#6b7280", borderBottom: tab === key ? "2px solid #4f46e5" : "2px solid transparent", marginBottom: "-2px", borderRadius: 0 }}>
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
                    { label: "שם מלא", key: "name" as const, placeholder: "ישראל ישראלי" },
                    { label: "טלפון", key: "phone" as const, placeholder: "050-0000000" },
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
                      {ticket.user?.name ?? ticket.user?.email} · {ticket.phone} · {ticket.computerName} · {ticket.category} · {ticket.platform}
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
        </> }
      </main>

      <FooterCopyright />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
