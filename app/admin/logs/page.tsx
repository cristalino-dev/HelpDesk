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
import Image from "next/image"
import Link from "next/link"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import FooterCopyright from "@/components/FooterCopyright"

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
      case "error": return { bg: "#fee2e2", color: "#b91c1c", label: "ERROR" }
      case "warn":
      case "warning": return { bg: "#fef3c7", color: "#b45309", label: "WARN" }
      default: return { bg: "#dcfce7", color: "#15803d", label: "INFO" }
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
    <div style={{ minHeight: "100vh", background: "#f8fafc", direction: "rtl", fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      {/* ── Header ── */}
      <header style={{
        background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
        padding: "0 28px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        position: "sticky", top: 0, zIndex: 100
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#fff", letterSpacing: "-0.01em" }}>לוח מעקב שגיאות</span>
          <span style={{ background: "rgba(56,189,248,0.2)", color: "#7dd3fc", fontSize: "0.7rem", fontWeight: 700, padding: "2px 12px", borderRadius: 20, border: "1px solid rgba(56,189,248,0.3)", boxShadow: "0 0 10px rgba(56,189,248,0.15)" }}>
            {isAdmin ? "Admin" : "v2.8-ADMIN"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Image src="/logo.jpeg" alt="Cristalino" width={40} height={40} style={{ objectFit: "contain", borderRadius: 8 }} />
          <nav style={{ display: "flex", gap: 8 }}>
            {[["ניהול", "/admin"], ["פניות", "/tickets"]].map(([label, href]) => (
              <a key={href} href={href} style={{ fontSize: "0.82rem", color: "#f8fafc", textDecoration: "none", padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.08)", fontWeight: 600, transition: "background 0.2s" }}>{label}</a>
            ))}
          </nav>
          
          <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 10, background: "rgba(255,255,255,0.1)", textDecoration: "none", cursor: "pointer", transition: "background 0.2s" }}
            onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
            onMouseOut={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
          >
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.82rem", color: "#f8fafc", fontWeight: 500 }}>{session?.user?.name}</span>
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.82rem", color: "#cbd5e1", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>יציאה</button>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
        
        {/* ── Stats Dashboard ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 32 }}>
          {[
            { label: "סה״כ אירועים", value: logs.length, color: "#334155", icon: "📊" },
            { label: "שגיאות קריטיות", value: totalErrors, color: "#ef4444", icon: "⚠️" },
            { label: "אזהרות", value: totalWarnings, color: "#f59e0b", icon: "🔔" },
            { label: "מקור שגיאה ראשי", value: mostFrequentSource, color: "#38bdf8", icon: "🏗️", isFull: true },
          ].map((stat, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: "1.2rem" }}>{stat.icon}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#64748b" }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: stat.isFull ? "0.95rem" : "1.75rem", fontWeight: 800, color: stat.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Search & Actions ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 500 }}>
              <input 
                type="text" 
                placeholder="חפש בהודעת השגיאה, במקור או ברמה..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: "12px 16px 12px 40px", borderRadius: 12, border: "1px solid #e2e8f0", width: "100%", fontSize: "0.9rem", outline: "none", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)" }}
              />
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>🔍</span>
            </div>
            <button onClick={fetchLogs} style={{ padding: "10px 18px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
              🔄 רענן נתונים
            </button>
            {filteredLogs.length > 0 && (
              <>
                <button onClick={copyAllLogs} style={{ padding: "10px 18px", borderRadius: 12, border: "1px solid #e2e8f0", background: copyAllStatus ? "#dcfce7" : "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: copyAllStatus ? "#166534" : "#475569", display: "flex", alignItems: "center", gap: 8 }}>
                  {copyAllStatus ? "✓ הועתק" : "📋 העתק הכל"}
                </button>
                <button onClick={downloadAllLogs} style={{ padding: "10px 18px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
                  ⬇️ הורד
                </button>
              </>
            )}
          </div>
          {isAdmin && (
            <button 
              onClick={clearLogs}
              style={{ padding: "11px 22px", borderRadius: 12, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", boxShadow: "0 4px 12px rgba(239,68,68,0.2)" }}
            >
              🗑️ נקה יומן אירועים
            </button>
          )}
        </div>

        {/* ── Entries Table ── */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
            <thead style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <tr>
                <th style={{ padding: "16px 24px", fontSize: "0.78rem", color: "#64748b", fontWeight: 800 }}>זמן אירוע</th>
                <th style={{ padding: "16px 24px", fontSize: "0.78rem", color: "#64748b", fontWeight: 800 }}>רמה</th>
                <th style={{ padding: "16px 24px", fontSize: "0.78rem", color: "#64748b", fontWeight: 800 }}>מקור / נתיב</th>
                <th style={{ padding: "16px 24px", fontSize: "0.78rem", color: "#64748b", fontWeight: 800 }}>תיאור השגיאה ופרטים טכניים</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ width: 30, height: 30, border: "3px solid #f1f5f9", borderTopColor: "#38bdf8", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }}></div>
                  טוען נתונים מהשרת...
                </td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>לא נמצאו לוגים התואמים את החיפוש</td></tr>
              ) : filteredLogs.map(log => {
                const style = getLevelStyle(log.level)
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.backgroundColor = "#fafafa"} onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                    <td style={{ padding: "14px 24px", fontSize: "0.82rem", color: "#475569", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600 }}>{new Date(log.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 }}>{new Date(log.timestamp).toLocaleDateString("he-IL")}</div>
                    </td>
                    <td style={{ padding: "14px 24px" }}>
                      <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: "0.68rem", fontWeight: 800, backgroundColor: style.bg, color: style.color, letterSpacing: "0.02em" }}>
                        {style.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 24px", fontSize: "0.82rem", color: "#64748b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", direction: "ltr", textAlign: "left" }}>
                      <code>{log.source || "global"}</code>
                    </td>
                    <td style={{ padding: "14px 24px", position: "relative" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.88rem", lineHeight: 1.5, marginBottom: 8 }}>{log.message}</div>
                          {log.stack && (
                            <div style={{ position: "relative" }}>
                              <pre style={{ margin: 0, fontSize: "0.72rem", color: "#475569", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", background: "#f8fafc", padding: "12px", borderRadius: 8, border: "1px solid #e2e8f0", fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace", direction: "ltr", textAlign: "left" }}>
                                {log.stack}
                              </pre>
                              <button 
                                onClick={() => copyToClipboard(log.stack || "", log.id + "-stack")}
                                style={{ position: "absolute", top: 8, right: 8, background: "#fff", border: "1px solid #e2e8f0", padding: "4px 8px", borderRadius: 6, fontSize: "0.65rem", fontWeight: 700, cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
                              >
                                {copyStatus === log.id + "-stack" ? "✅ הועתק" : "📋 העתק Stack"}
                              </button>
                            </div>
                          )}
                        </div>
                        <button 
                          onClick={() => copyToClipboard(log.message, log.id)}
                          title="העתק הודעת שגיאה"
                          style={{ flexShrink: 0, background: "#f1f5f9", border: "none", padding: "8px", borderRadius: 8, cursor: "pointer", color: copyStatus === log.id ? "#10b981" : "#64748b" }}
                        >
                          {copyStatus === log.id ? "✓" : "📋"}
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
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        code { background: #f1f5f9; padding: 2px 6px; borderRadius: 4px; fontSize: 0.75rem; color: #334155; }
      `}</style>
    </div>
  )
}
