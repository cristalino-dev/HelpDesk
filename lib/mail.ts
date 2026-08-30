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
import { BOT_EMAIL } from "@/lib/staffEmails"
import { T, STATUS as STATUS_THEME, URGENCY as URGENCY_THEME } from "@/lib/theme"

const FROM    = '"מערכת הפניות" <helpdesk@cristalino.co.il>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.cristalino.co.il"

/**
 * Brand tokens, read from the same `lib/theme.ts` the app renders with, so a
 * change to the palette moves the mail too instead of leaving it on a stale
 * copy. They are pulled into local constants because every one of them has to
 * be interpolated inline — email clients support neither CSS variables nor a
 * reliable <style> block (see the note on wrap()).
 */
const C = {
  dark:     T.dark,        // header bar, primary button
  green:    T.green,       // accent rule, logo dot, ticket chip
  greenInk: T.greenInk,
  greenBg:  T.greenBg,
  page:     T.bg,          // page background behind the card
  card:     T.card,
  panel:    T.cardMuted,   // details panel fill
  border:   T.border,
  text:     T.text,
  text2:    T.text2,
  label:    T.text3,       // field labels
  muted:    T.muted,       // footer
} as const

/**
 * Escapes text interpolated into the mail HTML. Ticket subjects and
 * descriptions are free text typed by users; an unescaped `<` there truncates
 * the rest of the message in most clients.
 */
function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

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

  // The automation bot is a virtual assignee, not a real mailbox — never mail
  // it (e.g. status-change emails go to the ticket's assignee, which may be the
  // bot). Filtering here covers every send path centrally.
  const recipients = (Array.isArray(to) ? to : [to]).filter(addr => addr !== BOT_EMAIL)
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

/**
 * NOTE ON RTL: Gmail (and most email clients) strip the <html>/<body> tags and
 * the <style> block's body rules, so `dir` on <html> and `direction` on body
 * are NOT reliable. The `dir="rtl"` attribute + inline direction/text-align
 * must be ON THE CONTENT DIVS themselves — that's what makes Hebrew mails
 * render right-aligned everywhere.
 */
function wrap(body: string, ticketNumber?: number) {
  const chip = ticketNumber === undefined ? "" : `<span style="display:inline-block;padding:5px 13px;border-radius:20px;background:rgba(116,197,58,0.14);border:1px solid rgba(116,197,58,0.45);color:${C.green};font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;letter-spacing:0.04em;white-space:nowrap">HDTC-${ticketNumber}</span>`

  return `<!DOCTYPE html><html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  .header { font-size: 19px; font-weight: 800; color: ${C.text}; margin: 0 0 18px; padding-bottom: 14px; border-bottom: 2px solid ${C.border}; }
  .field { margin-bottom: 14px; }
  .label { font-size: 11px; font-weight: 700; color: ${C.label}; text-transform: uppercase; letter-spacing: 0.06em; }
  .value { font-size: 15px; color: ${C.text}; margin-top: 3px; line-height: 1.55; }
  .badge { display: inline-block; padding: 4px 13px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .btn { display: inline-block; margin-top: 22px; padding: 13px 28px; background: ${C.dark}; color: #fff !important; text-decoration: none; border-radius: 9px; font-weight: 700; font-size: 15px; }
</style></head>
<body dir="rtl" style="direction:rtl;text-align:right;margin:0;padding:0;background:${C.page};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};padding:26px 12px;font-family:Arial,Helvetica,sans-serif">
  <tr><td align="center">

    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden">
      <tr><td style="background:${C.dark};padding:16px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="right" dir="rtl" style="text-align:right;vertical-align:middle">
            <span style="color:#ffffff;font-size:17px;font-weight:800;letter-spacing:-0.01em">helpdesk</span><span style="color:${C.green};font-size:24px;line-height:0">.</span>
            <span style="color:#A9AEA8;font-size:12px">&nbsp;Cristalino</span>
          </td>
          <td align="left" style="text-align:left;vertical-align:middle">${chip}</td>
        </tr></table>
      </td></tr>

      <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.green}">&nbsp;</td></tr>

      <tr><td dir="rtl" style="direction:rtl;text-align:right;padding:26px 28px 30px">${body}</td></tr>
    </table>

    <div dir="rtl" style="direction:rtl;text-align:center;font-size:11px;color:${C.muted};margin-top:16px;line-height:1.7">
      מערכת הפניות – Cristalino &nbsp;|&nbsp; <a href="${APP_URL}" style="color:${C.muted};text-decoration:none">helpdesk.cristalino.co.il</a>
    </div>

  </td></tr>
</table>
</body></html>`
}

// ── Inline-styled building blocks ────────────────────────────────────────────
//
// The <style> block above is a convenience, not a guarantee: Outlook renders
// through Word and several mobile clients drop <style> entirely. Anything that
// carries meaning is therefore built here with inline styles instead of classes.

/** A bordered panel of label/value rows — the "frame" around the ticket facts. */
function details(rows: [label: string, value: string][]) {
  const cells = rows.map(([label, value], i) => {
    const border = i === rows.length - 1 ? "" : `border-bottom:1px solid ${C.border};`
    return `<tr><td style="padding:10px 14px;${border}">
        <div dir="rtl" style="direction:rtl;text-align:right;font-size:11px;font-weight:700;color:${C.label};letter-spacing:0.06em">${label}</div>
        <div dir="rtl" style="direction:rtl;text-align:right;font-size:15px;color:${C.text};margin-top:3px;line-height:1.55">${value}</div>
      </td></tr>`
  }).join("")

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.panel};border:1px solid ${C.border};border-radius:10px;margin:0 0 18px">${cells}</table>`
}

