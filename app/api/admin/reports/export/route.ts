/**
 * app/api/admin/reports/export/route.ts — the workbook behind the export button
 *
 * GET /api/admin/reports/export?scope=all
 *                              ?scope=range&from=YYYY-MM-DD&to=YYYY-MM-DD
 *                              ?scope=ticket&ticket=565
 *
 * Admin-only, like the reports page it belongs to. Returns a real .xlsx built
 * by lib/xlsx — no dependency, no temporary file, no CSV (Excel eats the
 * leading zero of a phone number in a CSV; see that file's header).
 *
 * The browser downloads this by navigating to the URL, so the whole client side
 * of the feature is a link. That also means the response has to carry
 * Content-Disposition, and that errors have to be readable in a browser tab —
 * a JSON body is what a fetch would want, but nobody is fetching this.
 *
 * `closedAt` is resolved exactly as in the reports route: the LATEST transition
 * to "סגור", and only for tickets closed now. The two must agree, or the
 * spreadsheet and the chart above it tell different stories about the same day.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { CLOSED } from "@/lib/reports"
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx"
import {
  EXPORT_COLUMNS, applyScope, parseScope, exportFilename, sheetName,
  type ExportRow,
} from "@/lib/reportExport"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const scope = parseScope(new URL(req.url).searchParams)
    if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: 400 })

    // A single ticket is fetched as one row rather than filtered out of the
    // whole table — the common case for this scope is "send me that one".
    const where = scope.kind === "ticket" ? { ticketNumber: scope.ticketNumber } : {}

    const [tickets, closeRows] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { ticketNumber: "asc" },
        select: {
          id: true, ticketNumber: true, subject: true, description: true,
          status: true, urgency: true, category: true, platform: true,
          phone: true, computerName: true, assignedTo: true, createdAt: true,
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.ticketHistory.findMany({
        where: { field: "status", newValue: CLOSED },
        select: { ticketId: true, changedAt: true },
        orderBy: { changedAt: "asc" }, // ascending: the last write wins below
      }),
    ])

    const lastClose = new Map<string, Date>()
    for (const row of closeRows) lastClose.set(row.ticketId, row.changedAt)

    const rows: ExportRow[] = tickets.map(t => ({
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      description: t.description,
      status: t.status,
      urgency: t.urgency,
      category: t.category,
      platform: t.platform,
      submitterName: t.user?.name ?? "",
      submitterEmail: t.user?.email ?? "",
      phone: t.phone,
      computerName: t.computerName,
      assignedTo: t.assignedTo,
      createdAt: t.createdAt.toISOString(),
      closedAt: t.status === CLOSED ? (lastClose.get(t.id)?.toISOString() ?? null) : null,
    }))

    const scoped = applyScope(rows, scope)
    const file = buildXlsx(EXPORT_COLUMNS, scoped, sheetName(scope))
    const name = exportFilename(scope)

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        // filename* as well as filename: the plain one is ASCII-safe for old
        // clients, the encoded one is what carries a Hebrew name intact.
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(file.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/reports/export GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
