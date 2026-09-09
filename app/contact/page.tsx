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
import { T, HDR } from "@/lib/theme"

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
    <div style={{ minHeight: "100vh", backgroundColor: T.bg }}>
      <AppHeader wordmark="helpdesk" subtitle="צרו קשר" logoHref="/dashboard">
        <a href="/dashboard" style={{ fontSize: "0.82rem", color: HDR.link, textDecoration: "none", padding: "8px 16px", borderRadius: 9, border: `1px solid ${HDR.pillBorder}`, fontWeight: 500 }}>חזרה ללוח הבקרה</a>
      </AppHeader>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.3rem", fontWeight: 800, color: T.text }}>צרו קשר עם תמיכת HelpDesk</h1>
          <p style={{ margin: 0, color: T.inkMuted, fontSize: "0.88rem", lineHeight: 1.6 }}>
            נתקלתם בבעיה עם מערכת ה-HelpDesk עצמה? כתבו לנו ונטפל בהקדם.
          </p>
        </div>

        {/* Sender info (readonly) */}
        <div style={{ backgroundColor: T.card, borderRadius: "14px", padding: "16px 20px", marginBottom: "16px", border: `1px solid ${T.line}`, boxShadow: `0 1px 4px ${T.shadow2}`, display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: T.inverseBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: T.inverseText, flexShrink: 0 }}>
            {(session?.user?.name ?? session?.user?.email ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", color: T.text }}>{session?.user?.name ?? "—"}</div>
            <div style={{ fontSize: "0.78rem", color: T.inkMuted }}>{session?.user?.email}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ backgroundColor: T.card, borderRadius: "16px", boxShadow: `0 1px 4px ${T.shadow2}`, border: `1px solid ${T.line}`, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.line}` }}>
            <p style={{ margin: 0, fontWeight: 700, color: T.ink, fontSize: "0.88rem" }}>נושא: HelpDesk Issues</p>
            <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: T.inkFaint }}>ההודעה תישלח אל helpdesk@cristalino.co.il</p>
          </div>

          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: T.ink, marginBottom: "6px" }}>תוכן ההודעה</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="תארו את הבעיה שנתקלתם בה..."
                rows={7}
                style={{ width: "100%", padding: "10px 14px", border: `1px solid ${T.lineStrong}`, borderRadius: "10px", fontSize: "0.88rem", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", direction: "rtl" }}
              />
            </div>

            {error && (
              <div style={{ backgroundColor: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: T.redFg }}>
                {error}
              </div>
            )}
            {sent && (
              <div style={{ backgroundColor: T.greenSBg, border: `1px solid ${T.greenSBorder}`, borderRadius: "8px", padding: "10px 14px", fontSize: "0.85rem", color: T.greenSFg }}>
                ההודעה נשלחה בהצלחה! נחזור אליך בהקדם.
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !message.trim()}
              style={{ background: sending || !message.trim() ? T.muted2 : T.inverseBg, color: T.inverseText, fontWeight: 700, padding: "11px 0", borderRadius: "10px", border: "none", cursor: sending || !message.trim() ? "not-allowed" : "pointer", fontSize: "0.9rem" }}
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
