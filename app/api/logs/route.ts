/**
 * app/api/logs/route.ts — Error Log API
 *
 * ENDPOINTS:
 * ───────────
 *   POST  /api/logs  — Write a log entry to the database (open to any caller)
 *   GET   /api/logs  — Fetch log entries for a given date (admins only)
 *
 * ARCHITECTURE:
 * ──────────────
 * This route is the collection point for ALL error events in the system:
 *
 *   Server-side errors   → API routes call logError() from lib/logError.ts,
 *                          which writes directly to the DB (does NOT call
 *                          this HTTP endpoint — avoids network round-trip).
 *
 *   Client-side errors   → ErrorBoundary and ClientErrorHandler POST to
 *                          this endpoint with level="error".
 *
 * The admin logs tab (app/admin/page.tsx) reads from GET /api/logs.
 *
 * AUTO-CLEANUP:
 * ──────────────
 * Every POST call triggers a cleanup pass that deletes all Log rows whose
 * `date` field is more than 30 days in the past. This is a simple and
 * effective rolling-window retention policy without needing a scheduled task.
 * The cleanup is done after the insert, so even if it fails the new log
 * entry is already saved.
 *
 * DATABASE TABLE SCHEMA (Log):
 * ─────────────────────────────
 * id        String    CUID primary key
 * timestamp DateTime  When the event occurred (auto, server time)
 * level     String    "error" | "warn" | "info" (currently only "error" used)
 * message   String    Error message (max 2000 chars enforced in logError.ts)
 * source    String?   Origin of the error (URL path or component name)
 * stack     String?   Stack trace (max 5000 chars)
 * date      String    "YYYY-MM-DD" — used for filtering and cleanup
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/logs
 *
 * Records a single error event. This endpoint is intentionally permissive —
 * no authentication is required — so that client-side errors from the login
 * page (before the user has a session) can also be captured.
 *
 * After writing the record, performs the 30-day cleanup sweep.
 * If anything fails, returns { ok: false } with a 500 — never throws to
 * the caller, since logging infrastructure should never break user flows.
 *
 * REQUEST BODY (JSON):
 *   message  {string}  The error message (required). Truncated to 2000 chars.
 *   source   {string?} Where the error came from (e.g. window.location.pathname)
 *   stack    {string?} Stack trace. Truncated to 5000 chars.
 *   level    {string?} Severity. Defaults to "error".
 *
 * RESPONSE: { ok: true } or { ok: false } with status 500
 */
export async function POST(req: NextRequest) {
  try {
    const { message, source, stack, level = "error" } = await req.json()

    // Today's date string used for the date bucket and cleanup comparison
    const today = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

    await prisma.log.create({
      data: {
        message: String(message).slice(0, 2000),
        source,
        stack: stack ? String(stack).slice(0, 5000) : undefined,
        level,
        date: today,
      },
    })

    // 30-day rolling cleanup: remove entries whose date string is less than
    // the cutoff date string. String comparison works correctly for ISO dates.
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffDate = cutoff.toISOString().slice(0, 10) // "YYYY-MM-DD"

    await prisma.log.deleteMany({
      where: { date: { lt: cutoffDate } },
    })

    return NextResponse.json({ ok: true })
  } catch {
    // Never expose internal details; the important thing is the calling
    // component knows logging failed and can decide how to handle it.
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

/**
 * GET /api/logs?date=YYYY-MM-DD
 *
 * Returns all log entries for the specified date, ordered by timestamp
 * ascending (oldest first — so the log reads chronologically top-to-bottom).
 * If no `date` query parameter is provided, defaults to today.
 *
 * This endpoint is used exclusively by the admin logs tab to populate the
 * dark terminal textarea with the day's error log.
 *
 * QUERY PARAMETERS:
 *   date  {string?}  ISO date string "YYYY-MM-DD". Defaults to today.
 *
 * RESPONSE BODY (JSON array of Log objects):
 *   id        {string}   CUID
 *   timestamp {string}   ISO datetime
 *   level     {string}   "error" | "warn" | "info"
 *   message   {string}   Error message
 *   source    {string?}  Origin
 *   stack     {string?}  Stack trace
 *   date      {string}   "YYYY-MM-DD" bucket
 *
 * RESPONSES:
 *   200 — Array of log entries (may be empty)
 *   403 — Not an admin
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

  const logs = await prisma.log.findMany({
    where: { date },
    orderBy: { timestamp: "asc" }, // Chronological order for log readability
  })

  return NextResponse.json(logs)
}