/** Coloured pill for an urgency or status value. */
function badge(text: string, colors: string) {
  return `<span style="display:inline-block;padding:4px 13px;border-radius:20px;font-size:12px;font-weight:700;${colors}">${esc(text)}</span>`
}

/** Primary call-to-action. Dark on brand, as in the app. */
function button(href: string, text: string) {
  return `<div style="text-align:center;margin:24px 0 4px"><a href="${href}" style="display:inline-block;padding:13px 30px;background:${C.dark};color:#ffffff !important;text-decoration:none;border-radius:9px;font-weight:700;font-size:15px">${text}</a></div>`
}

// ── Urgency / status colours (inline for email clients) ──────────────────────

/**
 * Derived from the same maps the app renders pills with, so a דחוף pill in the
 * inbox is the same colour as the one on the ticket. Deriving rather than
 * keeping a second hand-written copy also picks up "בהמתנה", which the copy
 * here was missing — an on-hold ticket used to mail an uncoloured pill.
 */
const URGENCY_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(URGENCY_THEME).map(([k, v]) => [k, `background:${v.bg};color:${v.fg}`]),
)
const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_THEME).map(([k, v]) => [k, `background:${v.bg};color:${v.fg}`]),
)

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
    <div dir="rtl" style="direction:rtl;text-align:right;font-size:20px;font-weight:800;color:${C.text};margin:0 0 4px">🎫 פנייה חדשה נפתחה</div>
    <div dir="rtl" style="direction:rtl;text-align:right;font-size:13px;color:${C.text2};margin:0 0 20px">
      פנייה <strong style="font-family:'Courier New',Courier,monospace;color:${C.greenInk}">HDTC-${t.ticketNumber}</strong> ממתינה לטיפול.
    </div>

    <div dir="rtl" style="direction:rtl;text-align:right;font-size:17px;font-weight:700;color:${C.text};margin:0 0 14px;line-height:1.45">${esc(t.subject)}</div>

    ${details([
      ["מגיש", `${esc(t.submitterName)} &lt;${esc(t.submitterEmail)}&gt;`],
      ["טלפון", esc(t.phone) || "—"],
      ["מחשב", esc(t.computerName) || "—"],
      ["קטגוריה / פלטפורמה", `${esc(t.category)} · ${esc(t.platform)}`],
      ["דחיפות", badge(t.urgency, URGENCY_COLOR[t.urgency] ?? "")],
    ])}

    <div dir="rtl" style="direction:rtl;text-align:right;font-size:11px;font-weight:700;color:${C.label};letter-spacing:0.06em;margin:0 0 6px">תיאור</div>
    <div dir="rtl" style="direction:rtl;text-align:right;background:${C.panel};border-right:3px solid ${C.green};border-radius:8px;padding:12px 15px;font-size:14px;color:${C.text};line-height:1.65;white-space:pre-wrap">${esc(t.description)}</div>

    ${button(url, "פתח פנייה ←")}
  `, t.ticketNumber)
}

/** Sent to the user who opened the ticket */
export function mailTicketOpenedUser(t: TicketInfo) {
  const url = ticketUrl(t.ticketNumber)
  return wrap(`
    <div dir="rtl" style="direction:rtl;text-align:right;font-size:20px;font-weight:800;color:${C.text};margin:0 0 12px">✅ פנייתך התקבלה</div>
    <div dir="rtl" style="direction:rtl;text-align:right;font-size:15px;color:${C.text2};line-height:1.7;margin:0 0 20px">
      שלום ${esc(t.submitterName)},<br>פנייתך נקלטה במערכת וצוות התמיכה יטפל בה בהקדם.
    </div>

    <div dir="rtl" style="direction:rtl;text-align:center;background:${C.greenBg};border:1px solid rgba(116,197,58,0.40);border-radius:10px;padding:16px;margin:0 0 18px">
      <div style="font-size:11px;font-weight:700;color:${C.greenInk};letter-spacing:0.06em;margin-bottom:4px">מספר הפנייה שלך</div>
      <div style="font-family:'Courier New',Courier,monospace;font-size:24px;font-weight:700;color:${C.greenInk};letter-spacing:0.03em">HDTC-${t.ticketNumber}</div>
    </div>

    ${details([
      ["נושא", esc(t.subject)],
      ["דחיפות", badge(t.urgency, URGENCY_COLOR[t.urgency] ?? "")],
    ])}

    ${button(url, "צפה בפנייה ←")}
  `, t.ticketNumber)
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
  `, t.ticketNumber)
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
  `, t.ticketNumber)
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
      אם הבעיה חזרה, <a href="${ticketLink}" style="color:${C.greenInk}">לחצו כאן לפתיחת פנייה חדשה</a>.
    </p>
  `, t.ticketNumber)
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
  `, t.ticketNumber)
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
  `, t.ticketNumber)
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
      <div style="font-size:13px;color:#9a3412;font-weight:600;line-height:1.6">מייל זה נשלח אוטומטית ואינו מנוטר.<br>כדי להשיב — לחץ על הכפתור למעלה ורשום תגובה במערכת.</div>
    </div>
  `, t.ticketNumber)
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
  `, t.ticketNumber)
}
