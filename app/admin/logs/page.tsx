"use client"

import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Image from "next/image"
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
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

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
      } else {
        setError("Failed to fetch logs")
      }
    } catch (err) {
      setError("An error occurred")
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
    if (!confirm("Are you sure you want to clear all logs?")) return

    try {
      const res = await fetch("/api/admin/logs", { method: "DELETE" })
      if (res.ok) {
        setLogs([])
      }
    } catch (err) {
      alert("Failed to clear logs")
    }
  }

  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(search.toLowerCase()) ||
    (log.source ?? "").toLowerCase().includes(search.toLowerCase()) ||
    log.level.toLowerCase().includes(search.toLowerCase())
  )

  const getLevelStyle = (level: string) => {
    switch (level.toLowerCase()) {
      case "error": return { bg: "#fee2e2", color: "#991b1b" }
      case "warn":
      case "warning": return { bg: "#fef3c7", color: "#92400e" }
      default: return { bg: "#dcfce7", color: "#166534" }
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
    <div style={{ minHeight: "100vh", background: "#f0f2f5", direction: "rtl" }}>
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
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>לוג שגיאות מערכת</span>
          <span style={{ background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)" }}>
            Admin Logs
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.jpeg" alt="Cristalino" width={44} height={44} style={{ objectFit: "contain", borderRadius: 6 }} />
          <a href="/admin" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>ניהול</a>
          <a href="/tickets" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", fontWeight: 500 }}>כל הפניות</a>
          
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 10px 4px 6px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{session?.user?.name}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, cursor: "pointer", padding: "6px 12px", fontWeight: 500 }}>יציאה</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1 }}>
            <input 
              type="text" 
              placeholder="חיפוש בלוגים..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #d1d5db", width: "100%", maxWidth: 400, fontSize: "0.9rem" }}
            />
            <button onClick={fetchLogs} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }}>🔄 רענן</button>
          </div>
          {isAdmin && (
            <button 
              onClick={clearLogs}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" }}
            >
              🗑️ נקה לוגים
            </button>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "right" }}>
            <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              <tr>
                <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#6b7280", fontWeight: 700 }}>זמן</th>
                <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#6b7280", fontWeight: 700 }}>רמה</th>
                <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#6b7280", fontWeight: 700 }}>מקור</th>
                <th style={{ padding: "14px 20px", fontSize: "0.8rem", color: "#6b7280", fontWeight: 700 }}>הודעה</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>טוען לוגים...</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>לא נמצאו לוגים</td></tr>
              ) : filteredLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "14px 20px", fontSize: "0.82rem", color: "#1f2937", whiteSpace: "nowrap" }}>
                    {new Date(log.timestamp).toLocaleString("he-IL")}
                  </td>
                  <td style={{ padding: "14px 20px" }}>
                    <span style={{ 
                      padding: "4px 10px", 
                      borderRadius: 999, 
                      fontSize: "0.72rem", 
                      fontWeight: 700, 
                      backgroundColor: getLevelStyle(log.level).bg, 
                      color: getLevelStyle(log.level).color 
                    }}>
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "14px 20px", fontSize: "0.82rem", color: "#4b5563" }}>{log.source || "—"}</td>
                  <td style={{ padding: "14px 20px", fontSize: "0.82rem", color: "#1f2937" }}>
                    <div style={{ fontWeight: 600 }}>{log.message}</div>
                    {log.stack && (
                      <pre style={{ margin: "6px 0 0", fontSize: "0.7rem", color: "#9ca3af", whiteSpace: "pre-wrap", maxHeight: 80, overflow: "auto", background: "#f9fafb", padding: 8, borderRadius: 6 }}>
                        {log.stack}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
      <FooterCopyright />
    </div>
  )
}
