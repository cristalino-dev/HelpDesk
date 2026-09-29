/**
 * app/api/admin/docs/route.ts — the IT documentation shelf, listed (v3.99).
 *
 * GET → { docs: DocFile[] } — every document under uploads/it-docs/, in the
 * order the panel shows them. ADMINS ONLY: these are the team's internal
 * write-ups, including a security runbook.
 *
 * The bytes come from GET /api/admin/docs/[name].
 */

import { auth } from "@/auth"
import { logError } from "@/lib/logError"
import { listDocs } from "@/lib/docStorage"
import { sortDocs } from "@/lib/docs"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    return NextResponse.json({ docs: sortDocs(await listDocs()) })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/docs GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
