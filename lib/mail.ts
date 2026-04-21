/**
 * lib/mail.ts — Email sending via Google Workspace SMTP (Nodemailer)
 *
 * All outbound mail goes through sendMail(). If SMTP_USER / SMTP_PASS are
 * not set the function is a no-op, so the app works locally without mail.
 *
 * Required env vars (add to .env.local and to the server):
 *   SMTP_USER   helpdesk@cristalino.co.il
 *   SMTP_PASS   <Google App Password — 16 chars, no spaces>
 */

import nodemailer from "nodemailer"
import { logError } from "@/lib/logError"

const FROM    = '"מערכת הפניות" <helpdesk@cristalino.co.il>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.cristalino.co.il"

// Always build fresh from env — no singleton caching so env vars are always read
function createTransporter() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS
    auth: { user, pass },
  })
}

interface MailOptions {
  to: string | string[]
  subject: string
  html: string
}

export async function sendMail({ to, subject, html }: MailOptions) {
  const transporter = createTransporter()
  if (!transporter) {
    console.warn("[mail] SMTP_USER / SMTP_PASS not set — skipping email")
    return
  }

  const recipients = Array.isArray(to) ? to : [to]
  if (recipients.length === 0) return

  try {
    await transporter.sendMail({ from: FROM, to: recipients, subject, html })
    console.log(`[mail] sent "${subject}" → ${recipients.join(", ")}`)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    console.error("[mail] send failed:", e.message)
    // Log to admin error log so it appears in the logs tab
    await logError(`Mail send failed: ${e.message}`, `sendMail → "${subject}"`, e.stack).catch(() => {})
  }
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function ticketUrl(ticketNumber: number) {
  return `${APP_URL}/tickets/HDTC-${ticketNumber}`
}

export function reviewUrl(ticketId: string) {
  return `${APP_URL}/review/${ticketId}`
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────

function wrap(body: string) {
  return `<!DOCTYPE html><html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 24px; direction: rtl; }
  .card { background: #fff; border-radius: 12px; padding: 28px 32px; max-width: 560px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { font-size: 20px; font-weight: 700; color: #1e3a8a; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 14px; }
  .field { margin-bottom: 12px; }
  .label { font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .value { font-size: 15px; color: #111827; margin-top: 2px; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563eb; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; }
  .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 20px; }
</style></head>
<body><div class="card">${body}</div>
<div class="footer">מערכת הפניות – Cristalino &nbsp;|&nbsp; helpdesk.cristalino.co.il</div>
</body></html>`
}

// ── Urgency / status colours (inline for email clients) ──────────────────────

const URGENCY_COLOR: Record<string, string> = {
  "נמוך":   "background:#dcfce7;color:#166534",
  "בינוני": "background:#fef3c7;color:#92400e",
  "גבוה":   "background:#ffedd5;color:#9a3412",
  "דחוף":   "background:#fee2e2;color:#991b1b",
}
const STATUS_COLOR: Record<string, string> = {
  "פתוח":   "background:#dbeafe;color:#1e40af",
  "בטיפול": "background:#fef3c7;color:#92400e",
  "סגור":   "background:#dcfce7;color:#166534",
}

// ── Email templates ───────────────────────────────────────────────────────────

interface TicketInfo {
  id: string
  ticketNumber: number
  subject: string
  description: string
  urgency: string
  category: string
  platform: string
  phone: string
  computerName: string
  status: string
  submitterName: string
  submitterEmail: string
}

/** Sent to all staff when a new ticket is opened */
export function mailTicketOpenedStaff(t: TicketInfo) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">🎫 פנייה חדשה נפתחה</div>
    <div class="field"><div class="label">נושא</div><div class="value">${t.subject}</div></div>
    <div class="field"><div class="label">מגיש</div><div class="value">${t.submitterName} &lt;${t.submitterEmail}&gt;</div></div>
    <div class="field"><div class="label">טלפון</div><div class="value">${t.phone || "—"}</div></div>
    <div class="field"><div class="label">מחשב</div><div class="value">${t.computerName || "—"}</div></div>
    <div class="field"><div class="label">קטגוריה / פלטפורמה</div><div class="value">${t.category} · ${t.platform}</div></div>
    <div class="field">
      <div class="label">דחיפות</div>
      <div class="value"><span class="badge" style="${URGENCY_COLOR[t.urgency] ?? ""}">${t.urgency}</span></div>
    </div>
    <div class="field"><div class="label">תיאור</div><div class="value" style="white-space:pre-wrap">${t.description}</div></div>
    <a class="btn" href="${url}">פתח פנייה ←</a>
  `)
}

/** Sent to the user who opened the ticket */
export function mailTicketOpenedUser(t: TicketInfo) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">✅ פנייתך התקבלה</div>
    <p style="color:#374151;font-size:15px">שלום ${t.submitterName},<br>פנייתך התקבלה בהצלחה. צוות התמיכה יטפל בה בהקדם.</p>
    <div class="field"><div class="label">נושא</div><div class="value">${t.subject}</div></div>
    <div class="field">
      <div class="label">דחיפות</div>
      <div class="value"><span class="badge" style="${URGENCY_COLOR[t.urgency] ?? ""}">${t.urgency}</span></div>
    </div>
    <div class="field"><div class="label">מספר פנייה</div><div class="value" style="font-family:monospace;font-size:13px">HDTC-${t.ticketNumber}</div></div>
    <a class="btn" href="${url}">צפה בפנייה ←</a>
  `)
}

