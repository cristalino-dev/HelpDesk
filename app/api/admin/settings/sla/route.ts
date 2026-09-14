/**
 * PUT /api/admin/settings/sla — change the SLA per ticket type (v3.87).
 *
 * Admins only. Body: { ticket, request } — whole workdays, 1–60 each.
 *
 *   200 — the stored SLA, { ticket, request }
 *   400 — a value that is not a whole number of workdays in range (Hebrew error)
 *   401 — not signed in        403 — not an admin
 *
 * The change is written to the log, so "who made requests overdue after two
 * days" has an answer.
 */

import { auth } from "@/auth"
import { getSla, setSla } from "@/lib/sla"
import { logError, logInfo } from "@/lib/logError"
import { SLA_MAX_WORKDAYS, SLA_MIN_WORKDAYS, parseSlaWorkdays } from "@/lib/ticketType"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = (await req.json().catch(() => null)) as { ticket?: unknown; request?: unknown } | null
    const ticket = parseSlaWorkdays(body?.ticket)
    const request = parseSlaWorkdays(body?.request)
    if (ticket === null || request === null) {
      return NextResponse.json(
        { error: `זמן טיפול הוא מספר שלם של ימי עבודה, בין ${SLA_MIN_WORKDAYS} ל-${SLA_MAX_WORKDAYS}` },
        { status: 400 },
      )
    }

    const before = await getSla()
    const saved = await setSla({ ticket, request })
    await logInfo(
      `SLA changed by ${session.user.name ?? session.user.email}: ticket ${before.ticket}→${saved.ticket}, request ${before.request}→${saved.request} workdays`,
      "/api/admin/settings/sla PUT",
    )
    return NextResponse.json(saved)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/settings/sla PUT", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
