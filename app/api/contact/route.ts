/**
 * app/api/contact/route.ts — Contact Email API
 *
 * ENDPOINT:
 * ──────────
 *   POST  /api/contact  — Send an email to the development team
 *
 * PURPOSE:
 * ─────────
 * When users encounter problems with the HelpDesk application itself
 * (bugs, UI issues, login problems), they can use /contact to send an email
 * directly to the development team at dev@cristalino.co.il.
 *
 * This is distinct from the ticket system, which handles IT support requests.
 * The contact form is for reporting issues with the HelpDesk software itself.
 *
 * EMAIL FORMAT:
 * ──────────────
 * From:    "HelpDesk System" <SMTP_FROM>  (the app's sending address)
 * To:      dev@cristalino.co.il           (hardcoded — this is the dev's inbox)
 * Reply-To: "Name" <user@cristalino.co.il>  (so the dev can reply directly)
 * Subject: HelpDesk Issues               (hardcoded — makes it easy to filter)
 * Body:    Plain text + HTML (RTL-aware)
 *
 * SMTP CONFIGURATION:
 * ────────────────────
 * The following environment variables must be set in .env / .env.local:
 *
 *   SMTP_HOST   — Mail server hostname (e.g. smtp.gmail.com, smtp.office365.com)
 *   SMTP_PORT   — Port number (587 for STARTTLS, 465 for SSL, 25 for plain)
 *   SMTP_USER   — SMTP authentication username (usually the sending email)
 *   SMTP_PASS   — SMTP authentication password or app-specific password
 *   SMTP_FROM   — The "From" address shown in the email (defaults to SMTP_USER)
 *
 * If any of the first four are missing, the endpoint returns HTTP 503 (Service
 * Unavailable). The /contact page shows an appropriate message in this case.
 *
 * SECURITY:
 * ──────────
 * - Authentication required (prevents spam from unauthenticated sources)
 * - The sender's email and name come from the session (Google OAuth),
 *   NOT from the request body — users cannot spoof "From" identity
 * - Message is set to `text/html` with proper escaping of newlines
 */

import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

/**
 * POST /api/contact
 *
 * Sends an email from the authenticated user to the development team.
 * The "From" identity is always derived from the session, not user input.
 *
 * REQUEST BODY (JSON):
 *   message  {string}  The body of the message (required, must be non-empty)
 *
 * RESPONSE: { ok: true } on success
 *
 * ERROR RESPONSES:
 *   400 — Missing or empty message
 *   401 — Not authenticated
 *   503 — SMTP not configured (missing environment variables)
 *   500 — SMTP transport error or unexpected failure
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { message } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 })

  // Sender identity comes from the Google OAuth session — cannot be forged
  const senderName = session.user.name ?? session.user.email ?? "Unknown"
  const senderEmail = session.user.email ?? ""

  // Read SMTP configuration from environment variables
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = Number(process.env.SMTP_PORT ?? "587")
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser // Fall back to SMTP_USER if FROM not set

  // Guard: refuse to attempt delivery if configuration is incomplete
  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 503 })
  }

  // Create a fresh transporter for each request (stateless — no connection pooling
  // needed for infrequent contact form submissions)
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for port 465 (SSL), false for 587 (STARTTLS)
    auth: { user: smtpUser, pass: smtpPass },
  })

  await transporter.sendMail({
    from: `"HelpDesk System" <${smtpFrom}>`,
    to: "dev@cristalino.co.il",             // Fixed destination — dev team inbox
    replyTo: `"${senderName}" <${senderEmail}>`, // Dev can Reply-To the employee directly
    subject: "HelpDesk Issues",             // Fixed subject for easy inbox filtering
    // Plain text fallback for email clients that don't render HTML
    text: `From: ${senderName} <${senderEmail}>\n\n${message}`,
    // HTML version with RTL direction and line break conversion
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
      <p><strong>מאת:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
      <hr/>
      <p>${message.replace(/\n/g, "<br/>")}</p>
    </div>`,
  })

  return NextResponse.json({ ok: true })
}
