/**
 * app/api/admin/sweep/route.ts — Closed Ticket Urgency Sweep Endpoint
 *
 * PURPOSE:
 * ─────────
 * Runs periodically (every 5 minutes via server cron job) to ensure that
 * any ticket marked as closed (status "סגור") has its urgency set to "נמוך".
 * This serves as a safety net to maintain the compound-close invariant even if
 * tickets are closed via direct database manipulation or legacy code paths.
 *
 * AUTHENTICATION:
 * ────────────────
 * Protected by a secret key in the `x-sweep-secret` request header.
 * Looks for SWEEP_SECRET in the environment, falling back to DIGEST_SECRET.
 *
 * RESPONSE:
 * ──────────
 *   200 — { ok: true, count: N }  — where N is the number of corrected tickets
 *   401 — Unauthorized
 *   500 — Server error (logged via logError)
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"

export async function POST(req: NextRequest) {
  // Validate request secret
  const secret = req.headers.get("x-sweep-secret")
  const expected = process.env.SWEEP_SECRET || process.env.DIGEST_SECRET

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Perform sweep update
    const result = await prisma.ticket.updateMany({
      where: {
        status: "סגור",
        urgency: { not: "נמוך" },
      },
      data: {
        urgency: "נמוך",
      },
    })

    return NextResponse.json({ ok: true, count: result.count })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/sweep POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
