/**
 * app/api/staff/route.ts — Effective staff roster for assignment + @mentions
 *
 * GET /api/staff  — Returns the merged staff roster (hardcoded STAFF_MEMBERS +
 *                   all DB users with isAdmin = true). Available to any staff
 *                   member (admin or hardcoded staff email). Used by the ticket
 *                   pages to populate the assignment dropdown and the @mention
 *                   shortcut chips so newly-promoted admins appear automatically.
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
