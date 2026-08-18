/**
 * app/api/admin/field-options/route.ts — Manage ticket dropdown field options
 *
 * GET    /api/admin/field-options          Any logged-in user — returns all options
 *                                          grouped by field. Auto-seeds defaults if
 *                                          the table is empty for a field.
 * POST   /api/admin/field-options          Admin only — add a new option
 * DELETE /api/admin/field-options          Admin only — remove an option
 *                                          (blocked for protected urgency values)
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS, DEFAULT_URGENCIES, PROTECTED_URGENCIES } from "@/lib/fieldOptions"
import { DEFAULT_EQUIPMENT, NEW_EMPLOYEE_CATEGORY } from "@/lib/equipment"
import { NextRequest, NextResponse } from "next/server"

const FIELDS = ["category", "platform", "urgency", "licenseCategory", "equipment"] as const
type Field = typeof FIELDS[number]

const DEFAULTS: Record<Field, string[]> = {
  category: DEFAULT_CATEGORIES,
  platform: DEFAULT_PLATFORMS,
  urgency:  DEFAULT_URGENCIES,
  licenseCategory: ["Office"], // license types for the admin "רישוי" tab
  equipment: DEFAULT_EQUIPMENT, // new-employee checklist items
}

/**
 * Labels that must exist even in a database whose field list was already
 * populated before the feature shipped. Plain seeding only fires when a field
 * is completely empty, so a value added to an existing field (like the
 * new-employee category) would otherwise never appear on a live install.
 */
const REQUIRED_LABELS: { field: Field; label: string }[] = [
  { field: "category", label: NEW_EMPLOYEE_CATEGORY },
]

/** Ensure each field has at least the default values seeded. */
async function seedDefaults() {
  for (const field of FIELDS) {
    const count = await prisma.fieldOption.count({ where: { field } })
    if (count === 0) {
      await prisma.fieldOption.createMany({
        data: DEFAULTS[field].map((label, order) => ({ field, label, order })),
        skipDuplicates: true,
      })
    }
  }

  // Back-fill individual values added to fields that are already populated.
  // createMany + skipDuplicates (not create) because every signed-in page load
  // calls this endpoint: two first-loads racing would otherwise collide on the
  // (field, label) unique index and 500 the whole request, taking out every
  // dropdown in the app.
  for (const { field, label } of REQUIRED_LABELS) {
    const exists = await prisma.fieldOption.findFirst({ where: { field, label } })
    if (exists) continue
    const maxOrder = await prisma.fieldOption.aggregate({ where: { field }, _max: { order: true } })
    await prisma.fieldOption.createMany({
      data: [{ field, label, order: (maxOrder._max.order ?? -1) + 1 }],
      skipDuplicates: true,
    })
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await seedDefaults()

    const rows = await prisma.fieldOption.findMany({ orderBy: [{ field: "asc" }, { order: "asc" }, { label: "asc" }] })

    const grouped: Record<string, { id: string; label: string }[]> = { category: [], platform: [], urgency: [], licenseCategory: [], equipment: [] }
    for (const row of rows) {
      if (grouped[row.field]) grouped[row.field].push({ id: row.id, label: row.label })
    }

    // Return both the id+label pairs (for admin UI) and plain label arrays (for forms)
    return NextResponse.json({
      category: grouped.category.map(r => r.label),
      platform: grouped.platform.map(r => r.label),
      urgency:  grouped.urgency.map(r => r.label),
      licenseCategory: grouped.licenseCategory.map(r => r.label),
      equipment: grouped.equipment.map(r => r.label),
      // Full records for the admin management UI
      _records: grouped,
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/field-options GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { field, label } = await req.json() as { field: string; label: string }

    if (!FIELDS.includes(field as Field)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 })
    }
    if (!label?.trim()) {
      return NextResponse.json({ error: "Label required" }, { status: 400 })
    }

    const maxOrder = await prisma.fieldOption.aggregate({ where: { field }, _max: { order: true } })
    const nextOrder = (maxOrder._max.order ?? -1) + 1

    const row = await prisma.fieldOption.create({
      data: { field, label: label.trim(), order: nextOrder },
    })
    return NextResponse.json(row)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/field-options POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await req.json() as { id: string }

    const row = await prisma.fieldOption.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Protect core urgency values — they are used by compound-close, sweep, and sort logic
    if (row.field === "urgency" && PROTECTED_URGENCIES.has(row.label)) {
      return NextResponse.json({ error: `ערך הדחיפות "${row.label}" הוא ערך מערכת ולא ניתן למחיקה` }, { status: 400 })
    }

    // The new-employee category is what reveals the equipment checklist — the
    // UI matches on this exact label, so removing it would silently kill the
    // feature rather than just shortening a dropdown.
    if (row.field === "category" && row.label === NEW_EMPLOYEE_CATEGORY) {
      return NextResponse.json({ error: `הקטגוריה "${row.label}" היא ערך מערכת (רשימת הציוד) ולא ניתנת למחיקה` }, { status: 400 })
    }

    await prisma.fieldOption.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/field-options DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