/** Sent to all staff on any field update (status, urgency, etc.) */
export function mailTicketUpdatedStaff(t: TicketInfo, changedBy: string) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">🔄 פנייה עודכנה</div>
    <div class="field"><div class="label">עודכן על ידי</div><div class="value">${changedBy}</div></div>
    <div class="field"><div class="label">נושא</div><div class="value">${t.subject}</div></div>
    <div class="field"><div class="label">מגיש</div><div class="value">${t.submitterName}</div></div>
    <div class="field">
      <div class="label">סטטוס</div>
      <div class="value"><span class="badge" style="${STATUS_COLOR[t.status] ?? ""}">${t.status}</span></div>
    </div>
    <div class="field">
      <div class="label">דחיפות</div>
      <div class="value"><span class="badge" style="${URGENCY_COLOR[t.urgency] ?? ""}">${t.urgency}</span></div>
    </div>
    <a class="btn" href="${url}">פתח פנייה ←</a>
  `)
}

/** Sent to the user when their ticket moves to בטיפול */
export function mailTicketStatusUser(t: TicketInfo) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">📬 עדכון על פנייתך</div>
    <p style="color:#374151;font-size:15px">שלום ${t.submitterName},<br>פנייתך נמצאת כעת בטיפול הצוות הטכני.</p>
    <div class="field"><div class="label">נושא</div><div class="value">${t.subject}</div></div>
    <div class="field">
      <div class="label">סטטוס חדש</div>
      <div class="value"><span class="badge" style="${STATUS_COLOR["בטיפול"]}">${"בטיפול"}</span></div>
    </div>
    <a class="btn" href="${url}">צפה בפנייה ←</a>
  `)
}

/**
 * Sent when a ticket is closed — includes a prominent CTA to rate the service.
 * The review link uses the ticket's CUID as an unguessable token so no auth is needed.
 */
export function mailTicketClosedWithReview(t: TicketInfo) {
  const ticketLink = ticketUrl(t.ticketNumber)
  const rateLink   = reviewUrl(t.id)
  return wrap(`
    <div class="header">✅ פנייתך טופלה וסגורה</div>
    <p style="color:#374151;font-size:15px">שלום ${t.submitterName},<br>
      פנייה <strong style="font-family:monospace">HDTC-${t.ticketNumber}</strong> — <strong>${t.subject}</strong> — טופלה ונסגרה על ידי צוות התמיכה.
    </p>
    <div style="margin:24px 0;padding:22px 24px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:12px;border:1px solid #bbf7d0;text-align:center">
      <div style="font-size:26px;margin-bottom:8px">⭐</div>
      <div style="font-size:17px;font-weight:800;color:#166534;margin-bottom:6px">איך היה השירות?</div>
      <div style="font-size:13px;color:#4b5563;margin-bottom:18px;line-height:1.6">שניה מזמנכם תעזור לנו להשתפר.<br>דרגו את חוויית התמיכה שלכם.</div>
      <a href="${rateLink}" style="display:inline-block;padding:13px 32px;background:#16a34a;color:#fff!important;text-decoration:none;border-radius:9px;font-weight:800;font-size:15px;letter-spacing:0.01em">דרגו את השירות ←</a>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0">
      אם הבעיה חזרה, <a href="${ticketLink}" style="color:#2563eb">לחצו כאן לפתיחת פנייה חדשה</a>.
    </p>
  `)
}

