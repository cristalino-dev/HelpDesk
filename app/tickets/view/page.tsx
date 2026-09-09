"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import AppHeader from "@/components/AppHeader"
import AppNav from "@/components/AppNav"
import { T } from "@/lib/theme"
import FooterCopyright from "@/components/FooterCopyright"
import { STAFF_EMAILS, VIEWER_EMAILS } from "@/lib/staffEmails"
import type { TicketWithUser } from "@/types/ticket"
import { useIsMobile } from "@/lib/useIsMobile"
import { matchesTicketNumber, withNumberSuggestion } from "@/lib/ticketSearch"
import { workdaysBetween, formatWorkdays } from "@/lib/workdays"

const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }
const URGENCY_STYLE: Record<string, React.CSSProperties> = {
  "נמוך":   { background: T.greenSBg, color: T.greenSFgDeep },
  "בינוני": { background: T.amberBg, color: T.amberFgDeep },
  "גבוה":   { background: T.orangeBg, color: T.orangeFgDeep },
  "דחוף":   { background: T.redBg, color: T.redFgDeep },
}
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  "פתוח":   { background: T.pillBlueBg, color: T.pillBlueFg },
  "בטיפול": { background: T.amberBg, color: T.amberFgDeep },
  "סגור":   { background: T.greenSBg, color: T.greenSFgDeep },
}
const URGENCY_BORDER: Record<string, string> = {
  "נמוך": T.greenSFg, "בינוני": T.amberFg, "גבוה": T.orangeFg, "דחוף": T.redFg,
}

