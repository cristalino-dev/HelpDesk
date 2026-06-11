/**
 * app/api/staff/route.ts — Effective staff roster for assignment + @mentions
 *
 * GET /api/staff  — Returns the current staff roster: all DB users with
 *                   isAdmin = true (and only them — revoking admin removes a
 *                   user from the roster). Hardcoded STAFF_MEMBERS only supply
 *                   curated handles/display names for matching admins.
 *                   Available to any staff member (admin or hardcoded staff
 *                   email). Used by /admin, /tickets, and /tickets/[id] to
 *                   populate the assignment dropdown and @mention chips.
 *
 * RESPONSE: StaffMember[] — [{ email, handle, display }, ...]
 */

import { auth } from "@/auth"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { getAllStaffMembers } from "@/lib/staffMembers"
import { logError } from "@/lib/logError"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const members = await getAllStaffMembers()
    return NextResponse.json(members)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/staff GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
