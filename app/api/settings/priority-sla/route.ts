/**
 * GET /api/settings/priority-sla — the SLA per internal priority (v3.107).
 *
 * Staff only — isAdmin or STAFF_EMAILS (rule 26). The internal priority is the
 * helpdesk's own and never reaches a reporter, so neither do its targets.
 * Admins change them with PUT /api/admin/settings/priority-sla.
 *
 *   200 — { P1: 4, P2: 8, P3: 48, P4: 96, P5: 240 }   (hours, Sunday–Thursday)
 *   401 — not signed in        403 — not staff
 */

import { auth } from "@/auth"
import { getPrioritySla } from "@/lib/sla"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json(await getPrioritySla())
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/settings/priority-sla GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
