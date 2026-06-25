/**
 * app/api/admin/printers/drivers/[id]/route.ts — Driver file download (admin)
 *
 * GET /api/admin/printers/drivers/:id
 *   Streams the driver file from disk with a Content-Disposition that forces a
 *   download under the original filename. Admin-only (the browser sends the
 *   session cookie automatically when the link is followed).
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { driverDiskPath } from "@/lib/printerStorage"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import { Readable } from "stream"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const driver = await prisma.printerDriver.findUnique({ where: { id } })
    if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const filePath = driverDiskPath(driver.storedName)
    let size: number
    try {
      size = (await stat(filePath)).size
    } catch {
      return NextResponse.json({ error: "הקובץ חסר בשרת" }, { status: 410 })
    }

    // ASCII fallback + RFC 5987 UTF-8 filename* for Hebrew/Unicode names.
    const asciiName = driver.filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")
    const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(driver.filename)}`

    const webStream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
    return new Response(webStream, {
      headers: {
        "Content-Type": driver.mimeType || "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": disposition,
      },
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers/drivers/[id] GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
