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
 *   equipment    — Equipment checklist, available on any category; opens by
 *                  itself for "עובד חדש". See lib/equipment.ts
 *   newEmployee  — First name, last name, phone and job description of the new
 *                  hire. Shown and required only when the category is
 *                  "עובד חדש"; the server folds them into the description.
 *                  See lib/newEmployee.ts
 *
 * OPEN ON SOMEONE ELSE'S BEHALF (admins only):
 * ─────────────────────────────────────────────
 * When `isAdmin` is true, an extra picker appears above the subject field so an
 * admin taking a phone call or a walk-up can file the ticket in the caller's
 * name. It lists every registered user (GET /api/users, admin-only) plus a
 * "משתמש חדש" option that reveals email + name inputs for someone who has never
 * signed in. Picking an existing user pre-fills phone and computer name from
 * THEIR saved profile rather than the admin's.
 *
 * The choice is sent as `onBehalfOfEmail` / `onBehalfOfName`; the server
 * re-checks the admin flag and owns the actual assignment (see api/tickets).
 *
 * PROPS:
 * ───────
 *   onSuccess       {() => void}  Called after a successful POST. The parent
 *                                 uses this to hide the form and reload tickets.
 *   defaultPhone    {string}      Pre-fills the phone field. Default: "".
 *   defaultStation  {string}      Pre-fills the computerName field. Default: "".
 *   isAdmin         {boolean}     Shows the "open in someone else's name"
 *                                 picker. Default: false.
 *
 * SUBMISSION:
 * ────────────
 * On submit, POSTs to /api/tickets with the form data as JSON.
 * On success: calls onSuccess(), resets the form to defaults.
 * On error:   shows a Hebrew error message below the form fields.
 */

"use client"
import { useState, useEffect } from "react"
import ImageAttachments, { PendingImage } from "./ImageAttachments"
import EquipmentPicker from "./EquipmentPicker"
import NewEmployeeFields from "./NewEmployeeFields"
import { DEFAULT_EQUIPMENT, NEW_EMPLOYEE_CATEGORY } from "@/lib/equipment"
import { EMPTY_NEW_EMPLOYEE, missingFieldLabels, normalizeNewEmployee, type NewEmployeeDetails } from "@/lib/newEmployee"
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS, DEFAULT_URGENCIES, fetchFieldOptions } from "@/lib/fieldOptions"
import { handleImagePaste } from "@/lib/pasteImage"
import { T } from "@/lib/theme"

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

/** Sentinel value for the "add a brand-new user" option in the behalf picker. */
const NEW_USER = "__new__"

/** Shape of a row returned by GET /api/users (admin-only endpoint). */
type PickableUser = { id: string; name: string | null; email: string; phone: string | null; station: string | null }

