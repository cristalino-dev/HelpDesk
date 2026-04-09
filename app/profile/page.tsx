"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import FooterCopyright from "@/components/FooterCopyright"

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

  const handleSubmit = async (e: React.FormEvent) => {
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
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5" }}>
      {/* Header */}
      <header style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 12h6M9 16h4M5 20h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v13a2 2 0 002 2z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>מערכת helpdesk</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={44} height={44} loading="eager" style={{ objectFit: "contain", borderRadius: "6px" }} />
          <a href="/dashboard" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>חזרה ללוח הבקרה</a>
        </div>
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.3rem", fontWeight: 800, color: "#1f2937" }}>הגדרות חשבון</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.88rem" }}>פרטים אלו ישמשו למילוי אוטומטי בטפסי פנייה</p>
        </div>

        <form onSubmit={handleSubmit} style={{ backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #f3f4f6", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #f3f4f6" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#374151", fontSize: "0.88rem" }}>פרטים אישיים</p>
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
              <input value={session?.user?.email ?? ""} disabled style={{ backgroundColor: "#f9fafb", color: "#9ca3af", cursor: "not-allowed" }} />
              <p style={{ margin: "5px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>נקבע על ידי חשבון Google ולא ניתן לשינוי</p>
            </div>

            {error && <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#dc2626" }}>{error}</div>}
            {saved && <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#16a34a" }}>הפרטים נשמרו בהצלחה</div>}

            <button type="submit" disabled={saving} style={{ background: saving ? "#93c5fd" : "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", fontWeight: 700, padding: "11px 0", borderRadius: "10px", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: "0.9rem" }}>
              {saving ? "שומר..." : "שמור פרטים"}
            </button>
          </div>
        </form>
      </main>

      <FooterCopyright />
    </div>
  )
}
