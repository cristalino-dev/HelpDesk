"use client"
import { useState } from "react"

const CATEGORIES = ["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"]
const URGENCIES = ["נמוך", "בינוני", "גבוה", "דחוף"]

const URGENCY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "נמוך":   { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
  "בינוני": { bg: "#fffbeb", text: "#d97706", border: "#fcd34d" },
  "גבוה":   { bg: "#fff7ed", text: "#ea580c", border: "#fdba74" },
  "דחוף":   { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
}

export default function TicketForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    subject: "",
    description: "",
    phone: "",
    computerName: "",
    urgency: "בינוני",
    category: "אחר",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showTooltip, setShowTooltip] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      onSuccess()
      setForm({ subject: "", description: "", phone: "", computerName: "", urgency: "בינוני", category: "אחר" })
    } catch {
      setError("אירעה שגיאה. נסו שנית.")
    } finally {
      setLoading(false)
    }
  }

  const urgColor = URGENCY_COLORS[form.urgency]

  return (
    <form onSubmit={handleSubmit} style={{
      backgroundColor: "#fff",
      borderRadius: "16px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      border: "1px solid #f0f2f5",
      overflow: "hidden",
    }}>
      {/* Form header */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#1f2937" }}>פתיחת פנייה חדשה</h2>
      </div>

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Subject */}
        <div>
          <label>נושא הפנייה *</label>
          <input
            required
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="תאר בקצרה את הבעיה"
          />
        </div>

        {/* Computer + Phone */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
              <label style={{ margin: 0 }}>שם מחשב *</label>
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#dbeafe", color: "#2563eb", border: "none", cursor: "pointer", fontSize: "0.65rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
                  aria-label="כיצד למצוא שם מחשב"
                >
                  ?
                </button>
                {showTooltip && (
                  <div style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, backgroundColor: "#1f2937", color: "#f9fafb", borderRadius: "10px", padding: "12px 14px", fontSize: "0.78rem", lineHeight: 1.65, width: "220px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: "6px" }}>כיצד למצוא שם מחשב?</div>
                    <div>לחצו <strong>Start</strong> ← הקלידו <strong>cmd</strong> ← Enter</div>
                    <div style={{ margin: "4px 0" }}>הקלידו <strong>hostname</strong> ← Enter</div>
                    <div>השם שמופיע הוא שם המחשב.</div>
                    <div style={{ position: "absolute", bottom: "-5px", right: "7px", width: "10px", height: "10px", backgroundColor: "#1f2937", transform: "rotate(45deg)" }} />
                  </div>
                )}
              </div>
            </div>
            <input
              required
              value={form.computerName}
              onChange={e => setForm(f => ({ ...f, computerName: e.target.value }))}
              placeholder="לדוגמה: PC-ALON-01"
            />
          </div>
          <div>
            <label>טלפון *</label>
            <input
              required
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="050-0000000"
            />
          </div>
        </div>

        {/* Category + Urgency */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label>קטגוריה</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>דחיפות</label>
            <select
              value={form.urgency}
              onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
              style={{ backgroundColor: urgColor?.bg, color: urgColor?.text, borderColor: urgColor?.border, fontWeight: 600 }}
            >
              {URGENCIES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label>תיאור מפורט *</label>
          <textarea
            required
            rows={4}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="פרט את הבעיה בצורה מלאה..."
            style={{ resize: "none" }}
          />
        </div>

        {error && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#dc2626" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? "#93c5fd" : "linear-gradient(135deg, #2563eb, #4f46e5)",
            color: "#fff",
            fontWeight: 700,
            padding: "12px 0",
            borderRadius: "10px",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.9rem",
            boxShadow: loading ? "none" : "0 4px 12px rgba(37,99,235,0.35)",
            letterSpacing: "0.01em",
          }}
        >
          {loading ? "שולח..." : "שלח פנייה"}
        </button>
      </div>
    </form>
  )
}
