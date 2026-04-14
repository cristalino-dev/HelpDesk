"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import FooterCopyright from "@/components/FooterCopyright"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"
import { STAFF_MEMBERS } from "@/lib/staffEmails"
import type { TicketWithUser, TicketNote, TicketMessage } from "@/types/ticket"

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
}

function formatDuration(ms: number) {
  if (ms < 0) return "—"
  const mins  = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `${days} ימים, ${hours % 24} שעות`
  if (hours > 0) return `${hours} שעות, ${mins % 60} דקות`
  return `${mins} דקות`
}

function avgMs(nums: number[]) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }
const URGENCY_STYLE: Record<string, React.CSSProperties> = {
  "נמוך":   { background: "#dcfce7", color: "#166534" },
  "בינוני": { background: "#fef3c7", color: "#92400e" },
  "גבוה":   { background: "#ffedd5", color: "#9a3412" },
  "דחוף":   { background: "#fee2e2", color: "#991b1b" },
}
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  "פתוח":   { background: "#dbeafe", color: "#1e40af" },
  "בטיפול": { background: "#fef3c7", color: "#92400e" },
  "סגור":   { background: "#dcfce7", color: "#166534" },
}
const URGENCY_BORDER: Record<string, string> = {
  "נמוך": "#22c55e", "בינוני": "#f59e0b", "גבוה": "#f97316", "דחוף": "#ef4444",
}

