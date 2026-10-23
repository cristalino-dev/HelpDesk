/**
 * PUT /api/admin/settings/priority-sla — change the SLA per internal priority (v3.107).
 *
 * Admins only. Body: { P1, P2, P3, P4, P5 } — whole hours on the
 * Sunday–Thursday clock, 1–1440 each (1440 = 60 workdays).
 *
 *   200 — the stored SLA, { P1, …, P5 }
 *   400 — a value that is not a whole number of hours in range (Hebrew error)
 *   401 — not signed in        403 — not an admin
 *
 * The change is written to the log, like the per-type SLA.
 */

import { auth } from "@/auth"
import { getPrioritySla, setPrioritySla } from "@/lib/sla"
import { logError, logInfo } from "@/lib/logError"
import {
  INTERNAL_PRIORITIES, PRIORITY_SLA_MAX_HOURS, PRIORITY_SLA_MIN_HOURS, parseSlaHours, type PrioritySla,
} from "@/lib/internalPriority"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const next = {} as PrioritySla
    for (const p of INTERNAL_PRIORITIES) {
      const hours = parseSlaHours(body?.[p])
      if (hours === null) {
        return NextResponse.json(
          { error: `זמן טיפול הוא מספר שלם של שעות, בין ${PRIORITY_SLA_MIN_HOURS} ל-${PRIORITY_SLA_MAX_HOURS}` },
          { status: 400 },
        )
      }
      next[p] = hours
    }

    const before = await getPrioritySla()
    const saved = await setPrioritySla(next)
    const changes = INTERNAL_PRIORITIES.filter(p => before[p] !== saved[p]).map(p => `${p} ${before[p]}→${saved[p]}`)
    await logInfo(
      `Priority SLA changed by ${session.user.name ?? session.user.email}: ${changes.join(", ") || "no change"} hours`,
      "/api/admin/settings/priority-sla PUT",
    )
    return NextResponse.json(saved)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/settings/priority-sla PUT", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
