"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { STAFF_EMAILS, STAFF_MEMBERS } from "@/lib/staffEmails"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"
import type { TicketDetail, TicketNote, TicketMessage } from "@/types/ticket"

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

const URGENCIES = ["נמוך", "בינוני", "גבוה", "דחוף"]
const STATUSES  = ["פתוח", "בטיפול", "סגור"]
const CATEGORIES = ["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"]
const PLATFORMS  = ["comax", "comax sales tracker", "אנדרואיד", "אייפד", "מחשב אישי"]

function formatDate(s: string) {
  return new Date(s).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
}

export default function TicketDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [ticket, setTicket]       = useState<TicketDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [isStaff, setIsStaff]     = useState(false)
  const [editing, setEditing]     = useState(false)
  const [editForm, setEditForm]   = useState({ subject: "", description: "", phone: "", computerName: "", urgency: "", category: "", platform: "", status: "" })
  const [editSaving, setEditSaving] = useState(false)
  const [noteText, setNoteText]     = useState("")
  const [noteImages, setNoteImages] = useState<PendingImage[]>([])
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError]   = useState("")
  const [msgText, setMsgText]       = useState("")
  const [msgSaving, setMsgSaving]   = useState(false)
  const [assigning, setAssigning]   = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (status === "authenticated") {
      setIsStaff(!!(session?.user?.isAdmin || STAFF_EMAILS.includes(session?.user?.email ?? "")))
    }
  }, [status, session])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tickets/${id}`)
      if (!res.ok) { router.push("/dashboard"); return }
      const data: TicketDetail = await res.json()
      setTicket(data)
      setEditForm({
        subject: data.subject, description: data.description,
        phone: data.phone, computerName: data.computerName,
        urgency: data.urgency, category: data.category,
        platform: data.platform, status: data.status,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === "authenticated") load()
  }, [status, id])

  const saveEdit = async () => {
    if (!ticket) return
    setEditSaving(true)
    try {
      const res = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, ...editForm }),
      })
      if (res.ok) { setEditing(false); await load() }
    } finally {
      setEditSaving(false)
    }
  }

  const addNote = async () => {
    if ((!noteText.trim() && noteImages.length === 0) || !ticket) return
    setNoteSaving(true)
    setNoteError("")
    try {
      // Upload any pasted/attached images as ticket attachments
      for (const img of noteImages) {
        await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
        })
      }
      // Save note text (if any)
      if (noteText.trim()) {
        const res = await fetch(`/api/tickets/${ticket.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: noteText.trim() }),
        })
        if (!res.ok) { setNoteError("שגיאה בשמירת הערה"); return }
      }
      setNoteText("")
      setNoteImages([])
      await load()
    } finally {
      setNoteSaving(false)
    }
  }

  const sendMessage = async () => {
    if (!msgText.trim() || !ticket) return
    setMsgSaving(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msgText.trim() }),
      })
      if (res.ok) { setMsgText(""); await load() }
    } finally {
      setMsgSaving(false)
    }
  }

  const assignTicket = async (email: string) => {
    if (!ticket) return
    setAssigning(true)
    try {
      await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, assignedTo: email }),
      })
      await load()
    } finally {
      setAssigning(false)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
        <div style={{ color: "#6b7280", fontSize: "0.95rem" }}>טוען...</div>
      </div>
    )
  }

  if (!ticket) return null

  const labelStyle: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }
  const valueStyle: React.CSSProperties = { fontSize: "0.9rem", color: "#1f2937" }
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.88rem", boxSizing: "border-box" }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => router.back()}
          style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "0.85rem", color: "#374151", display: "flex", alignItems: "center", gap: 6 }}
        >
          ← חזרה
        </button>
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937", flex: 1 }}>
          HDTC-{ticket.ticketNumber} · {ticket.subject}
        </h1>
        {isStaff && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: "0.85rem", color: "#374151", fontWeight: 600 }}
          >
            ✏️ עריכה
          </button>
        )}
        {isStaff && editing && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "0.85rem", color: "#6b7280" }}>ביטול</button>
            <button onClick={saveEdit} disabled={editSaving} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: editSaving ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 700 }}>
              {editSaving ? "שומר..." : "שמור"}
            </button>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Main info card */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>

          {/* Subject */}
          <div style={{ marginBottom: 20 }}>
            <span style={labelStyle}>נושא</span>
            {editing
              ? <input style={inputStyle} value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
              : <div style={{ ...valueStyle, fontSize: "1.05rem", fontWeight: 700 }}>{ticket.subject}</div>
            }
          </div>

          {/* Grid: status / urgency / category / platform */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
            <div>
              <span style={labelStyle}>סטטוס</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                : <span style={{ ...STATUS_STYLE[ticket.status], borderRadius: 20, padding: "3px 12px", fontSize: "0.8rem", fontWeight: 600, display: "inline-block" }}>{ticket.status}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>דחיפות</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.urgency} onChange={e => setEditForm(f => ({ ...f, urgency: e.target.value }))}>
                    {URGENCIES.map(u => <option key={u}>{u}</option>)}
                  </select>
                : <span style={{ ...URGENCY_STYLE[ticket.urgency], borderRadius: 20, padding: "3px 12px", fontSize: "0.8rem", fontWeight: 600, display: "inline-block" }}>{ticket.urgency}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>קטגוריה</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                : <span style={valueStyle}>{ticket.category}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>פלטפורמה</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                : <span style={valueStyle}>{ticket.platform}</span>
              }
            </div>
          </div>

          {/* Grid: submitter / phone / computer / dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <span style={labelStyle}>מגיש</span>
              <span style={valueStyle}>{ticket.user?.name ?? ticket.user?.email ?? "—"}</span>
            </div>
            <div>
              <span style={labelStyle}>טלפון</span>
              {editing
                ? <input style={inputStyle} value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                : <span style={valueStyle}>{ticket.phone || "—"}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>שם מחשב</span>
              {editing
                ? <input style={inputStyle} value={editForm.computerName} onChange={e => setEditForm(f => ({ ...f, computerName: e.target.value }))} />
                : <span style={valueStyle}>{ticket.computerName || "—"}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>נפתח</span>
              <span style={valueStyle}>{formatDate(ticket.createdAt)}</span>
            </div>
          </div>

          {/* Assignment row — staff can change, users see read-only */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", flexShrink: 0 }}>👤 מוקצה ל:</span>
            {isStaff ? (
              <>
                <select
                  value={ticket.assignedTo}
                  disabled={assigning}
                  onChange={e => assignTicket(e.target.value)}
                  style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", background: "#fff", fontWeight: 600, color: "#1e3a8a", cursor: "pointer", opacity: assigning ? 0.5 : 1 }}
                >
                  {STAFF_MEMBERS.map(m => (
                    <option key={m.email} value={m.email}>{m.display}</option>
                  ))}
                </select>
                {ticket.assignedTo !== session?.user?.email && (
                  <button
                    onClick={() => assignTicket(session?.user?.email ?? "")}
                    disabled={assigning || !session?.user?.email}
                    style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", opacity: assigning ? 0.5 : 1 }}
                  >
                    הקצה לעצמי
                  </button>
                )}
                {assigning && <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>שומר...</span>}
              </>
            ) : (
              <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#1e3a8a" }}>
                {STAFF_MEMBERS.find(m => m.email === ticket.assignedTo)?.display ?? ticket.assignedTo}
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <span style={labelStyle}>תיאור</span>
            {editing
              ? <textarea
                  rows={5}
                  style={{ ...inputStyle, resize: "vertical" }}
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                />
              : <div style={{ ...valueStyle, whiteSpace: "pre-wrap", background: "#f9fafb", borderRadius: 8, padding: "10px 14px", lineHeight: 1.6 }}>{ticket.description}</div>
            }
          </div>
        </div>

        {/* Attachments */}
        {ticket.attachments.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>📎 תמונות מצורפות</h2>
            <ImageAttachments
              images={ticket.attachments.map(a => ({ dataUrl: a.dataUrl, filename: a.filename ?? undefined }))}
              onChange={() => {}}
              readonly
            />
          </div>
        )}

        {/* Conversation — visible to everyone */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>💬 שיחה עם הצוות</h2>

          {ticket.messages.length === 0 && (
            <div style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: 16 }}>אין הודעות עדיין</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {ticket.messages.map((msg: TicketMessage) => {
              const isMe = msg.authorEmail === session?.user?.email
              const byStaff = msg.authorRole === "staff"
              return (
                <div key={msg.id} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: byStaff ? "#4f46e5" : "#0891b2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, flexShrink: 0 }}>
                    {msg.authorName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: byStaff ? "#4f46e5" : "#0891b2" }}>{msg.authorName}</span>
                      {byStaff && <span style={{ fontSize: "0.65rem", background: "#eef2ff", color: "#4f46e5", borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>צוות</span>}
                      <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{formatDate(msg.createdAt)}</span>
                    </div>
                    <div style={{ background: byStaff ? "#eef2ff" : "#f0f9ff", borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px", padding: "10px 14px", fontSize: "0.88rem", color: "#1f2937", whiteSpace: "pre-wrap", lineHeight: 1.6, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Reply input */}
          <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16 }}>
            <textarea
              rows={3}
              placeholder="כתוב הודעה..."
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendMessage() }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.88rem", resize: "none", boxSizing: "border-box", marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Ctrl+Enter לשליחה</span>
              <button
                onClick={sendMessage}
                disabled={msgSaving || !msgText.trim()}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: msgSaving || !msgText.trim() ? "#e5e7eb" : "#2563eb", color: msgSaving || !msgText.trim() ? "#9ca3af" : "#fff", cursor: msgSaving || !msgText.trim() ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.85rem" }}
              >
                {msgSaving ? "שולח..." : "שלח הודעה"}
              </button>
            </div>
          </div>
        </div>

        {/* Notes — staff only */}
        {isStaff && (
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 24 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>📝 הערות טכנאי</h2>

            {ticket.notes.length === 0 && (
              <div style={{ fontSize: "0.85rem", color: "#9ca3af", marginBottom: 16 }}>אין הערות עדיין</div>
            )}

            {ticket.notes.map((note: TicketNote) => (
              <div key={note.id} style={{ borderRight: "3px solid #6366f1", paddingRight: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#4f46e5" }}>{note.authorName}</span>
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{formatDate(note.createdAt)}</span>
                </div>
                <div style={{ fontSize: "0.88rem", color: "#1f2937", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{note.content}</div>
              </div>
            ))}

            {/* Add note */}
            <div style={{ borderTop: ticket.notes.length ? "1px solid #f3f4f6" : "none", paddingTop: ticket.notes.length ? 16 : 0 }}>
              <textarea
                rows={3}
                placeholder="הוסף הערה... השתמש ב-@alon, @daniel, @dev, @helpdesk להזכרת צוות"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.88rem", resize: "none", boxSizing: "border-box", marginBottom: 6 }}
              />
              {/* @mention chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: "0.72rem", color: "#9ca3af", alignSelf: "center" }}>הזכר:</span>
                {STAFF_MEMBERS.map(m => (
                  <button key={m.handle} type="button"
                    onClick={() => setNoteText(t => t ? `${t} @${m.handle}` : `@${m.handle}`)}
                    style={{ padding: "2px 10px", borderRadius: 20, border: "1px solid #e0e7ff", background: "#eef2ff", color: "#4f46e5", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}
                  >@{m.handle}</button>
                ))}
              </div>
              <div style={{ marginBottom: 10 }}>
                <ImageAttachments images={noteImages} onChange={setNoteImages} />
              </div>
              {noteError && <div style={{ fontSize: "0.8rem", color: "#dc2626", marginBottom: 8 }}>{noteError}</div>}
              <button
                onClick={addNote}
                disabled={noteSaving || (!noteText.trim() && noteImages.length === 0)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: noteSaving || (!noteText.trim() && noteImages.length === 0) ? "#e5e7eb" : "#4f46e5", color: noteSaving || (!noteText.trim() && noteImages.length === 0) ? "#9ca3af" : "#fff", cursor: noteSaving || (!noteText.trim() && noteImages.length === 0) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.85rem" }}
              >
                {noteSaving ? "שומר..." : "הוסף הערה"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
