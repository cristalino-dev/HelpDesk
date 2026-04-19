/**
 * app/review/[ticketId]/page.tsx — Service Rating Page
 *
 * PURPOSE:
 * ─────────
 * Public feedback page linked from the ticket-closed email.
 * No authentication is required — the ticket's CUID in the URL acts as an
 * unguessable access token (sent only to the ticket owner via email).
 *
 * STATES:
 * ────────
 *  loading    — fetching ticket info + existing review from GET /api/reviews?ticket=
 *  notFound   — ticket doesn't exist
 *  notClosed  — ticket exists but is not yet closed
 *  rating     — the interactive rating form (new OR editing existing review)
 *  submitting — waiting for POST / PATCH to complete
 *  done       — thank-you screen after first submission
 *  updated    — confirmation screen after updating an existing review
 *
 * EDIT FLOW:
 * ──────────
 * When the user already submitted a review, the page loads their previous
 * rating and comment into the form and shows an "עורכים ביקורת קיימת" banner.
 * Submitting calls PATCH instead of POST. There is no longer a dead-end
 * "already reviewed" screen.
 */

"use client"
import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"

type State = "loading" | "notFound" | "notClosed" | "rating" | "submitting" | "done" | "updated"

interface TicketInfo {
  ticketNumber: number
  subject: string
  status: string
  createdAt: string
}

interface ExistingReview {
  id: string
  rating: number
  comment: string | null
}

const STAR_LABELS = ["", "גרוע", "לא טוב", "בסדר", "טוב", "מעולה!"]