/** Sent to ticket owner when a staff member posts a message */
export function mailNewMessageToUser(t: TicketInfo, messageContent: string, fromName: string) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">💬 תגובה חדשה על פנייתך</div>
    <p style="color:#374151;font-size:15px">שלום ${t.submitterName},<br>${fromName} מצוות התמיכה הגיב על פנייתך:</p>
    <div class="field"><div class="label">נושא הפנייה</div><div class="value">${t.subject}</div></div>
    <div class="field"><div class="label">תגובה</div>
      <div class="value" style="background:#f0f9ff;border-right:3px solid #2563eb;padding:10px 14px;border-radius:6px;white-space:pre-wrap">${messageContent}</div>
    </div>
    <p style="color:#6b7280;font-size:13px">ניתן להגיב דרך המערכת.</p>
    <a class="btn" href="${url}">פתח פנייה וענה ←</a>
  `)
}

/** Sent to all staff when a user posts a message on a ticket */
export function mailNewMessageToStaff(t: TicketInfo, messageContent: string, fromName: string) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">💬 תגובת משתמש על פנייה</div>
    <p style="color:#374151;font-size:15px">${fromName} הגיב על פנייה:</p>
    <div class="field"><div class="label">נושא</div><div class="value">${t.subject}</div></div>
    <div class="field"><div class="label">מגיש</div><div class="value">${t.submitterName} &lt;${t.submitterEmail}&gt;</div></div>
    <div class="field"><div class="label">תגובה</div>
      <div class="value" style="background:#f9fafb;border-right:3px solid #6b7280;padding:10px 14px;border-radius:6px;white-space:pre-wrap">${messageContent}</div>
    </div>
    <a class="btn" href="${url}">פתח פנייה ←</a>
  `)
}

/** Sent to a specific person when someone replies directly to their message */
export function mailReplyNotification(t: TicketInfo, replyContent: string, fromName: string, toName: string, messageId: string) {
  const url = `${ticketUrl(t.ticketNumber)}#msg-${messageId}`
  return wrap(`
    <div class="header">↩ ${fromName} ענה לך בפנייה</div>
    <p style="color:#374151;font-size:15px">שלום ${toName},<br><strong>${fromName}</strong> ענה להודעתך בפנייה <strong>"${t.subject}"</strong>:</p>
    <div class="field">
      <div class="label">תגובה</div>
      <div class="value" style="background:#f0f9ff;border-right:3px solid #2563eb;padding:10px 14px;border-radius:6px;white-space:pre-wrap">${replyContent}</div>
    </div>
    <a class="btn" href="${url}">לחץ כאן לצפייה בתגובה ←</a>
    <div style="margin-top:20px;padding:14px 18px;background:#fff7ed;border:2px solid #f97316;border-radius:10px;text-align:center">
      <div style="font-size:17px;font-weight:900;color:#c2410c;letter-spacing:0.01em;margin-bottom:6px">⚠️ אין להשיב למייל זה</div>
      <div style="font-size:13px;color:#9a3412;font-weight:600;line-height:1.6">מייל זה נשלח אוטומטית ואינו מנוטר.<br>כדי להשיב — לחץ על הכפתור הכחול למעלה ורשום תגובה במערכת.</div>
    </div>
  `)
}

// ── Daily digest ─────────────────────────────────────────────────────────────

interface DigestTicket {
  ticketNumber: number
  subject: string
  urgency: string
  status: string
  createdAt: string | Date
  user?: { name?: string | null; email?: string | null } | null
}

const URGENCY_RANK_DIGEST: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }

/**
 * Sent every morning to all staff with a table of all non-closed tickets,
 * sorted by priority (דחוף → גבוה → בינוני → נמוך) then by age (oldest first).
 * Stale tickets (open > 4 days) are highlighted in red.
 */