export default function TicketsViewPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()

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

  const { filtered, numberSuggestion } = useMemo(() => {
    let list = showAll ? tickets : tickets.filter(t => t.status !== "סגור")
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t =>
        matchesTicketNumber(t.ticketNumber, q) ||
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
    const sorted = [...list].sort((a, b) => {
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
    // An exact HDTC-N query always surfaces its ticket — open or closed, and
    // regardless of the open/all toggle.
    const pinned = withNumberSuggestion(sorted, tickets, search)
    return { filtered: pinned.list, numberSuggestion: pinned.suggestion }
  }, [tickets, showAll, search, sortKey, sortDir])

  if (status === "loading") return null

  const isViewer = VIEWER_EMAILS.includes(session?.user?.email ?? "")

  return (
    <div style={{ minHeight: "100vh", background: T.bg, position: "relative" }}>
      <AppHeader wordmark="כל הפניות" subtitle={false}><AppNav /></AppHeader>

      {/* Mobile dropdown menu */}

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Info banner for viewers */}
        {isViewer && (
          <div style={{ background: T.greenBg, border: `1px solid ${T.blueBorder}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, fontSize: "0.83rem", color: T.pillBlueFg }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke={T.text} strokeWidth="1.8"/>
              <path d="M12 8v4M12 16h.01" stroke={T.text} strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>אתה במצב צפייה בלבד — לא ניתן לשנות פניות</span>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי מספר פנייה (HDTC-123), נושא, שם, קטגוריה..."
            style={{ flex: 1, minWidth: 220, padding: "9px 14px", borderRadius: 10, border: `1px solid ${T.line}`, fontSize: "0.88rem", background: T.card }}
          />
          <div style={{ display: "flex", background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
            {[{ label: "פתוחות", val: false }, { label: "הכל", val: true }].map(opt => (
              <button key={String(opt.val)} onClick={() => setShowAll(opt.val)}
                style={{ padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem", background: showAll === opt.val ? T.inverseBg : "transparent", color: showAll === opt.val ? T.inverseText : T.inkMuted, transition: "all 0.15s" }}
              >{opt.label}</button>
            ))}
          </div>
          <span style={{ fontSize: "0.78rem", color: T.inkFaint }}>{filtered.length} פניות</span>
        </div>

        {/* Ticket-number suggestion — an exact HDTC-N hit, open or closed */}
        {numberSuggestion && (
          <a
            href={`/tickets/HDTC-${numberSuggestion.ticketNumber}`}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.card, border: `1px solid ${T.border}`, borderRight: `4px solid ${T.text}`, borderRadius: 12, textDecoration: "none", boxShadow: `0 1px 3px ${T.shadow1}`, flexWrap: "wrap" }}
          >
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.greenBg, borderRadius: 6, padding: "1px 7px", flexShrink: 0 }}>
              HDTC-{numberSuggestion.ticketNumber}
            </span>
            <span style={{ fontWeight: 600, color: T.text, fontSize: "0.86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
              {numberSuggestion.subject}
            </span>
            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, ...(STATUS_STYLE[numberSuggestion.status] ?? {}) }}>{numberSuggestion.status}</span>
            <span style={{ fontSize: "0.72rem", color: T.text3, flexShrink: 0 }}>פנייה מספר {numberSuggestion.ticketNumber} — פתחו ←</span>
          </a>
        )}

        {/* Ticket list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${T.line}`, borderTopColor: T.purpleFg, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען פניות...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 24px", background: T.card, borderRadius: 16, border: `1px solid ${T.line}` }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: T.ink }}>לא נמצאו פניות</p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: T.inkFaint }}>נסו לשנות את הסינון או החיפוש</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Column headers — desktop only */}
            {!isMobile && (
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
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 700, color: sortKey === col.key ? T.text : T.inkFaint, whiteSpace: "nowrap" }}
                  >
                    {col.label}
                    <span style={{ fontSize: "0.65rem", opacity: sortKey === col.key ? 1 : 0.4 }}>
                      {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </button>
                ))}
                <div />
              </div>
            )}

            {filtered.map((ticket, i) => {
              const isClosed   = ticket.status === "סגור"
              const isExpanded = expanded === ticket.id
              const wdOpen = isClosed
                ? workdaysBetween(ticket.createdAt, ticket.updatedAt)
                : workdaysBetween(ticket.createdAt)
              return (
                <div key={ticket.id}
                  onMouseEnter={() => setHoverId(ticket.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.line}`, borderRight: `4px solid ${URGENCY_BORDER[ticket.urgency] ?? "${T.line}"}`, boxShadow: hoverId === ticket.id ? `0 4px 16px ${T.shadow2}` : `0 1px 3px ${T.shadow1}`, overflow: "hidden", transition: "box-shadow 0.15s", opacity: isClosed ? 0.75 : 1 }}
                >
                  {/* Main row */}
                  {isMobile ? (
                    <div onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                      style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: T.text, background: T.greenBg, borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>HDTC-{ticket.ticketNumber}</span>
                          <span style={{ fontWeight: 600, color: T.text, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0, transition: "transform 0.2s", transform: isExpanded ? "rotate(-90deg)" : "rotate(0)" }}>
                          <path d="M6 9l6 6 6-6" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, ...(URGENCY_STYLE[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, ...(STATUS_STYLE[ticket.status] ?? {}) }}>{ticket.status}</span>
                        <span style={{ fontSize: "0.68rem", color: T.inkFaint }}>{new Date(ticket.createdAt).toLocaleDateString("he-IL")}</span>
                      </div>
                    </div>
                  ) : (
                  <div onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)}
                    style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer" }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 && !showAll ? T.amberBg : T.fill, color: i === 0 && !showAll ? T.amberFgDeep : T.inkFaint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.greenBg, borderRadius: 6, padding: "1px 7px", letterSpacing: "0.03em", flexShrink: 0 }}>HDTC-{ticket.ticketNumber}</span>
                        <span style={{ fontWeight: 600, color: T.text, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                      </div>
                      <div style={{ fontSize: "0.73rem", color: T.inkFaint, marginTop: 2 }}>
                        {ticket.user?.name ?? ticket.user?.email} · {ticket.computerName} · {ticket.category} · {ticket.platform}
                      </div>
                    </div>

                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, ...(URGENCY_STYLE[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, ...(STATUS_STYLE[ticket.status] ?? {}) }}>{ticket.status}</span>

                    <div style={{ fontSize: "0.72rem", color: T.inkFaint, textAlign: "left", lineHeight: 1.5, whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: "0.68rem", color: T.inkFainter, marginBottom: 1 }}>{isClosed ? "נסגר" : "נפתח"}</div>
                      {new Date(ticket.createdAt).toLocaleDateString("he-IL")}<br />
                      <span style={{ color: isClosed ? T.greenSFg : T.inkMuted, fontWeight: 600 }}>
                        {isClosed ? `נסגר לאחר ${formatWorkdays(wdOpen)}` : formatWorkdays(wdOpen)}
                      </span>
                    </div>

                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, flexShrink: 0, transition: "transform 0.2s", transform: isExpanded ? "rotate(-90deg)" : "rotate(0)" }}>
                      <path d="M6 9l6 6 6-6" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  )}

                  {/* Expanded — read-only details */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${T.line}`, padding: "16px 18px", background: T.fill2 }}>
                      <p style={{ margin: "0 0 12px", fontSize: "0.875rem", color: T.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                        <span style={{ fontSize: "0.75rem", color: T.inkMuted, fontWeight: 600 }}>📞 {ticket.phone}</span>
                        <span style={{ fontSize: "0.75rem", color: T.inkMuted, fontWeight: 600 }}>💬 {ticket.user?.email}</span>
                        <span style={{ fontSize: "0.75rem", color: T.inkMuted, fontWeight: 600 }}>🖥️ {ticket.computerName}</span>
                        <span style={{ fontSize: "0.75rem", color: T.inkMuted, fontWeight: 600 }}>📂 {ticket.category} · {ticket.platform}</span>
                      </div>
                      <a href={`/tickets/HDTC-${ticket.ticketNumber}`}
                        style={{ display: "inline-block", padding: "6px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, background: T.greenSBg, color: T.greenSFgDeep, textDecoration: "none" }}
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
