/**
 * app/api/admin/printers/drivers/route.ts — Printer driver upload/remove (admin)
 *
 * Driver files live on the server filesystem (lib/printerStorage); this route
 * writes/removes the file and the PrinterDriver metadata row together.
 *
 * ENDPOINTS:
 *   POST   /api/admin/printers/drivers  — multipart/form-data upload.
 *          Fields: printerId (text), file (the driver). Returns the new driver.
 *   DELETE /api/admin/printers/drivers  — Body: { id }. Removes file + row.
 *
 * Downloads are served by ./[id]/route.ts (GET).
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import {
  MAX_DRIVER_BYTES, buildStoredName, isAllowedDriverExt,
  saveDriverFile, deleteDriverFile,
} from "@/lib/printerStorage"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const form = await req.formData()
    const printerId = form.get("printerId")
    const file = form.get("file")

    if (typeof printerId !== "string" || !printerId) {
      return NextResponse.json({ error: "printerId is required" }, { status: 400 })
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "נדרש קובץ דרייבר" }, { status: 400 })
    }
    if (file.size > MAX_DRIVER_BYTES) {
      return NextResponse.json({ error: `הקובץ גדול מדי (מקסימום ${Math.round(MAX_DRIVER_BYTES / (1024 * 1024))}MB)` }, { status: 413 })
    }
    if (!isAllowedDriverExt(file.name)) {
      return NextResponse.json({ error: "סוג קובץ לא נתמך (zip, exe, msi, inf, cab, rar, 7z...)" }, { status: 400 })
    }

    // Ensure the printer exists before writing anything to disk.
    const printer = await prisma.printer.findUnique({ where: { id: printerId } })
    if (!printer) return NextResponse.json({ error: "מדפסת לא נמצאה" }, { status: 404 })

    const storedName = buildStoredName(file.name)
    const buffer = Buffer.from(await file.arrayBuffer())
    await saveDriverFile(storedName, buffer)

    try {
      const driver = await prisma.printerDriver.create({
        data: {
          printerId,
          filename: file.name,
          storedName,
          size: file.size,
          mimeType: file.type || null,
        },
      })
      return NextResponse.json(driver)
    } catch (dbErr) {
      // DB write failed — don't leave an orphan file on disk.
      await deleteDriverFile(storedName)
      throw dbErr
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers/drivers POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const driver = await prisma.printerDriver.findUnique({ where: { id } })
    if (!driver) return NextResponse.json({ error: "דרייבר לא נמצא" }, { status: 404 })

    await deleteDriverFile(driver.storedName)
    await prisma.printerDriver.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers/drivers DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
