/**
 * app/api/admin/printers/route.ts — Printer inventory management (admin only)
 *
 * Powers the "מדפסות" tab in the admin panel. Stores the company's printers
 * with their network details, supplier and required ink/toner. Driver files
 * are handled by the sibling route /api/admin/printers/drivers.
 *
 * ENDPOINTS:
 *   GET    /api/admin/printers  — list all printers (name asc) incl. drivers
 *   POST   /api/admin/printers  — create one printer. Body: { name, maker?,
 *                                 model?, supplier?, ipv4?, hostname?, inkToner?,
 *                                 tonerLevel? }
 *   PATCH  /api/admin/printers  — update one printer by id (same optional fields)
 *   DELETE /api/admin/printers  — Body: { id }. Also removes its driver files.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { deleteDriverFile } from "@/lib/printerStorage"
import { NextRequest, NextResponse } from "next/server"

/** undefined = don't touch; null or blank = clear; else trimmed value. */
const optional = (v: string | null | undefined) => {
  if (v === undefined) return undefined
  if (v === null) return null
  return v.trim() || null
}

/** Clamp an integer 0–100, or null if out of range / not provided. */
const clampToner = (v: number | null | undefined): number | null => {
  if (v == null) return null
  const n = Math.round(v)
  return n >= 0 && n <= 100 ? n : null
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const printers = await prisma.printer.findMany({
      orderBy: [{ name: "asc" }],
      include: { drivers: { orderBy: { createdAt: "asc" } } },
    })
    return NextResponse.json(printers)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { name, maker, model, supplier, ipv4, hostname, inkToner, tonerLevel, supplierSerial } = await req.json() as {
      name: string; maker?: string; model?: string; supplier?: string
      ipv4?: string; hostname?: string; inkToner?: string; tonerLevel?: number | null; supplierSerial?: string
    }

    if (!name?.trim()) return NextResponse.json({ error: "נדרש שם מדפסת" }, { status: 400 })

    const printer = await prisma.printer.create({
      data: {
        name:           name.trim(),
        maker:          maker?.trim()          || null,
        model:          model?.trim()          || null,
        supplier:       supplier?.trim()       || null,
        ipv4:           ipv4?.trim()           || null,
        hostname:       hostname?.trim()       || null,
        inkToner:       inkToner?.trim()       || null,
        tonerLevel:     clampToner(tonerLevel),
        supplierSerial: supplierSerial?.trim() || null,
      },
      include: { drivers: true },
    })
    return NextResponse.json(printer)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id, name, maker, model, supplier, ipv4, hostname, inkToner, tonerLevel, supplierSerial } = await req.json() as {
      id: string; name?: string | null; maker?: string | null; model?: string | null
      supplier?: string | null; ipv4?: string | null; hostname?: string | null
      inkToner?: string | null; tonerLevel?: number | null; supplierSerial?: string | null
    }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const printer = await prisma.printer.update({
      where: { id },
      data: {
        // name is required — only update when a non-empty value is sent
        ...(name && typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(maker      !== undefined ? { maker:      optional(maker) } : {}),
        ...(model      !== undefined ? { model:      optional(model) } : {}),
        ...(supplier   !== undefined ? { supplier:   optional(supplier) } : {}),
        ...(ipv4       !== undefined ? { ipv4:       optional(ipv4) } : {}),
        ...(hostname   !== undefined ? { hostname:   optional(hostname) } : {}),
        ...(inkToner       !== undefined ? { inkToner:       optional(inkToner) } : {}),
        ...(tonerLevel     !== undefined ? { tonerLevel:     clampToner(tonerLevel) } : {}),
        ...(supplierSerial !== undefined ? { supplierSerial: optional(supplierSerial) } : {}),
      },
      include: { drivers: { orderBy: { createdAt: "asc" } } },
    })
    return NextResponse.json(printer)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    // Remove the driver files from disk first; the DB rows cascade on delete.
    const drivers = await prisma.printerDriver.findMany({ where: { printerId: id } })
    for (const d of drivers) {
      await deleteDriverFile(d.storedName)
    }

    await prisma.printer.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/printers DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
