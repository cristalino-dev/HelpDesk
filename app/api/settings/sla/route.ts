/**
 * GET /api/settings/sla — the SLA per ticket type (v3.87).
 *
 * Any signed-in user: every queue needs it to mark what is overdue, and it is
 * not a secret. Admins change it with PUT /api/admin/settings/sla.
 *
 *   200 — { ticket: 4, request: 10 }   (workdays)
 *   401 — not signed in
 */

import { auth } from "@/auth"
import { getSla } from "@/lib/sla"
import { logError } from "@/lib/logError"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json(await getSla())
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/settings/sla GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