export default function ReviewPage({ params }: { params: { ticketId: string } }) {
  const { ticketId } = params

  const [state,          setState]          = useState<State>("loading")
  const [ticket,         setTicket]         = useState<TicketInfo | null>(null)
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null)
  const [rating,         setRating]         = useState(0)
  const [hovered,        setHovered]        = useState(0)
  const [comment,        setComment]        = useState("")
  const [error,          setError]          = useState("")

  const isUpdate = existingReview !== null

  useEffect(() => {
    fetch(`/api/reviews?ticket=${encodeURIComponent(ticketId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setState("notFound"); return }
        setTicket(data.ticket)
        if (data.ticket.status !== "סגור") { setState("notClosed"); return }
        if (data.existingReview) {
          // Pre-populate form with previous values so the user can edit them
          setExistingReview(data.existingReview)
          setRating(data.existingReview.rating)
          setComment(data.existingReview.comment ?? "")
        }
        setState("rating")
      })
      .catch(() => setState("notFound"))
  }, [ticketId])

  const submit = async () => {
    if (rating === 0) { setError("אנא בחרו דירוג לפני השליחה"); return }
    setError("")
    setState("submitting")
    const res = await fetch("/api/reviews", {
      method: isUpdate ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, rating, comment }),
    })
    if (res.ok) {
      setState(isUpdate ? "updated" : "done")
    } else {
      const d = await res.json()
      setError(d.error ?? "שגיאה בשליחה")
      setState("rating")
    }
  }

  const active = hovered || rating

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0fdf4 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 20px",
      direction: "rtl",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
    }}>

      {/* Logo / header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <Image src="/logo.jpeg" alt="Cristalino" width={44} height={44} style={{ borderRadius: 8, objectFit: "contain" }} />
        <span style={{ fontWeight: 700, color: "#1e3a8a", fontSize: "1rem" }}>מערכת helpdesk</span>
      </div>

      <div style={{
        background: "#fff",
        borderRadius: 20,
        padding: "40px 40px 36px",
        maxWidth: 480,
        width: "100%",
        boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
        border: "1px solid #e5e7eb",
        textAlign: "center",
      }}>

        {/* ── Loading ── */}
        {state === "loading" && (
          <div style={{ padding: "20px 0", color: "#9ca3af" }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0 }}>טוען...</p>
          </div>
        )}

        {/* ── Not found ── */}
        {state === "notFound" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
            <h2 style={{ margin: "0 0 10px", color: "#1f2937", fontSize: "1.2rem" }}>הפנייה לא נמצאה</h2>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: "0.9rem" }}>הקישור אינו תקין או שהפנייה נמחקה.</p>
            <Link href="/dashboard" style={{ color: "#2563eb", fontSize: "0.88rem" }}>חזרה ללוח הבקרה</Link>
          </>
        )}

        {/* ── Not closed yet ── */}
        {state === "notClosed" && ticket && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h2 style={{ margin: "0 0 10px", color: "#1f2937", fontSize: "1.2rem" }}>הפנייה עדיין פתוחה</h2>
            <p style={{ margin: "0 0 6px", color: "#6b7280", fontSize: "0.9rem" }}>HDTC-{ticket.ticketNumber}: {ticket.subject}</p>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: "0.85rem" }}>ניתן לדרג את השירות רק לאחר סגירת הפנייה.</p>
            <Link href="/dashboard" style={{ color: "#2563eb", fontSize: "0.88rem" }}>חזרה ללוח הבקרה</Link>
          </>
        )}

        {/* ── Rating form (new or editing) ── */}
        {(state === "rating" || state === "submitting") && ticket && (
          <>
            {/* Edit banner — shown only when updating an existing review */}
            {isUpdate && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                backgroundColor: "#fffbeb", border: "1px solid #fde68a",
                borderRadius: 8, padding: "7px 14px", marginBottom: 20,
                fontSize: "0.78rem", fontWeight: 600, color: "#92400e",
              }}>
                <span>✏️</span>
                <span>עורכים ביקורת קיימת — שינויים יחליפו את הדירוג הקודם</span>
              </div>
            )}

            {/* Ticket pill */}
            <div style={{ display: "inline-block", backgroundColor: "#eff6ff", color: "#1e40af", borderRadius: 8, padding: "3px 12px", fontSize: "0.75rem", fontWeight: 700, marginBottom: 20 }}>
              HDTC-{ticket.ticketNumber}
            </div>

            <h1 style={{ margin: "0 0 8px", fontSize: "1.4rem", fontWeight: 800, color: "#1f2937", lineHeight: 1.3 }}>
              {isUpdate ? "עדכנו את הביקורת שלכם" : "איך היה השירות?"}
            </h1>
            <p style={{ margin: "0 0 6px", color: "#374151", fontSize: "0.95rem", fontWeight: 500 }}>
              {ticket.subject}
            </p>
            <p style={{ margin: "0 0 28px", color: "#9ca3af", fontSize: "0.82rem" }}>
              {isUpdate ? "שנו את הדירוג או ההערה ולחצו שמור" : "שניה מזמנכם תעזור לנו להשתפר"}
            </p>

            {/* Stars */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  disabled={state === "submitting"}
                  style={{
                    background: "none", border: "none",
                    cursor: state === "submitting" ? "default" : "pointer",
                    padding: "4px",
                    fontSize: n <= active ? "2.4rem" : "2rem",
                    transition: "font-size 0.1s, filter 0.1s",
                    filter: n <= active ? "none" : "grayscale(1) opacity(0.35)",
                    lineHeight: 1,
                  }}
                >
                  ⭐
                </button>
              ))}
            </div>

            {/* Star label */}
            <div style={{ height: 22, marginBottom: 20, fontSize: "0.88rem", fontWeight: 600, color: active >= 4 ? "#16a34a" : active >= 3 ? "#d97706" : active >= 1 ? "#dc2626" : "transparent" }}>
              {active > 0 ? STAR_LABELS[active] : "."}
            </div>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              disabled={state === "submitting"}
              placeholder="הוסיפו הערה (לא חובה)..."
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1px solid #e5e7eb", borderRadius: 10,
                padding: "10px 14px", fontSize: "0.88rem", color: "#374151",
                resize: "vertical", fontFamily: "inherit", direction: "rtl",
                outline: "none", marginBottom: 6,
              }}
            />

            {error && <p style={{ margin: "0 0 12px", color: "#dc2626", fontSize: "0.82rem" }}>{error}</p>}

            <button
              onClick={submit}
              disabled={state === "submitting"}
              style={{
                width: "100%", padding: "13px",
                background: state === "submitting" ? "#9ca3af" : isUpdate
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : "linear-gradient(135deg, #16a34a, #15803d)",
                color: "#fff", border: "none", borderRadius: 10,
                fontWeight: 800, fontSize: "0.95rem",
                cursor: state === "submitting" ? "default" : "pointer",
                marginTop: 8,
                boxShadow: state === "submitting" ? "none"
                  : isUpdate ? "0 4px 14px rgba(37,99,235,0.35)"
                  : "0 4px 14px rgba(22,163,74,0.35)",
                transition: "all 0.15s",
              }}
            >
              {state === "submitting" ? "שומר..." : isUpdate ? "שמרו עדכון" : "שלחו ביקורת"}
            </button>
          </>
        )}

        {/* ── Done / first submission ── */}
        {state === "done" && (
          <>
            <div style={{ fontSize: 52, marginBottom: 16, animation: "pop 0.3s ease" }}>🎉</div>
            <h2 style={{ margin: "0 0 10px", color: "#166534", fontSize: "1.35rem", fontWeight: 800 }}>תודה רבה!</h2>
            <p style={{ margin: "0 0 6px", color: "#374151", fontSize: "0.95rem" }}>
              {rating >= 4 ? "שמחים שיכולנו לעזור 😊" : "נקח את המשוב שלכם לשיפור השירות."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, margin: "14px 0 20px" }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ fontSize: "1.4rem", filter: n <= rating ? "none" : "grayscale(1) opacity(0.25)" }}>⭐</span>
              ))}
            </div>
            <Link href="/dashboard" style={{ display: "inline-block", padding: "10px 24px", background: "#2563eb", color: "#fff", textDecoration: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.88rem" }}>
              חזרה ללוח הבקרה
            </Link>
          </>
        )}

        {/* ── Updated / edited confirmation ── */}
        {state === "updated" && (
          <>
            <div style={{ fontSize: 52, marginBottom: 16, animation: "pop 0.3s ease" }}>✅</div>
            <h2 style={{ margin: "0 0 10px", color: "#1e40af", fontSize: "1.35rem", fontWeight: 800 }}>הביקורת עודכנה!</h2>
            <p style={{ margin: "0 0 6px", color: "#374151", fontSize: "0.95rem" }}>
              הדירוג החדש שלכם נשמר בהצלחה.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, margin: "14px 0 20px" }}>
              {[1,2,3,4,5].map(n => (
                <span key={n} style={{ fontSize: "1.4rem", filter: n <= rating ? "none" : "grayscale(1) opacity(0.25)" }}>⭐</span>
              ))}
            </div>
            <Link href="/dashboard" style={{ display: "inline-block", padding: "10px 24px", background: "#2563eb", color: "#fff", textDecoration: "none", borderRadius: 9, fontWeight: 700, fontSize: "0.88rem" }}>
              חזרה ללוח הבקרה
            </Link>
          </>
        )}
      </div>

      <p style={{ marginTop: 24, color: "#9ca3af", fontSize: "0.78rem" }}>
        © Cristalino Group — HelpDesk System
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pop  { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  )
}
