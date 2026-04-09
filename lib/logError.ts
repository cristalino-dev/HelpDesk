/**
 * lib/logError.ts — Server-Side Error Logging Helper
 *
 * PURPOSE:
 * ─────────
 * Provides a single, consistent way for server-side code (API routes) to
 * persist error information to the `Log` database table. All caught exceptions
 * in API routes should call this function before returning a 500 response.
 *
 * CLIENT-SIDE logging is handled separately by:
 *   - components/ErrorBoundary.tsx  — React render errors
 *   - components/ClientErrorHandler.tsx — window.onerror + promise rejections
 * Both post directly to POST /api/logs.
 *
 * DATABASE TABLE: Log
 * ────────────────────
 * id        — CUID, auto-generated primary key
 * timestamp — when the error occurred (default: now())
 * level     — severity string, defaults to "error"
 * message   — the error message (truncated to 2000 chars)
 * source    — where the error came from (e.g. "/api/tickets POST")
 * stack     — full stack trace (truncated to 5000 chars)
 * date      — "YYYY-MM-DD" string used for day-bucket queries and 30-day cleanup
 *
 * AUTO-CLEANUP:
 * ──────────────
 * Logs older than 30 days are deleted automatically by /api/logs POST handler
 * each time a new log entry is written. This keeps the table small without
 * needing a cron job.
 *
 * USAGE:
 * ──────
 *   import { logError } from "@/lib/logError"
 *
 *   try {
 *     // ... database work ...
 *   } catch (err) {
 *     const e = err instanceof Error ? err : new Error(String(err))
 *     await logError(e.message, "/api/example POST", e.stack)
 *     return NextResponse.json({ error: "Server error" }, { status: 500 })
 *   }
 *
 * SILENT FAILURE:
 * ────────────────
 * logError itself never throws. If the database is unavailable, the error
 * is silently swallowed — the calling route's own error handling still runs
 * and the user still gets a 500 response.
 */

import { prisma } from "@/lib/db"

/**
 * Writes an error record to the Log table.
 *
 * @param message - The error message (required). Truncated to 2000 characters.
 * @param source  - Identifies where the error occurred, e.g. "/api/tickets POST".
 *                  Stored in Log.source for filtering in the admin logs tab.
 * @param stack   - Optional stack trace string. Truncated to 5000 characters.
 */
export async function logError(message: string, source?: string, stack?: string) {
  try {
    // Build the date string used for day-bucket queries (admin date picker)
    // and the 30-day rolling cleanup performed by /api/logs POST.
    const today = new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"

    await prisma.log.create({
      data: {
        level: "error",
        message: String(message).slice(0, 2000),
        source,
        // Only store stack if provided; avoids storing null vs. undefined confusion
        stack: stack ? String(stack).slice(0, 5000) : undefined,
        date: today,
      },
    })
  } catch {
    // Intentionally silent — logging must never cause a secondary failure.
    // The calling route handles the original error independently.
  }
}
