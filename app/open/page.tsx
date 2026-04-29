"use client"
import { useSession, signIn } from "next-auth/react"
import { useState, useEffect } from "react"
import Image from "next/image"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"

// ── Urgency colours ──────────────────────────────────────────────────────────
const URGENCY_COLORS: Record<string, { bg: string; text: string; border: string; label: string; hint: string }> = {
  "נמוך":   { bg: "#f0fdf4", text: "#16a34a", border: "#86efac", label: "נמוך",   hint: "שאלה, בקשה כללית, לא חוסמת עבודה" },
  "בינוני": { bg: "#fffbeb", text: "#d97706", border: "#fcd34d", label: "בינוני", hint: "מגבלה חלקית — אפשר להמשיך לעבוד" },
  "גבוה":   { bg: "#fff7ed", text: "#ea580c", border: "#fdba74", label: "גבוה",   hint: "פגיעה משמעותית בעבודה" },
  "דחוף":   { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5", label: "דחוף",   hint: "תקלה קריטית — לא ניתן לעבוד כלל" },
}

// ── Walkthrough steps shown before the form ──────────────────────────────────
const GUIDE_STEPS = [
  {
    num: "1",
    icon: "📝",
    title: "תאר את הבעיה",
    body: "כתב נושא קצר וברור — למשל \"המדפסת לא מדפיסה\" או \"comax קורס בהפעלה\". בתיאור המפורט ציין מה קרה, מתי, ואם הבעיה חוזרת על עצמה.",
  },
  {
    num: "2",
    icon: "💻",
    title: "זהה את המחשב",
    body: "שם המחשב מאפשר לצוות לאתר את התחנה ולהתחבר מרחוק במידת הצורך. אם אינך יודע — לחץ Start, הקלד cmd, Enter, ואז הקלד hostname ולחץ Enter.",
  },
  {
    num: "3",
    icon: "⚡",
    title: "בחר דחיפות מתאימה",
    body: "דחיפות גבוהה מדי מורידה את האמינות של תורי העבודה. בחר \"דחוף\" רק אם אין ביכולתך לעבוד כלל. תקלות שניתן לעקוף — \"בינוני\".",
  },
  {
    num: "4",
    icon: "✅",
    title: "שלח ועקוב",
    body: "לאחר השליחה תקבל מייל אישור עם מספר פנייה. ניתן לעקוב אחר הסטטוס בכל עת דרך לוח הבקרה האישי שלך.",
  },
]

// ── Field label + hint component ─────────────────────────────────────────────
function FieldLabel({ label, hint, required }: { label: string; hint?: string; required?: boolean }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>{label}</span>
        {required && <span style={{ fontSize: "0.7rem", color: "#ef4444", fontWeight: 700 }}>*</span>}
      </div>
      {hint && <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: 1 }}>{hint}</div>}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function OpenTicketPage() {
  const { data: session, status, update } = useSession()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    subject: "",
    description: "",
    phone: "",
    computerName: "",
    urgency: "בינוני",
    category: "אחר",
    platform: "מחשב אישי",
  })
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState<{ ticketNumber: number; subject: string } | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)

  const urgColor = URGENCY_COLORS[form.urgency]

  // Pre-fill phone, computerName, and name from saved profile when the user is authenticated
  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/profile")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const nameParts = (d.name ?? session?.user?.name ?? "").split(" ")
        setForm(f => ({
          ...f,
          firstName: nameParts[0] ?? f.firstName,
          lastName: nameParts.slice(1).join(" ") || f.lastName,
          phone: d.phone ?? f.phone,
          computerName: d.station ?? f.computerName,
        }))
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      const created = await res.json()
      for (const img of pendingImages) {
        await fetch(`/api/tickets/${created.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
        })
      }
      setSubmitted({ ticketNumber: created.ticketNumber, subject: form.subject })
      // Save personal details to profile so they are pre-filled on the next visit
      const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ")
      void fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullName || undefined, phone: form.phone, station: form.computerName }),
      }).then(r => { if (r.ok && fullName) void update({ name: fullName }) }).catch(() => {})
    } catch {
      setError("אירעה שגיאה בשליחת הפנייה. נסו שנית.")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Shared input style ───────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 13px", borderRadius: 10,
    border: "1.5px solid #e5e7eb", fontSize: "0.88rem",
    background: "#fafafa", boxSizing: "border-box",
    outline: "none", transition: "border-color 0.15s",
    fontFamily: "inherit",
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (status === "loading") return null

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #f0f4ff 0%, #f8fafc 60%)" }}>

      {/* ── Header ── */}
      <header style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #2563eb 100%)",
        padding: "0 28px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 4px 20px rgba(15,23,42,0.4)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Image src="/logo.jpeg" alt="Cristalino" width={36} height={36} style={{ objectFit: "contain", borderRadius: 6 }} />
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>מערכת הפניות — קריסטלינו</span>
        </div>
        {session?.user && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>
              {(session.user.name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.85)" }}>{session.user.name}</span>
            <a href="/dashboard" style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.7)", textDecoration: "none", padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", marginRight: 4 }}>לוח אישי</a>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "36px 20px 60px" }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 8px 24px rgba(37,99,235,0.3)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 11v4M10 13h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.55rem", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            פתיחת פנייה לתמיכה טכנית
          </h1>
          <p style={{ margin: "0 auto", fontSize: "0.93rem", color: "#6b7280", lineHeight: 1.6, maxWidth: 520 }}>
            יש בעיה טכנית? תקלה במחשב, תוכנה, רשת או מדפסת? מלאו את הטופס — הצוות יחזור אליך בהקדם.
          </p>
        </div>

        {/* ── Guide steps ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
          {GUIDE_STEPS.map(step => (
            <div key={step.num} style={{ background: "#fff", borderRadius: 14, padding: "16px", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: "#eff6ff", color: "#2563eb", fontSize: "0.7rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {step.num}
                </div>
                <span style={{ fontSize: "1.1rem" }}>{step.icon}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1f2937" }}>{step.title}</span>
              </div>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", lineHeight: 1.6 }}>{step.body}</p>
            </div>
          ))}
        </div>

        {/* ── Not logged in ── */}
        {status === "unauthenticated" && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e5e7eb", boxShadow: "0 4px 20px rgba(0,0,0,0.07)", padding: "40px 32px", textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🔑</div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 700, color: "#1f2937" }}>יש להתחבר כדי לפתוח פנייה</h2>
            <p style={{ margin: "0 0 24px", fontSize: "0.88rem", color: "#6b7280" }}>
              השתמשו בחשבון Google הארגוני שלכם (@cristalino.co.il)
            </p>
            <button
              onClick={() => signIn("google", { callbackUrl: "/open" })}
              style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#fff", border: "1.5px solid #d1d5db", borderRadius: 10, padding: "11px 24px", fontSize: "0.9rem", fontWeight: 600, color: "#374151", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              התחברות עם Google
            </button>
          </div>
        )}

        {/* ── Submission success ── */}
        {submitted && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1.5px solid #86efac", boxShadow: "0 4px 20px rgba(22,163,74,0.1)", padding: "40px 32px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", fontSize: "2rem" }}>✅</div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem", fontWeight: 800, color: "#14532d" }}>הפנייה נשלחה בהצלחה!</h2>
            <p style={{ margin: "0 0 6px", fontSize: "0.88rem", color: "#166534" }}>
              <strong>נושא:</strong> {submitted.subject}
            </p>
            <div style={{ display: "inline-block", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "10px 20px", margin: "12px 0 20px", fontSize: "1rem", fontWeight: 700, color: "#15803d", letterSpacing: "0.03em" }}>
              HDTC-{submitted.ticketNumber}
            </div>
            <p style={{ margin: "0 0 24px", fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.6 }}>
              קיבלת אישור במייל עם מספר הפנייה. הצוות יפנה אליך בהקדם.<br />
              ניתן לעקוב אחר הסטטוס בלוח הבקרה האישי.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => { setSubmitted(null); setForm(f => ({ ...f, subject: "", description: "", urgency: "בינוני", category: "אחר", platform: "מחשב אישי" })); setPendingImages([]) }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer" }}
              >
                + פתח פנייה נוספת
              </button>
              <a href="/dashboard" style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "0.88rem", cursor: "pointer", textDecoration: "none" }}>
                לוח הבקרה שלי
              </a>
            </div>
          </div>
        )}

        {/* ── The form ── */}
        {status === "authenticated" && !submitted && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e5e7eb", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", overflow: "hidden" }}>

            {/* Form header */}
            <div style={{ padding: "20px 28px", borderBottom: "1px solid #f3f4f6", background: "linear-gradient(135deg, #eff6ff, #f5f3ff)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1f2937" }}>טופס פתיחת פנייה</div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>שדות עם * הם חובה</div>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: "28px", display: "flex", flexDirection: "column", gap: 22 }}>

              {/* Name */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <FieldLabel label="שם פרטי" required />
                  <input
                    required
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="ישראל"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <FieldLabel label="שם משפחה" required />
                  <input
                    required
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="ישראלי"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Subject */}
              <div>
                <FieldLabel label="נושא הפנייה" required hint='תאר בקצרה — למשל: "המדפסת לא עובדת" או "comax קורס"' />
                <input
                  required
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder='לדוגמה: "המדפסת ברחוב לא מדפיסה מאז הבוקר"'
                  style={inputStyle}
                />
              </div>

              {/* Computer + Phone */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>שם מחשב</span>
                      <div style={{ position: "relative" }}>
                        <button type="button"
                          onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}
                          onFocus={() => setShowTooltip(true)} onBlur={() => setShowTooltip(false)}
                          style={{ width: 17, height: 17, borderRadius: "50%", background: "#dbeafe", color: "#2563eb", border: "none", cursor: "pointer", fontSize: "0.65rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                        >?</button>
                        {showTooltip && (
                          <div style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, background: "#1f2937", color: "#f9fafb", borderRadius: 10, padding: "12px 14px", fontSize: "0.76rem", lineHeight: 1.65, width: 230, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 20 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>כיצד למצוא שם מחשב?</div>
                            <div>לחץ <strong>Start</strong> ← הקלד <strong>cmd</strong> ← Enter</div>
                            <div style={{ margin: "4px 0" }}>הקלד <strong>hostname</strong> ← Enter</div>
                            <div style={{ color: "#9ca3af" }}>השם שמופיע הוא שם המחשב</div>
                            <div style={{ position: "absolute", bottom: -5, right: 8, width: 10, height: 10, background: "#1f2937", transform: "rotate(45deg)" }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>מאפשר לצוות להתחבר מרחוק לתחנה שלך</div>
                  </div>
                  <input
                    value={form.computerName}
                    onChange={e => setForm(f => ({ ...f, computerName: e.target.value }))}
                    placeholder="לדוגמה: PC-ALON-01"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <FieldLabel label="טלפון ליצירת קשר" required hint="מספר שבו ניתן להגיע אליך כעת" />
                  <input
                    required type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="050-0000000"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Platform + Category + Urgency */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <FieldLabel label="פלטפורמה" hint="באיזה מערכת / מכשיר?" />
                  <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                    style={{ ...inputStyle, background: "#fafafa", cursor: "pointer" }}>
                    {["comax", "comax sales tracker", "אנדרואיד", "אייפד", "מחשב אישי"].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel label="קטגוריה" hint="סוג התקלה" />
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    style={{ ...inputStyle, background: "#fafafa", cursor: "pointer" }}>
                    {["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel label="דחיפות" hint={urgColor?.hint} />
                  <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
                    style={{ ...inputStyle, background: urgColor?.bg, color: urgColor?.text, borderColor: urgColor?.border, fontWeight: 600, cursor: "pointer" }}>
                    {Object.entries(URGENCY_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Urgency guide */}
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#374151", marginBottom: 8 }}>מדריך דחיפות:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                  {Object.entries(URGENCY_COLORS).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ padding: "1px 8px", borderRadius: 999, fontSize: "0.68rem", fontWeight: 700, background: v.bg, color: v.text, border: `1px solid ${v.border}`, whiteSpace: "nowrap" }}>{v.label}</span>
                      <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{v.hint}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <FieldLabel label="תיאור מפורט" required hint="מה קרה? מתי? האם הבעיה חוזרת? מה ניסית לעשות?" />
                <textarea
                  required rows={5}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={"לדוגמה:\n• המדפסת מצפצפת ומציגת שגיאה 'Paper Jam' אך אין נייר תקוע\n• הבעיה מתחילה מאמש אחרי עדכון\n• ניסיתי לכבות ולהדליק — לא עזר"}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
                />
              </div>

              {/* Image attachments */}
              <div>
                <FieldLabel label="תמונות מצורפות" hint="צילום מסך של שגיאה, תמונת הבעיה — אופציונלי" />
                <ImageAttachments images={pendingImages} onChange={setPendingImages} />
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: "0.85rem", color: "#dc2626", fontWeight: 600 }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={submitting}
                style={{ padding: "14px", borderRadius: 12, border: "none", background: submitting ? "#93c5fd" : "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: submitting ? "not-allowed" : "pointer", boxShadow: submitting ? "none" : "0 6px 16px rgba(37,99,235,0.35)", letterSpacing: "0.01em", transition: "all 0.15s" }}
              >
                {submitting ? "שולח..." : "שלח פנייה ←"}
              </button>

              <p style={{ margin: 0, textAlign: "center", fontSize: "0.75rem", color: "#9ca3af" }}>
                לאחר השליחה תקבל אישור במייל עם מספר הפנייה
              </p>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
