/**
 * components/TicketForm.tsx — New Ticket Submission Form
 *
 * PURPOSE:
 * ─────────
 * Renders the form used by employees to open a new IT support ticket.
 * Displayed in the dashboard when the user clicks "+ פנייה חדשה".
 *
 * PROFILE PRE-FILL:
 * ──────────────────
 * The parent component (dashboard/page.tsx) fetches the user's saved profile
 * (GET /api/profile) on page load and passes `defaultPhone` and
 * `defaultStation` as props. This means:
 *   - On first use: fields are empty, user fills them in manually
 *   - After saving profile settings: phone and computer name are pre-filled
 *   - After form submission: fields reset to the defaultPhone/defaultStation
 *     values (not to empty strings), so the next ticket is also pre-filled
 *
 * FORM FIELDS:
 * ─────────────
 *   subject      — Short problem description (required)
 *   computerName — Machine hostname, pre-filled from profile.station (required)
 *                  Includes a "?" tooltip button explaining how to find it:
 *                  Start → cmd → hostname
 *   phone        — Contact number, pre-filled from profile.phone (required)
 *   category     — One of: חומרה | תוכנה | רשת | מדפסת | אחר (optional, default "אחר")
 *   urgency      — One of: נמוך | בינוני | גבוה | דחוף (optional, default "בינוני")
 *                  Select box background color changes to match urgency level
 *   description  — Full problem details (required, 4-row textarea)
 *
 * PROPS:
 * ───────
 *   onSuccess       {() => void}  Called after a successful POST. The parent
 *                                 uses this to hide the form and reload tickets.
 *   defaultPhone    {string}      Pre-fills the phone field. Default: "".
 *   defaultStation  {string}      Pre-fills the computerName field. Default: "".
 *
 * SUBMISSION:
 * ────────────
 * On submit, POSTs to /api/tickets with the form data as JSON.
 * On success: calls onSuccess(), resets the form to defaults.
 * On error:   shows a Hebrew error message below the form fields.
 */

"use client"
import { useState } from "react"

/** All available ticket categories. Displayed in the category <select>. */
const CATEGORIES = ["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"]

/** All available platforms. */
const PLATFORMS = ["comax", "comax sales tracker", "אנדרואיד", "אייפד", "מחשב אישי"]

/** All available urgency levels, from lowest to highest. */
const URGENCIES = ["נמוך", "בינוני", "גבוה", "דחוף"]

/**
 * Colour palette for the urgency select box.
 * The background, text, and border colours change dynamically to give
 * the user instant visual feedback on the severity they've chosen.
 */
const URGENCY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "נמוך":   { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" }, // green
  "בינוני": { bg: "#fffbeb", text: "#d97706", border: "#fcd34d" }, // yellow
  "גבוה":   { bg: "#fff7ed", text: "#ea580c", border: "#fdba74" }, // orange
  "דחוף":   { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" }, // red
}

export default function TicketForm({
  onSuccess,
  defaultPhone = "",
  defaultStation = "",
}: {
  /** Callback invoked after the ticket is successfully created. */
  onSuccess: () => void
  /** Phone number pre-filled from user profile. Empty if not saved. */
  defaultPhone?: string
  /** Workstation name pre-filled from user profile. Empty if not saved. */
  defaultStation?: string
}) {
  /** Controlled form state for all input fields. */
  const [form, setForm] = useState({
    subject: "",
    description: "",
    phone: defaultPhone,       // Pre-filled from profile (if available)
    computerName: defaultStation, // Pre-filled from profile (if available)
    urgency: "בינוני",         // Default urgency: medium
    category: "אחר",           // Default category: other
    platform: "מחשב אישי",
  })

  /** Whether the form is currently submitting (disables button, shows spinner). */
  const [loading, setLoading] = useState(false)

  /** Error message shown to the user if submission fails. */
  const [error, setError] = useState("")

  /**
   * Controls visibility of the computer-name tooltip.
   * Shown on hover or focus of the "?" button; hidden on blur/mouseleave.
   */
  const [showTooltip, setShowTooltip] = useState(false)

  /**
   * handleSubmit — POSTs the form data to /api/tickets.
   *
   * Flow:
   *   1. Prevent default browser form submission
   *   2. Set loading state
   *   3. POST JSON to /api/tickets
   *   4a. Success: call onSuccess(), reset form to defaults
   *   4b. Error:   show Hebrew error message
   *   5. Always: clear loading state
   */
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
      // Reset form, but keep the pre-filled defaults (not blank strings)
      // so the next ticket opened in the same session is also pre-filled.
      setForm({
        subject: "",
        description: "",
        phone: defaultPhone,
        computerName: defaultStation,
        urgency: "בינוני",
        category: "אחר",
        platform: "מחשב אישי",
      })
    } catch {
      setError("אירעה שגיאה. נסו שנית.")
    } finally {
      setLoading(false)
    }
  }

  /** Currently selected urgency colour theme (updates reactively as urgency changes). */
  const urgColor = URGENCY_COLORS[form.urgency]

  return (
    <form onSubmit={handleSubmit} style={{
      backgroundColor: "#fff",
      borderRadius: "16px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      border: "1px solid #f0f2f5",
      overflow: "hidden",
    }}>
      {/* ── Form Header ── */}
      <div style={{ padding: "18px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#1f2937" }}>פתיחת פנייה חדשה</h2>
      </div>

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* ── Subject Field ── */}
        <div>
          <label htmlFor="subject-input">נושא הפנייה *</label>
          <input
            id="subject-input"
            required
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="תאר בקצרה את הבעיה"
          />
        </div>

        {/* ── Computer Name + Phone (two-column grid) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* Computer Name with tooltip */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
              <label htmlFor="computer-input" style={{ margin: 0 }}>שם מחשב *</label>
              {/* Tooltip trigger button — shows "how to find hostname" instructions */}
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
                    {/* Tooltip arrow (CSS triangle trick) */}
                    <div style={{ position: "absolute", bottom: "-5px", right: "7px", width: "10px", height: "10px", backgroundColor: "#1f2937", transform: "rotate(45deg)" }} />
                  </div>
                )}
              </div>
            </div>
            <input
              id="computer-input"
              required
              value={form.computerName}
              onChange={e => setForm(f => ({ ...f, computerName: e.target.value }))}
              placeholder="לדוגמה: PC-ALON-01"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone-input">טלפון *</label>
            <input
              id="phone-input"
              required
              type="tel"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="050-0000000"
            />
          </div>
        </div>

        {/* ── Category + Urgency + Platform (three-column grid) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          <div>
            <label htmlFor="platform-select">פלטפורמה</label>
            <select
              id="platform-select"
              value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            >
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="category-select">קטגוריה</label>
            <select
              id="category-select"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="urgency-select">דחיפות</label>
            {/* Background/text/border changes dynamically based on selected urgency */}
            <select
              id="urgency-select"
              value={form.urgency}
              onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
              style={{ backgroundColor: urgColor?.bg, color: urgColor?.text, borderColor: urgColor?.border, fontWeight: 600 }}
            >
              {URGENCIES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* ── Description ── */}
        <div>
          <label htmlFor="description-textarea">תיאור מפורט *</label>
          <textarea
            id="description-textarea"
            required
            rows={4}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="פרט את הבעיה בצורה מלאה..."
            style={{ resize: "none" }}
          />
        </div>

        {/* ── Error message (shown on submit failure) ── */}
        {error && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* ── Submit button ── */}
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
