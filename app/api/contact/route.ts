import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { message } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 })

  const senderName = session.user.name ?? session.user.email ?? "Unknown"
  const senderEmail = session.user.email ?? ""

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = Number(process.env.SMTP_PORT ?? "587")
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ error: "SMTP not configured" }, { status: 503 })
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  await transporter.sendMail({
    from: `"HelpDesk System" <${smtpFrom}>`,
    to: "dev@cristalino.co.il",
    replyTo: `"${senderName}" <${senderEmail}>`,
    subject: "HelpDesk Issues",
    text: `From: ${senderName} <${senderEmail}>\n\n${message}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">
      <p><strong>מאת:</strong> ${senderName} &lt;${senderEmail}&gt;</p>
      <hr/>
      <p>${message.replace(/\n/g, "<br/>")}</p>
    </div>`,
  })

  return NextResponse.json({ ok: true })
}
