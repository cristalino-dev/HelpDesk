/**
 * app/profile/page.tsx — User Account Settings
 *
 * PURPOSE:
 * ─────────
 * Allows employees to fill in personal details that are saved to the database
 * and used to pre-populate the TicketForm on subsequent visits.
 *
 * FIELDS:
 * ────────
 *   שם פרטי (firstName)  — First name. Combined with lastName as User.name.
 *   שם משפחה (lastName)  — Last name. Combined with firstName as User.name.
 *   טלפון (phone)        — Contact number. Saved to User.phone. Pre-fills
 *                          TicketForm.phone on the dashboard.
 *   שם מחשב / תחנת עבודה (station) — Workstation hostname. Saved to User.station.
 *                          Pre-fills TicketForm.computerName on the dashboard.
 *   כתובת אימייל (email) — Read-only. Displayed for reference; controlled by
 *                          Google OAuth and cannot be changed here.
 *
 * DATA FLOW:
 * ───────────
 *   On mount: GET /api/profile → splits User.name into firstName/lastName parts
 *   On save:  PATCH /api/profile with { name: "first last", phone, station }
 *             + NextAuth session.update({ name }) to refresh the display name
 *             in the header without requiring a sign-out/sign-in cycle.
 *
 * NAME HANDLING:
 * ───────────────
 * The database stores a single `name` field. This page splits it on the first
 * space for display in two inputs, then joins them back on save. If the user
 * has no last name, lastName is stored as "". The combined name is trimmed
 * before saving to avoid trailing spaces.
 *
 * SESSION UPDATE:
 * ────────────────
 * After a successful PATCH, `update({ name: fullName })` is called on the
 * NextAuth session. This triggers a session refresh that propagates the new
 * name to the JWT cookie, so the header avatar in all pages reflects the
 * change on the next render.
 */

"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import FooterCopyright from "@/components/FooterCopyright"
import { T, HDR } from "@/lib/theme"
import AppHeader from "@/components/AppHeader"

export default function ProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", station: "" })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/profile")
      .then(r => r.json())
      .then(data => {
        const parts = (data.name ?? "").split(" ")
        setForm({
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" "),
          phone: data.phone ?? "",
          station: data.station ?? "",
        })
        setLoading(false)
      })
  }, [status])

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ")
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullName, phone: form.phone, station: form.station }),
      })
      if (!res.ok) throw new Error()
      await update({ name: fullName })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError("שגיאה בשמירה. נסו שנית.")
    } finally {
      setSaving(false)
    }
  }

  if (status === "loading" || loading) return null

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.bg }}>
      <AppHeader logoHref="/dashboard">
        <a href="/dashboard" style={{ fontSize: "0.82rem", color: HDR.link, textDecoration: "none", padding: "8px 16px", borderRadius: "9px", border: "1px solid rgba(255,255,255,0.16)", fontWeight: 500 }}>← חזרה ללוח הבקרה</a>
      </AppHeader>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "44px 24px" }}>
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem", fontWeight: 800, color: T.text }}>הגדרות חשבון</h1>
          <p style={{ margin: 0, color: T.muted, fontSize: "0.88rem" }}>פרטים אלו ישמשו למילוי אוטומטי בטפסי פנייה</p>
        </div>

        <form onSubmit={handleSubmit} style={{ backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 1px 2px rgba(20,22,26,0.04)", border: `1px solid ${T.border}`, overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 6, height: 18, borderRadius: 3, background: T.green }} />
            <p style={{ margin: 0, fontWeight: 700, color: T.text, fontSize: "0.95rem" }}>פרטים אישיים</p>
          </div>

          <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Name row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label>שם פרטי</label>
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="ישראל" />
              </div>
              <div>
                <label>שם משפחה</label>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="ישראלי" />
              </div>
            </div>

            <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />

            {/* Phone */}
            <div>
              <label>טלפון</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="050-0000000" />
              <p style={{ margin: "5px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>ימולא אוטומטית בטפסי פנייה</p>
            </div>

            {/* Station */}
            <div>
              <label>שם מחשב / תחנת עבודה</label>
              <input value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} placeholder="לדוגמה: PC-ALON-01" />
              <p style={{ margin: "5px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>ימולא אוטומטית בטפסי פנייה</p>
            </div>

            {/* Email (readonly) */}
            <div>
              <label>כתובת אימייל</label>
              <input value={session?.user?.email ?? ""} disabled style={{ backgroundColor: T.cardMuted, color: T.muted, cursor: "not-allowed" }} />
              <p style={{ margin: "5px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>נקבע על ידי חשבון Google ולא ניתן לשינוי</p>
            </div>

            {error && <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#dc2626" }}>{error}</div>}
            {saved && <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#16a34a" }}>הפרטים נשמרו בהצלחה</div>}

            <button type="submit" disabled={saving} style={{ background: saving ? "#9AA09C" : T.dark, color: "#fff", fontWeight: 600, padding: "13px 0", borderRadius: "11px", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
              {!saving && <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block" }} />}
              {saving ? "שומר..." : "שמור פרטים"}
            </button>
          </div>
        </form>
      </main>

      <FooterCopyright />
    </div>
  )
}