export function mailDailyDigest(tickets: DigestTicket[]) {
  const STALE_MS = 4 * 24 * 60 * 60 * 1000

  const daysSince = (d: string | Date) => {
    const days = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))
    return days === 0 ? "היום" : `${days} ימים`
  }

  const sorted = [...tickets].sort((a, b) => {
    const pd = (URGENCY_RANK_DIGEST[a.urgency] ?? 2) - (URGENCY_RANK_DIGEST[b.urgency] ?? 2)
    if (pd !== 0) return pd
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const staleCount  = sorted.filter(t => (Date.now() - new Date(t.createdAt).getTime()) > STALE_MS).length
  const urgentCount = sorted.filter(t => t.urgency === "דחוף").length
  const highCount   = sorted.filter(t => t.urgency === "גבוה").length

  const tableRows = sorted.map(t => {
    const ageMs  = Date.now() - new Date(t.createdAt).getTime()
    const isStale = ageMs > STALE_MS
    const age     = daysSince(t.createdAt)
    const url     = ticketUrl(t.ticketNumber)
    const uc      = URGENCY_COLOR[t.urgency] ?? "background:#f3f4f6;color:#374151"
    const ageStyle = isStale ? "color:#dc2626;font-weight:700" : "color:#6b7280"
    const rowBg    = isStale ? "background:#fff8f0" : "background:#fff"
    return `
      <tr style="${rowBg};border-bottom:1px solid #f3f4f6">
        <td style="padding:9px 8px;white-space:nowrap">
          <a href="${url}" style="color:#2563eb;font-weight:700;text-decoration:none;font-size:12px">HDTC-${t.ticketNumber}</a>
        </td>
        <td style="padding:9px 8px;font-size:13px;color:#111827;max-width:220px">${t.subject}</td>
        <td style="padding:9px 8px;white-space:nowrap">
          <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;${uc}">${t.urgency}</span>
        </td>
        <td style="padding:9px 8px;font-size:12px;${ageStyle}">${age}${isStale ? " ⏰" : ""}</td>
        <td style="padding:9px 8px;font-size:12px;color:#6b7280">${t.user?.name ?? t.user?.email ?? "—"}</td>
      </tr>`
  }).join("")

  const now = new Date().toLocaleDateString("he-IL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jerusalem",
  })

  const summaryCards = [
    `<div style="background:#eff6ff;border-radius:10px;padding:10px 16px;text-align:center;min-width:72px">
       <div style="font-size:22px;font-weight:800;color:#2563eb">${tickets.length}</div>
       <div style="font-size:11px;color:#6b7280;margin-top:2px">סה״כ פתוחות</div>
     </div>`,
    urgentCount > 0
      ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:10px 16px;text-align:center;min-width:72px">
           <div style="font-size:22px;font-weight:800;color:#dc2626">${urgentCount}</div>
           <div style="font-size:11px;color:#6b7280;margin-top:2px">דחוף 🔴</div>
         </div>`
      : "",
    highCount > 0
      ? `<div style="background:#fff7ed;border-radius:10px;padding:10px 16px;text-align:center;min-width:72px">
           <div style="font-size:22px;font-weight:800;color:#ea580c">${highCount}</div>
           <div style="font-size:11px;color:#6b7280;margin-top:2px">גבוה 🟠</div>
         </div>`
      : "",
    staleCount > 0
      ? `<div style="background:#fff8f0;border:1px solid #fdba74;border-radius:10px;padding:10px 16px;text-align:center;min-width:72px">
           <div style="font-size:22px;font-weight:800;color:#c2410c">${staleCount}</div>
           <div style="font-size:11px;color:#6b7280;margin-top:2px">⏰ 4+ ימים</div>
         </div>`
      : "",
  ].filter(Boolean).join("")

  return wrap(`
    <div class="header">📋 סיכום יומי — פניות פתוחות</div>
    <p style="color:#6b7280;font-size:13px;margin:0 0 16px">${now}</p>

    <div style="display:flex;gap:10px;margin-bottom:22px;flex-wrap:wrap">${summaryCards}</div>

    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb">
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">מס׳</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">נושא</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">דחיפות</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">גיל</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;font-weight:700">מגיש</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>

    <a class="btn" href="${APP_URL}/tickets">פתח את לוח הפניות ←</a>
  `)
}

/** Sent to a mentioned staff member when they are @mentioned in a note */
export function mailNoteMention(t: TicketInfo, noteContent: string, mentionedBy: string) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div class="header">💬 הוזכרת בהערה</div>
    <p style="color:#374151;font-size:15px">${mentionedBy} הזכיר אותך בהערה על פנייה:</p>
    <div class="field"><div class="label">נושא הפנייה</div><div class="value">${t.subject}</div></div>
    <div class="field"><div class="label">תוכן ההערה</div>
      <div class="value" style="background:#f9fafb;border-right:3px solid #6366f1;padding:10px 14px;border-radius:6px;white-space:pre-wrap">${noteContent}</div>
    </div>
    <a class="btn" href="${url}">פתח פנייה ←</a>
  `)
}