export default function TicketsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAll, setShowAll]   = useState(false)
  const [search, setSearch]     = useState("")
  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [updating, setUpdating]   = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm]   = useState<{ subject: string; description: string; phone: string; computerName: string; urgency: string; category: string; platform: string; status: string }>({ subject: "", description: "", phone: "", computerName: "", urgency: "", category: "", platform: "", status: "" })
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

  const handleExpand = async (id: string) => {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next && !expandedNotes[next]) {
      try {
        const res = await fetch(`/api/tickets/${next}`)
        if (res.ok) {
          const data = await res.json()
          setExpandedNotes(prev => ({ ...prev, [next]: data.notes ?? [] }))
          setExpandedMessages(prev => ({ ...prev, [next]: data.messages ?? [] }))
        }
      } catch { /* silent */ }
    }
  }

  const sendReply = async (ticketId: string) => {
    const content = (replyText[ticketId] ?? "").trim()
    if (!content) return
    setReplySaving(ticketId)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const msg: TicketMessage = await res.json()
        setExpandedMessages(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), msg] }))
        setReplyText(prev => ({ ...prev, [ticketId]: "" }))
      }
    } finally {
      setReplySaving(null)
    }
  }

  const addNote = async (ticketId: string) => {
    const content = (noteText[ticketId] ?? "").trim()
    const imgs = noteImages[ticketId] ?? []
    if (!content && imgs.length === 0) return
    setNoteSaving(ticketId)
    try {
      for (const img of imgs) {
        await fetch(`/api/tickets/${ticketId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
        })
      }
      if (content) {
        const res = await fetch(`/api/tickets/${ticketId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        })
        if (res.ok) {
          const note: TicketNote = await res.json()
          setExpandedNotes(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), note] }))
        }
      }
      setNoteText(prev => ({ ...prev, [ticketId]: "" }))
      setNoteImages(prev => ({ ...prev, [ticketId]: [] }))
    } finally {
      setNoteSaving(null)
    }
  }

  const startEdit = (ticket: TicketWithUser) => {
    setEditingId(ticket.id)
    setEditForm({ subject: ticket.subject, description: ticket.description, phone: ticket.phone, computerName: ticket.computerName, urgency: ticket.urgency, category: ticket.category, platform: ticket.platform, status: ticket.status })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setEditSaving(true)
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editForm }),
      })
      setEditingId(null)
      await load()
    } finally {
      setEditSaving(false)
    }
  }
  const [sortKey, setSortKey]   = useState<"subject" | "submitter" | "urgency" | "status" | "createdAt" | "resolveTime" | null>(null)
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc")

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return }
    if (status === "authenticated" && !STAFF_EMAILS.includes(session?.user?.email ?? "")) {
      router.push("/dashboard")
    }
  }, [status, session, router])

  const load = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/tickets/all")
      const data = await res.json()
      setTickets(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated" && STAFF_EMAILS.includes(session?.user?.email ?? "")) load()
  }, [status, session])

  const updateStatus = async (id: string, newStatus: string) => {
    setUpdating(id)
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      })
      await load()
    } finally {
      setUpdating(null)
      setExpanded(null)
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const open       = tickets.filter(t => t.status === "פתוח").length
    const inProgress = tickets.filter(t => t.status === "בטיפול").length
    const closed     = tickets.filter(t => t.status === "סגור")
    const closedMs   = closed.map(t => new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime())
    const today      = new Date().toDateString()
    const openedToday = tickets.filter(t => new Date(t.createdAt).toDateString() === today).length
    const closedToday = closed.filter(t => new Date(t.updatedAt).toDateString() === today).length
    return {
      total: tickets.length,
      open,
      inProgress,
      closedCount: closed.length,
      avgClose:    avgMs(closedMs),
      fastestClose: closedMs.length ? Math.min(...closedMs) : 0,
      slowestClose: closedMs.length ? Math.max(...closedMs) : 0,
      openedToday,
      closedToday,
    }
  }, [tickets])

  // ── Filtered + sorted list ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = showAll ? tickets : tickets.filter(t => t.status !== "סגור")
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q) ||
        t.computerName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.platform.toLowerCase().includes(q) ||
        t.urgency.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        (t.user?.name ?? "").toLowerCase().includes(q) ||
        (t.user?.email ?? "").toLowerCase().includes(q) ||
        new Date(t.createdAt).toLocaleDateString("he-IL").includes(q) ||
        new Date(t.updatedAt).toLocaleDateString("he-IL").includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      switch (sortKey) {
        case "subject":     return dir * a.subject.localeCompare(b.subject, "he")
        case "submitter":   return dir * (a.user?.name ?? a.user?.email ?? "").localeCompare(b.user?.name ?? b.user?.email ?? "", "he")
        case "urgency":     return dir * ((URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2))
        case "status": {
          const ORDER: Record<string, number> = { "פתוח": 0, "בטיפול": 1, "סגור": 2 }
          return dir * ((ORDER[a.status] ?? 0) - (ORDER[b.status] ?? 0))
        }
        case "createdAt":   return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        case "resolveTime": {
          const msA = new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime()
          const msB = new Date(b.updatedAt).getTime() - new Date(b.createdAt).getTime()
          return dir * (msA - msB)
        }
        default:
          // Default: urgency for open-only view, newest-first for all
          if (!showAll) {
            const rd = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
            if (rd !== 0) return rd
          }
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })
  }, [tickets, showAll, search, sortKey, sortDir])

  if (status === "loading") return null

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5" }}>

      {/* ── Header ── */}
      <header style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
        padding: "0 28px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 4px 16px rgba(15,23,42,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>כל הפניות</span>
          <span style={{ background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)" }}>
            Staff
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.jpeg" alt="Cristalino" width={44} height={44} style={{ objectFit: "contain", borderRadius: 6 }} />
          <a href="/dashboard" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>לוח אישי</a>
          {session?.user?.isAdmin && (
            <>
              <a href="/admin" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>ניהול</a>
              <a href="/admin/logs" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>לוג שגיאות</a>
            </>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 10px 4px 6px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{session?.user?.name}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontWeight: 500 }}>יציאה</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Stats grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {[
            { label: "סה״כ פניות",    value: stats.total,                          color: "#6366f1", bg: "#eef2ff" },
            { label: "פתוחות",        value: stats.open,                           color: "#2563eb", bg: "#eff6ff" },
            { label: "בטיפול",        value: stats.inProgress,                     color: "#d97706", bg: "#fffbeb" },
            { label: "סגורות",        value: stats.closedCount,                    color: "#16a34a", bg: "#f0fdf4" },
            { label: "נפתחו היום",    value: stats.openedToday,                    color: "#0891b2", bg: "#ecfeff" },
            { label: "נסגרו היום",    value: stats.closedToday,                    color: "#7c3aed", bg: "#f5f3ff" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.15rem", fontWeight: 800, color: s.color, flexShrink: 0 }}>{s.value}</div>
              <span style={{ fontSize: "0.8rem", color: "#6b7280", fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Resolution stats ── */}
        {stats.closedCount > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[
              { label: "זמן סגירה ממוצע", value: formatDuration(stats.avgClose),     color: "#059669", bg: "#ecfdf5" },
              { label: "סגירה מהירה ביותר", value: formatDuration(stats.fastestClose), color: "#2563eb", bg: "#eff6ff" },
              { label: "סגירה ארוכה ביותר", value: formatDuration(stats.slowestClose), color: "#dc2626", bg: "#fef2f2" },
            ].map(s => (
              <div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: `1px solid ${s.bg}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי נושא, שם, קטגוריה..."
            style={{ flex: 1, minWidth: 220, padding: "9px 14px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.88rem", background: "#fff" }}
          />

          <div style={{ display: "flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {[
              { label: "פתוחות", val: false },
              { label: "הכל",    val: true  },
            ].map(opt => (
              <button
                key={String(opt.val)}
                onClick={() => setShowAll(opt.val)}
                style={{
                  padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem",
                  background: showAll === opt.val ? "#0f172a" : "transparent",
                  color:      showAll === opt.val ? "#fff"    : "#6b7280",
                  transition: "all 0.15s",
                }}
              >{opt.label}</button>
            ))}
          </div>

          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", background: "#ede9fe", color: "#4f46e5", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            רענן
          </button>

          <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{filtered.length} פניות</span>
        </div>

        {/* ── Ticket list ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#6366f1", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען פניות...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", background: "#fff", borderRadius: 16, border: "1px solid #f3f4f6" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#374151" }}>לא נמצאו פניות</p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#9ca3af" }}>נסו לשנות את הסינון או החיפוש</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

            {/* ── Column headers ── */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto auto", alignItems: "center", gap: 12, padding: "6px 16px" }}>
              <div />
              {([
                { key: "subject",     label: "נושא / מגיש" },
                { key: "urgency",     label: "דחיפות" },
                { key: "status",      label: "סטטוס" },
                { key: "createdAt",   label: "נפתח" },
                { key: "resolveTime", label: "זמן טיפול" },
              ] as const).map(col => (
                <button
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 6,
                    fontSize: "0.72rem", fontWeight: 700,
                    color: sortKey === col.key ? "#4f46e5" : "#9ca3af",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                  <span style={{ fontSize: "0.65rem", opacity: sortKey === col.key ? 1 : 0.4 }}>
                    {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </button>
              ))}
              <div />
            </div>

            {filtered.map((ticket, i) => {
              const isClosed    = ticket.status === "סגור"
              const resolveMs   = isClosed ? new Date(ticket.updatedAt).getTime() - new Date(ticket.createdAt).getTime() : null
              const isExpanded  = expanded === ticket.id

              return (
                <div
                  key={ticket.id}
                  onMouseEnter={() => setHoverId(ticket.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    background: "#fff", borderRadius: 12,
                    border: "1px solid #f3f4f6",
                    borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb"}`,
                    boxShadow: hoverId === ticket.id ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)",
                    overflow: "hidden", transition: "box-shadow 0.15s",
                    opacity: isClosed ? 0.75 : 1,
                  }}
                >
                  {/* Main row */}
                  <div
                    onClick={() => handleExpand(ticket.id)}
                    style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto auto", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}
                  >
                    {/* Position */}
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 && !showAll ? "#fef3c7" : "#f3f4f6", color: i === 0 && !showAll ? "#92400e" : "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>

                    {/* Subject + meta */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#111827", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={`/tickets/${ticket.id}`} onClick={e => e.stopPropagation()} style={{ color: "inherit", textDecoration: "none" }}
                          onMouseOver={e => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseOut={e => (e.currentTarget.style.textDecoration = "none")}
                        >{ticket.subject}</a>
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "#9ca3af", marginTop: 2 }}>
                        {ticket.user?.name ?? ticket.user?.email} · {ticket.computerName} · {ticket.category} · {ticket.platform}
                      </div>
                    </div>

                    {/* Urgency */}
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, ...(URGENCY_STYLE[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>

                    {/* Status */}
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, ...(STATUS_STYLE[ticket.status] ?? {}) }}>{ticket.status}</span>

                    {/* Date opened */}
                    <div style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "left", lineHeight: 1.5, whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: "0.68rem", color: "#d1d5db", marginBottom: 1 }}>נפתח</div>
                      {new Date(ticket.createdAt).toLocaleDateString("he-IL")}<br />
                      {new Date(ticket.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </div>

                    {/* Date closed + resolve time (closed only) */}
                    {isClosed ? (
                      <div style={{ fontSize: "0.72rem", color: "#16a34a", textAlign: "left", lineHeight: 1.5, whiteSpace: "nowrap" }}>
                        <div style={{ fontSize: "0.68rem", color: "#d1d5db", marginBottom: 1 }}>נסגר</div>
                        {new Date(ticket.updatedAt).toLocaleDateString("he-IL")}<br />
                        <span style={{ color: "#059669", fontWeight: 600 }}>{formatDuration(resolveMs!)}</span>
                      </div>
                    ) : (
                      <div style={{ width: 80 }} />
                    )}

                    {/* Expand chevron */}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0, transition: "transform 0.2s", transform: isExpanded ? "rotate(-90deg)" : "rotate(0)" }}>
                      <path d="M6 9l6 6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #f3f4f6", padding: "14px 18px", background: "#fafbfc" }}>
                      {editingId === ticket.id ? (
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
                              { label: "דחיפות",   key: "urgency",  opts: ["נמוך", "בינוני", "גבוה", "דחוף"] },
                              { label: "סטטוס",    key: "status",   opts: ["פתוח", "בטיפול", "סגור"] },
                              { label: "קטגוריה",  key: "category", opts: ["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"] },
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
                            <button onClick={e => { e.stopPropagation(); setEditingId(null) }}
                              style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                              ביטול
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── View mode ── */
                        <>
                          <p style={{ margin: "0 0 14px", fontSize: "0.875rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                            <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>📞 {ticket.phone}</span>
                            <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>💬 {ticket.user?.email}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                            <span style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600 }}>שנה סטטוס:</span>
                            {["פתוח", "בטיפול", "סגור"].map(s => (
                              <button key={s} disabled={updating === ticket.id || ticket.status === s}
                                onClick={e => { e.stopPropagation(); updateStatus(ticket.id, s) }}
                                style={{ padding: "5px 14px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: ticket.status === s || updating === ticket.id ? "default" : "pointer", opacity: updating === ticket.id ? 0.5 : 1, ...(ticket.status === s ? STATUS_STYLE[s] : { background: "#f3f4f6", color: "#374151" }) }}>
                                {s}
                              </button>
                            ))}
                            <button onClick={e => { e.stopPropagation(); startEdit(ticket) }}
                              style={{ padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: "#ede9fe", color: "#4f46e5" }}>
                              ✏️ עריכה
                            </button>
                            <a href={`/tickets/${ticket.id}`} onClick={e => e.stopPropagation()}
                              style={{ marginRight: "auto", padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: "#f0fdf4", color: "#15803d", textDecoration: "none" }}>
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
                                onClick={e => { e.stopPropagation(); sendReply(ticket.id) }}
                                disabled={replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim()}
                                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? "#e5e7eb" : "#2563eb", color: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? "#9ca3af" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
                              >
                                {replySaving === ticket.id ? "..." : "שלח"}
                              </button>
                            </div>
                          </div>

                          {/* ── Notes section ── */}
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
                              onClick={e => { e.stopPropagation(); addNote(ticket.id) }}
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
      </main>

      <FooterCopyright />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
