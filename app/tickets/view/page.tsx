"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import FooterCopyright from "@/components/FooterCopyright"
import { STAFF_EMAILS, VIEWER_EMAILS } from "@/lib/staffEmails"
import type { TicketWithUser } from "@/types/ticket"

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
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

export default function TicketsViewPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<"subject" | "urgency" | "status" | "createdAt" | "updatedAt" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const isAllowed = (email: string) =>
    STAFF_EMAILS.includes(email) || VIEWER_EMAILS.includes(email)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return }
    if (status === "authenticated" && !isAllowed(session?.user?.email ?? "")) {
      router.push("/dashboard")
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === "authenticated" && isAllowed(session?.user?.email ?? "")) {
      setLoading(true)
      fetch("/api/tickets/all")
        .then(r => r.json())
        .then(d => setTickets(Array.isArray(d) ? d : []))
        .catch(() => setTickets([]))
        .finally(() => setLoading(false))
    }
  }, [status, session])

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const filtered = useMemo(() => {
    let list = showAll ? tickets : tickets.filter(t => t.status !== "סגור")
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.user?.name ?? "").toLowerCase().includes(q) ||
        (t.user?.email ?? "").toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.urgency.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        new Date(t.createdAt).toLocaleDateString("he-IL").includes(q)
      )
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      switch (sortKey) {
        case "subject":   return dir * a.subject.localeCompare(b.subject, "he")
        case "urgency":   return dir * ((URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2))
        case "status": {
          const O: Record<string, number> = { "פתוח": 0, "בטיפול": 1, "סגור": 2 }
          return dir * ((O[a.status] ?? 0) - (O[b.status] ?? 0))
        }
        case "createdAt": return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        case "updatedAt": return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
        default: {
          const rd = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
          if (rd !== 0) return rd
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
      }
    })
  }, [tickets, showAll, search, sortKey, sortDir])

  if (status === "loading") return null

  const isViewer = VIEWER_EMAILS.includes(session?.user?.email ?? "")

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5" }}>
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
          <span style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", fontWeight: 700, padding: "2px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)" }}>
            צפייה בלבד
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.jpeg" alt="Cristalino" width={44} height={44} style={{ objectFit: "contain", borderRadius: 6 }} />
          <a href="/dashboard" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>לוח אישי</a>
          {!isViewer && (
            <a href="/tickets" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>ניהול פניות</a>
          )}
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 10px 4px 6px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", textDecoration: "none" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{session?.user?.name}</span>
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontWeight: 500 }}>יציאה</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Info banner for viewers */}
        {isViewer && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: "0.83rem", color: "#1e40af" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke="#2563eb" strokeWidth="1.8"/>
              <path d="M12 8v4M12 16h.01" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>אתה במצב צפייה בלבד — לא ניתן לשנות פניות</span>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי נושא, שם, קטגוריה..."
            style={{ flex: 1, minWidth: 220, padding: "9px 14px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.88rem", background: "#fff" }}
          />
          <div style={{ display: "flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {[{ label: "פתוחות", val: false }, { label: "הכל", val: true }].map(opt => (
              <button key={String(opt.val)} onClick={() => setShowAll(opt.val)}
                style={{ padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", background: showAll === opt.val ? "#0f172a" : "transparent", color: showAll === opt.val ? "#fff" : "#6b7280", transition: "all 0.15s" }}
              >{opt.label}</button>
            ))}
          </div>
          <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{filtered.length} פניות</span>
        </div>

        {/* Ticket list */}
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
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto", alignItems: "center", gap: 12, padding: "6px 16px" }}>
              <div />
              {([
                { key: "subject",   label: "נושא / מגיש" },
                { key: "urgency",   label: "דחיפות" },
                { key: "status",    label: "סטטוס" },
                { key: "createdAt", label: "נפתח" },
                { key: "updatedAt", label: "עודכן" },
              ] as const).map(col => (
                <button key={col.key} onClick={() => handleSort(col.key)}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, color: sortKey === col.key ? "#4f46e5" : "#9ca3af", whiteSpace: "nowrap" }}
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
              const isClosed   = ticket.status === "סגור"
              const isExpanded = expanded === ticket.id
              return (
                <div key={ticket.id}
                  onMouseEnter={() => setHoverId(ticket.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{ background: "#fff", borderRadius: 12, border: "1px solid #f3f4f6", borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb"}`, boxShadow: hoverId === ticket.id ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden", transition: "box-shadow 0.15s", opacity: isClosed ? 0.75 : 1 }}
                >
                  {/* Main row */}
                  <div onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                    style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 && !showAll ? "#fef3c7" : "#f3f4f6", color: i === 0 && !showAll ? "#92400e" : "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 7px", letterSpacing: "0.03em", flexShrink: 0 }}>HDTC-{ticket.ticketNumber}</span>
                        <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                      </div>
                      <div style={{ fontSize: "0.73rem", color: "#9ca3af", marginTop: 2 }}>
                        {ticket.user?.name ?? ticket.user?.email} · {ticket.computerName} · {ticket.category} · {ticket.platform}
                      </div>
                    </div>

                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, ...(URGENCY_STYLE[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, ...(STATUS_STYLE[ticket.status] ?? {}) }}>{ticket.status}</span>

                    <div style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "left", lineHeight: 1.5, whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: "0.68rem", color: "#d1d5db", marginBottom: 1 }}>נפתח</div>
                      {new Date(ticket.createdAt).toLocaleDateString("he-IL")}<br />
                      {new Date(ticket.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </div>

                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0, transition: "transform 0.2s", transform: isExpanded ? "rotate(-90deg)" : "rotate(0)" }}>
                      <path d="M6 9l6 6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>

                  {/* Expanded — read-only details */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #f3f4f6", padding: "16px 18px", background: "#fafbfc" }}>
                      <p style={{ margin: "0 0 12px", fontSize: "0.875rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>📞 {ticket.phone}</span>
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>💬 {ticket.user?.email}</span>
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>🖥️ {ticket.computerName}</span>
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>📂 {ticket.category} · {ticket.platform}</span>
                      </div>
                      <a href={`/tickets/HDTC-${ticket.ticketNumber}`}
                        style={{ display: "inline-block", padding: "6px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, background: "#f0fdf4", color: "#15803d", textDecoration: "none" }}
                      >
                        🔍 פתח פנייה מלאה
                      </a>
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
