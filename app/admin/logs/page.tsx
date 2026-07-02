/**
 * app/admin/logs/page.tsx — Admin Error Log Dashboard
 * 
 * PURPOSE:
 * ─────────
 * A centralized monitoring interface for technical staff and admins to 
 * track system stability, troubleshoot client-side and server-side errors, 
 * and perform log maintenance.
 * 
 * FEATURES:
 * ──────────
 * 1. Live Stats: Real-time calculation of total events, errors, and warnings.
 * 2. Search & Filtering: Instant text-based filtering across messages, levels, and sources.
 * 3. Copy Tools: One-click clipboard support for error messages and stack traces.
 * 4. Maintenance: Ability for admins to clear the entire log database.
 * 5. Security: Role-based access (Staff see logs, Admins can also delete them).
 */

"use client"

import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import FooterCopyright from "@/components/FooterCopyright"
import AppHeader from "@/components/AppHeader"
import { T, HDR } from "@/lib/theme"
import { useIsMobile } from "@/lib/useIsMobile"

interface LogEntry {
  id: string
  timestamp: string
  level: string
  message: string
  source: string | null
  stack: string | null
  date: string
}

export default function AdminLogsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [copyAllStatus, setCopyAllStatus] = useState(false)

  const isAdmin = session?.user?.isAdmin
  const isStaff = session?.user?.email && STAFF_EMAILS.includes(session.user.email)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }
    if (status === "authenticated" && !isStaff && !isAdmin) {
      router.push("/dashboard")
    }
  }, [status, session, router, isStaff, isAdmin])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/logs")
      if (res.ok) {
        const data = await res.json()
        setLogs(data)
      }
    } catch (err) {
      console.error("Fetch logs failed:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated" && (isStaff || isAdmin)) {
      fetchLogs()
    }
  }, [status, isStaff, isAdmin])

  const clearLogs = async () => {
    if (!isAdmin) return
    if (!confirm("האם אתה בטוח שברצונך למחוק את כל הלוגים? פעולה זו אינה הפיכה.")) return

    try {
      const res = await fetch("/api/admin/logs", { method: "DELETE" })
      if (res.ok) {
        setLogs([])
      }
    } catch (err) {
      console.error("Clear logs failed:", err)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopyStatus(id)
    setTimeout(() => setCopyStatus(null), 2000)
  }

  const formatLogsAsText = (entries: LogEntry[]) =>
    entries.map(e => {
      const time = new Date(e.timestamp).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "medium" })
      const src = e.source ? ` [${e.source}]` : ""
      const stack = e.stack ? `\n${e.stack}` : ""
      return `[${time}] [${e.level.toUpperCase()}]${src}\n${e.message}${stack}`
    }).join("\n\n---\n\n")

  const copyAllLogs = async () => {
    await navigator.clipboard.writeText(formatLogsAsText(filteredLogs))
    setCopyAllStatus(true)
    setTimeout(() => setCopyAllStatus(false), 2000)
  }

  const downloadAllLogs = () => {
    const text = formatLogsAsText(filteredLogs)
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `error-logs-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(search.toLowerCase()) ||
    (log.source ?? "").toLowerCase().includes(search.toLowerCase()) ||
    log.level.toLowerCase().includes(search.toLowerCase())
  )

  // Statistics
  const totalErrors = logs.filter(l => l.level.toLowerCase() === "error").length
  const totalWarnings = logs.filter(l => l.level.toLowerCase().includes("warn")).length
  const topSource = logs.reduce((acc, curr) => {
    const src = curr.source || "Unknown"
    acc[src] = (acc[src] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const mostFrequentSource = Object.entries(topSource).sort((a,b) => b[1] - a[1])[0]?.[0] || "—"

  const getLevelStyle = (level: string) => {
    switch (level.toLowerCase()) {
      case "error": return { bg: "#FBEAEA", color: "#B4453F", label: "ERROR" }
      case "warn":
      case "warning": return { bg: "#FBF1DE", color: "#A9741A", label: "WARN" }
      default: return { bg: "#E9F4E2", color: "#3E7A24", label: "INFO" }
    }
  }

  const initials = (name?: string | null) => {
    if (!name) return ".."
    const parts = name.split(" ")
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  if (status === "loading" || !session) return null

  return (
    <div style={{ minHeight: "100vh", background: T.bg, direction: "rtl" }}>
      <AppHeader wordmark="לוג שגיאות" subtitle={false}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 2 : 4 }}>
          {!isMobile && <a href="/admin" style={{ fontSize: "0.82rem", color: HDR.link, textDecoration: "none", padding: "8px 13px", borderRadius: 9, fontWeight: 500 }}>ניהול</a>}
          {!isMobile && <a href="/tickets" style={{ fontSize: "0.82rem", color: HDR.link, textDecoration: "none", padding: "8px 13px", borderRadius: 9, fontWeight: 500 }}>פניות</a>}
          <span style={{ background: HDR.greenPillBg, color: HDR.greenPillFg, fontSize: "0.68rem", fontWeight: 700, padding: "4px 11px", borderRadius: 999, letterSpacing: ".04em", margin: "0 4px" }}>
            {isAdmin ? "ADMIN" : "STAFF"}
          </span>
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "4px" : "5px 7px 5px 12px", borderRadius: 999, background: HDR.pillBg, textDecoration: "none", cursor: "pointer" }}>
            {!isMobile && <span style={{ fontSize: "0.81rem", color: HDR.linkStrong, fontWeight: 500 }}>{session?.user?.name}</span>}
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.darkSoft, border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, color: T.green }}>
              {initials(session?.user?.name)}
            </div>
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.82rem", color: HDR.muted, background: "none", border: "none", cursor: "pointer", padding: isMobile ? "6px 8px" : "8px 12px", fontWeight: 500 }}>{isMobile ? "↩" : "יציאה"}</button>
        </div>
      </AppHeader>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "16px 12px" : "32px 24px" }}>

        {/* ── Stats Dashboard — 2×2 on mobile so cards never overflow ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, 1fr)", gap: isMobile ? 8 : 12, marginBottom: isMobile ? 16 : 28 }}>
          {[
            { label: "סה״כ אירועים",     value: logs.length,        color: T.text },
            { label: "שגיאות",           value: totalErrors,        color: "#B4453F" },
            { label: "אזהרות",           value: totalWarnings,      color: "#A9741A" },
            { label: "מקור שגיאה ראשי", value: mostFrequentSource, color: T.text2, isFull: true },
          ].map((stat, i) => (
            <div key={i} style={{ background: T.card, borderRadius: 14, padding: isMobile ? "12px 14px" : "16px 20px", border: `1px solid ${T.border}`, minWidth: 0 }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text3, marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: stat.isFull ? "0.9rem" : isMobile ? "1.4rem" : "1.7rem", fontWeight: 800, color: stat.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: stat.isFull ? "ltr" : "rtl", textAlign: "right" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Search & Actions — wraps on mobile so buttons never overflow ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, flexWrap: "wrap", minWidth: 0 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 500, minWidth: isMobile ? "100%" : 220 }}>
              <input
                type="text"
                placeholder="חיפוש בהודעה, במקור או ברמה..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: "10px 14px 10px 36px", borderRadius: 10, border: `1px solid ${T.borderStrong}`, width: "100%", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", background: T.card }}
              />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }}>
                <circle cx="11" cy="11" r="8" stroke={T.text2} strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke={T.text2} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <button onClick={fetchLogs} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${T.borderStrong}`, background: T.card, cursor: "pointer", fontSize: "0.83rem", fontWeight: 600, color: T.text2 }}>
              רענן
            </button>
            {filteredLogs.length > 0 && (
              <>
                <button onClick={copyAllLogs} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${copyAllStatus ? T.green : T.borderStrong}`, background: copyAllStatus ? T.greenBg : T.card, cursor: "pointer", fontSize: "0.83rem", fontWeight: 600, color: copyAllStatus ? T.greenInk : T.text2 }}>
                  {copyAllStatus ? "✓ הועתק" : "העתק הכל"}
                </button>
                <button onClick={downloadAllLogs} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${T.borderStrong}`, background: T.card, cursor: "pointer", fontSize: "0.83rem", fontWeight: 600, color: T.text2 }}>
                  הורדה
                </button>
              </>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={clearLogs}
              style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #EBC5C3", background: "#FBEAEA", color: "#B4453F", fontWeight: 700, cursor: "pointer", fontSize: "0.83rem" }}
            >
              נקה יומן אירועים
            </button>
          )}
        </div>

        {/* ── Entries Table — horizontal scroll wrapper prevents mobile overflow ── */}
        <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <table style={{ width: "100%", minWidth: isMobile ? 640 : undefined, borderCollapse: "collapse", textAlign: "right" }}>
            <thead style={{ background: T.cardMuted, borderBottom: `1px solid ${T.border}` }}>
              <tr>
                <th style={{ padding: "14px 20px", fontSize: "0.75rem", color: T.text3, fontWeight: 700 }}>זמן אירוע</th>
                <th style={{ padding: "14px 20px", fontSize: "0.75rem", color: T.text3, fontWeight: 700 }}>רמה</th>
                <th style={{ padding: "14px 20px", fontSize: "0.75rem", color: T.text3, fontWeight: 700 }}>מקור / נתיב</th>
                <th style={{ padding: "14px 20px", fontSize: "0.75rem", color: T.text3, fontWeight: 700 }}>תיאור השגיאה ופרטים טכניים</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 60, textAlign: "center", color: T.muted }}>
                  <div style={{ width: 30, height: 30, border: `3px solid ${T.border}`, borderTopColor: T.green, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }}></div>
                  טוען נתונים מהשרת...
                </td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 60, textAlign: "center", color: T.muted }}>
                  {logs.length === 0 ? "היומן ריק — אין שגיאות פעילות 🎉" : "לא נמצאו לוגים התואמים את החיפוש"}
                </td></tr>
              ) : filteredLogs.map(log => {
                const style = getLevelStyle(log.level)
                return (
                  <tr key={log.id} style={{ borderBottom: `1px solid ${T.border}`, transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = T.cardMuted} onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                    <td style={{ padding: "14px 20px", fontSize: "0.82rem", color: T.text2, whiteSpace: "nowrap", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600 }}>{new Date(log.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                      <div style={{ fontSize: "0.72rem", color: T.muted, marginTop: 2 }}>{new Date(log.timestamp).toLocaleDateString("he-IL")}</div>
                    </td>
                    <td style={{ padding: "14px 20px", verticalAlign: "top" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: "0.68rem", fontWeight: 700, backgroundColor: style.bg, color: style.color, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
                        {style.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: "0.8rem", color: T.text2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", direction: "ltr", textAlign: "left", verticalAlign: "top" }}>
                      <code style={{ background: T.codeBg, padding: "2px 7px", borderRadius: 6, fontSize: "0.74rem", color: T.text }}>{log.source || "global"}</code>
                    </td>
                    <td style={{ padding: "14px 20px", position: "relative" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: T.text, fontSize: "0.88rem", lineHeight: 1.5, marginBottom: log.stack ? 8 : 0 }}>{log.message}</div>
                          {log.stack && (
                            <div style={{ position: "relative" }}>
                              <pre style={{ margin: 0, fontSize: "0.72rem", color: T.text2, whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", background: T.cardMuted, padding: "12px", borderRadius: 8, border: `1px solid ${T.border}`, fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace", direction: "ltr", textAlign: "left" }}>
                                {log.stack}
                              </pre>
                              <button
                                onClick={() => copyToClipboard(log.stack || "", log.id + "-stack")}
                                style={{ position: "absolute", top: 8, right: 8, background: T.card, border: `1px solid ${T.borderStrong}`, padding: "4px 8px", borderRadius: 6, fontSize: "0.65rem", fontWeight: 700, cursor: "pointer", color: copyStatus === log.id + "-stack" ? T.greenInk : T.text2 }}
                              >
                                {copyStatus === log.id + "-stack" ? "✓ הועתק" : "העתק Stack"}
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => copyToClipboard(log.message, log.id)}
                          title="העתק הודעת שגיאה"
                          style={{ flexShrink: 0, background: T.cardMuted, border: `1px solid ${T.border}`, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: "0.72rem", fontWeight: 700, color: copyStatus === log.id ? T.greenInk : T.text2 }}
                        >
                          {copyStatus === log.id ? "✓" : "העתק"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>

      <FooterCopyright />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
