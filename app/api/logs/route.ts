/**
 * app/api/logs/route.ts — Client-Side Error Log Collector
 *
 * ENDPOINT:
 * ──────────
 *   POST /api/logs — Receives error events from the browser (open to all).
 *
 * ARCHITECTURE:
 * ──────────────
 * This endpoint allows the client-side (ErrorBoundary, ClientErrorHandler)
 * to report errors even before a user is logged in. 
 * 
 * Server-side errors bypass this route and use lib/logError.ts directly
 * for efficiency.
 *
 * AUTO-CLEANUP:
 * ──────────────
 * To maintain a lightweight database, every POST request triggers a 
 * background cleanup that deletes log entries older than 30 days.
 */

import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/logs
 * 
 * Records a client-side error. 
 * Body: { message: string, source?: string, stack?: string, level?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { message, source, stack, level = "error" } = await req.json()
    const today = new Date().toISOString().slice(0, 10)

    // 1. Create the new log entry
    await prisma.log.create({
      data: {
        message: String(message).slice(0, 2000),
        source,
        stack: stack ? String(stack).slice(0, 5000) : undefined,
        level,
        date: today,
      },
    })

    // 2. Perform 30-day rolling cleanup (asynchronous sweep)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffDate = cutoff.toISOString().slice(0, 10)

    // We don't await this to keep the response fast for the client
    prisma.log.deleteMany({
      where: { date: { lt: cutoffDate } },
    }).catch(err => console.error("Log cleanup failed:", err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
