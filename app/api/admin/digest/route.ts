/**
 * app/api/admin/digest/route.ts — Daily Digest Email Endpoint
 *
 * Called every morning by a server cron job (09:00 Israel time).
 * Sends all non-closed tickets, sorted by priority, to every address
 * in STAFF_EMAILS.
 *
 * AUTHENTICATION
 * ─────────────
 * No session cookie — this is a machine-to-machine call from cron.
 * Protected by a shared secret in the `x-digest-secret` request header.
 * Set DIGEST_SECRET in .env / .env.local.
 *
 * RESPONSE
 * ────────
 *   200  { sent: true,  count: N }           — email dispatched
 *   200  { sent: false, reason: "no open tickets" }
 *   401  { error: "Unauthorized" }
 *   500  { error: "Server error" }
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma }         from "@/lib/db"
import { sendMail, mailDailyDigest } from "@/lib/mail"
import { STAFF_EMAILS }   from "@/lib/staffEmails"
import { logError }       from "@/lib/logError"

const URGENCY_RANK: Record<string, number> = {
  "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3,
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret   = req.headers.get("x-digest-secret")
  const expected = process.env.DIGEST_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // ── Fetch open tickets ────────────────────────────────────────────────────
    const tickets = await prisma.ticket.findMany({
      where:   { status: { not: "סגור" } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    })

    // Sort by urgency priority, then oldest-first within same priority
    tickets.sort((a, b) => {
      const pd = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
      if (pd !== 0) return pd
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    if (tickets.length === 0) {
      console.log("[digest] no open tickets — skipping email")
      return NextResponse.json({ sent: false, reason: "no open tickets" })
    }

    // ── Send email ────────────────────────────────────────────────────────────
    const subject = `📋 סיכום יומי — ${tickets.length} פניות פתוחות`
    await sendMail({ to: STAFF_EMAILS, subject, html: mailDailyDigest(tickets) })

    console.log(`[digest] sent ${tickets.length} tickets to ${STAFF_EMAILS.join(", ")}`)
    return NextResponse.json({ sent: true, count: tickets.length })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/digest POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