export default function TicketForm({
  onSuccess,
  defaultPhone = "",
  defaultStation = "",
  isAdmin = false,
}: {
  /** Callback invoked after the ticket is successfully created. */
  onSuccess: () => void
  /** Phone number pre-filled from user profile. Empty if not saved. */
  defaultPhone?: string
  /** Workstation name pre-filled from user profile. Empty if not saved. */
  defaultStation?: string
  /** Admins get the "open in someone else's name" picker. */
  isAdmin?: boolean
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

  /** Dynamic dropdown options fetched from /api/admin/field-options (falls back to defaults). */
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [platforms,  setPlatforms]  = useState<string[]>(DEFAULT_PLATFORMS)
  const [urgencies,  setUrgencies]  = useState<string[]>(DEFAULT_URGENCIES)
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>(DEFAULT_EQUIPMENT)

  /** Equipment requested on this ticket: label → quantity. */
  const [equipment, setEquipment] = useState<Record<string, number>>({})

  /** Whether the user opened the checklist on a non-onboarding ticket. */
  const [equipmentOpen, setEquipmentOpen] = useState(false)

  /** The new hire's details — required, and only collected, for onboarding. */
  const [newEmployee, setNewEmployee] = useState<NewEmployeeDetails>(EMPTY_NEW_EMPLOYEE)

  useEffect(() => {
    fetchFieldOptions().then(opts => {
      setCategories(opts.category)
      setPlatforms(opts.platform)
      setUrgencies(opts.urgency)
      setEquipmentOptions(opts.equipment)
    })
  }, [])

  /**
   * Onboarding tickets always need a kit, so the checklist opens by itself.
   * Any other ticket can still request equipment (an existing employee asking
   * for a second screen) — it just starts collapsed behind a toggle so a
   * "printer is jammed" ticket is not cluttered by it.
   */
  const isNewEmployee = form.category === NEW_EMPLOYEE_CATEGORY
  const showEquipment = isNewEmployee || equipmentOpen || Object.keys(equipment).length > 0

  /**
   * Whose name the ticket is opened in (admins only).
   *   ""         — the signed-in admin themselves (default)
   *   NEW_USER   — a person not yet in the system; reveals the email/name inputs
   *   <email>    — an existing user picked from the list
   */
  const [behalf, setBehalf] = useState("")

  /** All registered users, for the behalf picker. Only fetched for admins. */
  const [users, setUsers] = useState<PickableUser[]>([])

  /** Email + name typed in when NEW_USER is selected. */
  const [newUser, setNewUser] = useState({ email: "", name: "" })

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/users")
      .then(r => (r.ok ? r.json() : []))
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setUsers([]))
  }, [isAdmin])

  /**
   * Switching the ticket owner re-points the contact fields at that person's
   * saved profile — an admin filing for someone else wants THEIR phone and
   * machine, not the admin's own pre-filled values.
   */
  const pickBehalf = (value: string) => {
    setBehalf(value)
    const picked = users.find(u => u.email === value)
    setForm(f => ({
      ...f,
      phone:        picked ? (picked.phone   ?? "") : value === NEW_USER ? "" : defaultPhone,
      computerName: picked ? (picked.station ?? "") : value === NEW_USER ? "" : defaultStation,
    }))
  }

  /** Whether the form is currently submitting (disables button, shows spinner). */
  const [loading, setLoading] = useState(false)

  /** Error message shown to the user if submission fails. */
  const [error, setError] = useState("")

  /** Pending images to attach after ticket creation. */
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])

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
      // An onboarding ticket needs all four hire details. The browser's own
      // `required` lets a space through, so re-check the normalised values.
      if (isNewEmployee) {
        const missing = missingFieldLabels(normalizeNewEmployee(newEmployee))
        if (missing.length > 0) {
          setError(`יש למלא את פרטי העובד החדש: ${missing.join(", ")}`)
          return
        }
      }

      // Admins only: name the ticket owner. The server re-checks the admin flag,
      // so a forged field from a regular user is rejected there (403).
      const behalfFields = isAdmin && behalf
        ? behalf === NEW_USER
          ? { onBehalfOfEmail: newUser.email.trim(), onBehalfOfName: newUser.name.trim() }
          : { onBehalfOfEmail: behalf }
        : {}

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ...behalfFields,
          // Sent whenever anything was picked — equipment is not limited to
          // onboarding tickets.
          equipment: Object.entries(equipment).map(([label, quantity]) => ({ label, quantity })),
          // Only meaningful for an onboarding ticket; the server ignores it
          // otherwise and rejects the request if a field is blank.
          ...(isNewEmployee ? { newEmployee: normalizeNewEmployee(newEmployee) } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()

      // Upload any pending images
      for (const img of pendingImages) {
        await fetch(`/api/tickets/${created.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
        })
      }

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
      setPendingImages([])
      setEquipment({})
      setEquipmentOpen(false)
      setNewEmployee(EMPTY_NEW_EMPLOYEE)
      // Back to "in my own name" so the next ticket doesn't silently inherit
      // the previous caller's identity.
      setBehalf("")
      setNewUser({ email: "", name: "" })
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
        <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke={T.green} strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: T.text }}>פתיחת פנייה חדשה</h2>
      </div>

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* ── Open in someone else's name (admins only) ── */}
        {isAdmin && (
          <div style={{ backgroundColor: T.cardMuted, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <span style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.04em", color: T.greenInk, backgroundColor: T.greenBg, borderRadius: "999px", padding: "3px 9px" }}>
                מנהל
              </span>
              <label htmlFor="behalf-select" style={{ margin: 0 }}>פתיחת פנייה בשם</label>
            </div>

            <select id="behalf-select" value={behalf} onChange={e => pickBehalf(e.target.value)}>
              <option value="">— בשמי —</option>
              {users.map(u => (
                <option key={u.id} value={u.email}>
                  {u.name ? `${u.name} — ${u.email}` : u.email}
                </option>
              ))}
              <option value={NEW_USER}>➕ משתמש חדש…</option>
            </select>

            {/* New user — email is required, name is optional */}
            {behalf === NEW_USER && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label htmlFor="behalf-email">אימייל *</label>
                  <input
                    id="behalf-email"
                    required
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser(n => ({ ...n, email: e.target.value }))}
                    placeholder="name@cristalino.co.il"
                  />
                </div>
                <div>
                  <label htmlFor="behalf-name">שם מלא</label>
                  <input
                    id="behalf-name"
                    value={newUser.name}
                    onChange={e => setNewUser(n => ({ ...n, name: e.target.value }))}
                    placeholder="ישראל ישראלי"
                  />
                </div>
              </div>
            )}

            {behalf !== "" && (
              <p style={{ margin: 0, fontSize: "0.78rem", color: T.text2, lineHeight: 1.6 }}>
                הפנייה תירשם על שם משתמש זה, והוא יקבל את עדכוני המייל. הפעולה תתועד בהיסטוריית הפנייה על שמך.
              </p>
            )}
          </div>
        )}

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
              <label htmlFor="computer-input" style={{ margin: 0 }}>שם מחשב</label>
              {/* Tooltip trigger button — shows "how to find hostname" instructions */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: T.greenBg, color: T.greenInk, border: "none", cursor: "pointer", fontSize: "0.65rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
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
              {platforms.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="category-select">קטגוריה</label>
            <select
              id="category-select"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            >
              {categories.map(c => <option key={c}>{c}</option>)}
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
              {urgencies.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* ── New-employee details (mandatory for onboarding tickets) ── */}
        {isNewEmployee && (
          <NewEmployeeFields value={newEmployee} onChange={setNewEmployee} disabled={loading} />
        )}

        {/* ── Equipment request ── */}
        {showEquipment ? (
          <div style={{ backgroundColor: T.cardMuted, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ margin: 0 }}>{isNewEmployee ? "ציוד לעובד החדש" : "ציוד מבוקש"}</label>
              <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: T.text3 }}>
                בחרו מה נדרש. הטכנאי שיטפל בפנייה יסמן כל פריט שהתקבל או הותקן.
              </p>
            </div>
            <EquipmentPicker
              options={equipmentOptions}
              value={equipment}
              onChange={setEquipment}
              disabled={loading}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEquipmentOpen(true)}
            style={{ alignSelf: "flex-start", padding: "7px 14px", borderRadius: 9, border: `1px dashed ${T.border}`, background: "#fff", color: T.text2, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
          >
            + אני צריך גם ציוד
          </button>
        )}

        {/* ── Description ── */}
        <div>
          <label htmlFor="description-textarea">תיאור מפורט *</label>
          <textarea
            id="description-textarea"
            required
            rows={4}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            onPaste={e => handleImagePaste(e, img => setPendingImages(prev => [...prev, img]))}
            placeholder="פרט את הבעיה בצורה מלאה... (ניתן להדביק תמונה ישירות)"
            style={{ resize: "none" }}
          />
        </div>

        {/* ── Image Attachments ── */}
        <div>
          <label style={{ display: "block", marginBottom: 6 }}>תמונות מצורפות</label>
          <ImageAttachments images={pendingImages} onChange={setPendingImages} />
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
            background: loading ? "#9AA09C" : T.dark,
            color: "#fff",
            fontWeight: 600,
            padding: "13px 0",
            borderRadius: "11px",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "0.9rem",
            letterSpacing: "0.01em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
          }}
        >
          {!loading && <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block" }} />}
          {loading ? "שולח..." : "שלח פנייה"}
        </button>
      </div>
    </form>
  )
}
