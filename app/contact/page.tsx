/**
 * app/contact/page.tsx — Contact Development Team
 *
 * PURPOSE:
 * ─────────
 * Provides a way for employees to report problems with the HelpDesk
 * application itself (bugs, UI issues, login failures). Distinct from the
 * ticket system — this is for feedback about the software, not IT requests.
 *
 * EMAIL DELIVERY:
 * ────────────────
 *   To:       helpdesk@cristalino.co.il  (hardcoded)
 *   Subject:  "HelpDesk Issues"     (hardcoded — easy to filter in inbox)
 *   From:     HelpDesk System <SMTP_FROM>
 *   Reply-To: <sender's Google email> — so the dev can reply directly
 *
 *   The sender's name and email are taken from the Google OAuth session.
 *   Users cannot forge their identity — only the message body is user input.
 *
 * SMTP REQUIREMENT:
 * ──────────────────
 * Requires SMTP_HOST, SMTP_USER, SMTP_PASS in .env. If unconfigured,
 * the API returns 503 and an error message is shown in the form.
 * See app/api/contact/route.ts and .env.example for details.
 *
 * ACCESSIBILITY:
 * ───────────────
 * The send button is disabled (and pointer-events blocked) while:
 *   - A send is in progress (sending === true)
 *   - The message field is empty or whitespace-only
 *
 * SUCCESS STATE:
 * ───────────────
 * On successful send, a green confirmation banner is shown and the textarea
 * is cleared. The banner persists until the user navigates away or sends again.
 */

"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import FooterCopyright from "@/components/FooterCopyright"
import AppHeader from "@/components/AppHeader"
import { HDR } from "@/lib/theme"

export default function ContactPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  if (status === "loading") return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError("")
    setSent(false)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "שגיאה בשליחה")
      }
      setSent(true)
      setMessage("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה. נסו שנית.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F2F3F1" }}>
      <AppHeader wordmark="helpdesk" subtitle="צרו קשר" logoHref="/dashboard">
        <a href="/dashboard" style={{ fontSize: "0.82rem", color: HDR.link, textDecoration: "none", padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.16)", fontWeight: 500 }}>חזרה ללוח הבקרה</a>
      </AppHeader>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 800, color: "#1f2937" }}>צרו קשר עם תמיכת HelpDesk</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.88rem", lineHeight: 1.6 }}>
            נתקלתם בבעיה עם מערכת ה-HelpDesk עצמה? כתבו לנו ונטפל בהקדם.
          </p>
        </div>

        {/* Sender info (readonly) */}
        <div style={{ backgroundColor: "#fff", borderRadius: "14px", padding: "16px 20px", marginBottom: "16px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #16181D, #16181D)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {(session?.user?.name ?? session?.user?.email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1f2937" }}>{session?.user?.name ?? "—"}</div>
            <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{session?.user?.email}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ backgroundColor: "#fff", borderRadius: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #f3f4f6", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #f3f4f6" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#374151", fontSize: "0.88rem" }}>נושא: HelpDesk Issues</p>
            <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>ההודעה תישלח אל helpdesk@cristalino.co.il</p>
          </div>

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>תוכן ההודעה</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="תארו את הבעיה שנתקלתם בה..."
                rows={7}
                style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: "10px", fontSize: "0.88rem", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", direction: "rtl" }}
              />
            </div>

            {error && (
              <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#dc2626" }}>
                {error}
              </div>
            )}
            {sent && (
              <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: "#16a34a" }}>
                ההודעה נשלחה בהצלחה! נחזור אליך בהקדם.
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !message.trim()}
              style={{ background: sending || !message.trim() ? "#93c5fd" : "linear-gradient(135deg, #16181D, #16181D)", color: "#fff", fontWeight: 700, padding: "11px 0", borderRadius: "10px", border: "none", cursor: sending || !message.trim() ? "not-allowed" : "pointer", fontSize: "0.9rem" }}
            >
              {sending ? "שולח..." : "שלח הודעה"}
            </button>
          </div>
        </form>
      </main>

      <FooterCopyright />
    </div>
  )
}
