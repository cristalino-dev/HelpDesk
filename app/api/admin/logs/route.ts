/**
 * app/api/admin/logs/route.ts — Admin Error Log Management API
 * 
 * PURPOSE:
 * ─────────
 * This API provides technical staff and administrators with access to the
 * system's error logs. It handles both high-level summaries and detailed
 * event data, supporting the "Error Monitoring Dashboard".
 * 
 * SECURITY:
 * ──────────
 * - GET: Restricted to users in STAFF_EMAILS or with isAdmin=true.
 * - DELETE: Strictly restricted to users with isAdmin=true.
 * 
 * ENDPOINTS:
 * ───────────
 * GET /api/admin/logs
 *   - Fetches up to 200 of the most recent log entries.
 *   - Supports filtering by date (YYYY-MM-DD) via query parameter.
 *   - Returns logs in descending chronological order (newest first).
 * 
 * DELETE /api/admin/logs
 *   - Truncates the entire Log table.
 *   - Used for periodic maintenance and manual cleanup of resolved issues.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { STAFF_EMAILS } from "@/lib/staffEmails"

/**
 * GET /api/admin/logs
 * 
 * Fetches the latest 200 log entries from the database.
 * Accessible to Staff and Admins.
 * 
 * Query Params:
 *  - date: string (YYYY-MM-DD) - filter by specific date (optional)
 * 
 * Returns: JSON array of Log entries.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const isStaff = session?.user?.email && STAFF_EMAILS.includes(session.user.email)
  const isAdmin = session?.user?.isAdmin

  if (!isStaff && !isAdmin) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date")

  try {
    const logs = await prisma.log.findMany({
      where: date ? { date } : undefined,
      orderBy: { timestamp: "desc" },
      take: 200,
    })
    return NextResponse.json(logs)
  } catch (error) {
    console.error("Failed to fetch logs:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

/**
 * DELETE /api/admin/logs
 * 
 * Clears all log entries.
 * Restricted to Admins only.
 */
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    await prisma.log.deleteMany({})
    return new NextResponse("Logs cleared", { status: 200 })
  } catch (error) {
    console.error("Failed to clear logs:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
