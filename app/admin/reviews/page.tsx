/**
 * app/admin/reviews/page.tsx — Service Reviews Dashboard
 *
 * PURPOSE:
 * ─────────
 * Displays all user-submitted service ratings, sorted newest-first.
 * Accessible only to admins (isAdmin === true) and staff in STAFF_EMAILS.
 *
 * FEATURES:
 * ──────────
 * • Summary bar — total reviews, average star rating, distribution badges
 * • Sortable list — sorted by createdAt DESC (newest first, server-side)
 * • Each row: star rating, ticket ref, submitter, comment, date
 * • No pagination — all reviews loaded at once (reasonable for this scale)
 */

"use client"
import { useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import FooterCopyright from "@/components/FooterCopyright"

interface Review {
  id: string
  ticketId: string
  rating: number
  comment: string | null
  submitterName: string
  submitterEmail: string
  createdAt: string
  ticket: {
    ticketNumber: number
    subject: string
  }
}

function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: size, filter: i <= n ? "none" : "grayscale(1) opacity(0.25)" }}>⭐</span>
      ))}
    </span>
  )
}

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
}

export default function ReviewsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    if (status === "authenticated" && !session?.user?.isAdmin) router.push("/dashboard")
  }, [status, session, router])

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.isAdmin) return
    fetch("/api/reviews")
      .then(r => r.json())
      .then(data => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false))
  }, [status, session])

  if (status === "loading") return null

  // ── Computed stats ──
  const total = reviews.length
  const avg   = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0
  const dist  = [5, 4, 3, 2, 1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length }))

  const RATING_COLOR: Record<number, { bg: string; color: string }> = {
    5: { bg: "#dcfce7", color: "#166534" },
    4: { bg: "#d1fae5", color: "#065f46" },
    3: { bg: "#fef3c7", color: "#92400e" },
    2: { bg: "#ffedd5", color: "#9a3412" },
    1: { bg: "#fee2e2", color: "#991b1b" },
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5" }}>

      {/* ── Header ── */}
      <header style={{ background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px", boxShadow: "0 4px 16px rgba(79,70,229,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>מערכת helpdesk</span>
          <span style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)" }}>ביקורות שירות</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/logo.jpeg" alt="Cristalino" width={44} height={44} style={{ objectFit: "contain", borderRadius: 6 }} />
          <Link href="/admin" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>← ניהול פניות</Link>
          <Link href="/dashboard" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.75)", textDecoration: "none" }}>לוח משתמש</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#fff" }}>
              {initials(session?.user?.name)}
            </div>
            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{session?.user?.name}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.65)", background: "none", border: "none", cursor: "pointer" }}>יציאה</button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Summary cards ── */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {/* Total */}
            <div style={{ backgroundColor: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>סה״כ ביקורות</div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "#1f2937" }}>{total}</div>
            </div>
            {/* Average */}
            <div style={{ backgroundColor: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>ציון ממוצע</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "2rem", fontWeight: 800, color: avg >= 4 ? "#16a34a" : avg >= 3 ? "#d97706" : "#dc2626" }}>
                  {total ? avg.toFixed(1) : "—"}
                </span>
                {total > 0 && <span style={{ fontSize: "1.4rem" }}>⭐</span>}
              </div>
            </div>
            {/* Distribution */}
            <div style={{ backgroundColor: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>פילוח</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {dist.map(({ n, count }) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6b7280", width: 14, textAlign: "left" }}>{n}</span>
                    <span style={{ fontSize: "0.72rem" }}>⭐</span>
                    <div style={{ flex: 1, height: 6, backgroundColor: "#f3f4f6", borderRadius: 999 }}>
                      <div style={{ height: 6, borderRadius: 999, backgroundColor: RATING_COLOR[n].bg.replace("bg",""), background: n >= 4 ? "#22c55e" : n === 3 ? "#f59e0b" : "#ef4444", width: total ? `${(count / total) * 100}%` : "0%" }} />
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "#9ca3af", width: 16, textAlign: "left" }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── List header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937" }}>כל הביקורות</h2>
          {!loading && total > 0 && (
            <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>ממוינות לפי תאריך — חדשות ראשון</span>
          )}
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#4f46e5", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען ביקורות...</p>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && total === 0 && (
          <div style={{ textAlign: "center", padding: "60px 24px", backgroundColor: "#fff", borderRadius: 16, border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>⭐</div>
            <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#374151" }}>אין ביקורות עדיין</p>
            <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.85rem" }}>ביקורות יופיעו כאן לאחר שמשתמשים ידרגו פניות סגורות</p>
          </div>
        )}

        {/* ── Reviews list ── */}
        {!loading && reviews.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {reviews.map(review => {
              const col = RATING_COLOR[review.rating] ?? RATING_COLOR[3]
              const dateStr = new Date(review.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
              return (
                <div key={review.id} style={{ backgroundColor: "#fff", borderRadius: 12, border: "1px solid #f3f4f6", borderRight: `4px solid ${review.rating >= 4 ? "#22c55e" : review.rating === 3 ? "#f59e0b" : "#ef4444"}`, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>

                    {/* Left: rating + ticket + comment */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                        <Stars n={review.rating} size={15} />
                        <span style={{ ...col, padding: "2px 10px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700 }}>
                          {review.rating}/5
                        </span>
                        <a href={`/tickets/HDTC-${review.ticket.ticketNumber}`} style={{ fontSize: "0.72rem", fontWeight: 700, color: "#2563eb", background: "#eff6ff", borderRadius: 6, padding: "1px 8px", textDecoration: "none" }}>
                          HDTC-{review.ticket.ticketNumber}
                        </a>
                        <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {review.ticket.subject}
                        </span>
                      </div>
                      {review.comment && (
                        <p style={{ margin: "8px 0 0", padding: "10px 14px", background: "#f9fafb", borderRadius: 8, fontSize: "0.88rem", color: "#374151", lineHeight: 1.6, borderRight: "3px solid #e5e7eb" }}>
                          &quot;{review.comment}&quot;
                        </p>
                      )}
                    </div>

                    {/* Right: submitter + date */}
                    <div style={{ textAlign: "left", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {initials(review.submitterName)}
                        </div>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>{review.submitterName}</span>
                      </div>
                      <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{dateStr}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <FooterCopyright />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
