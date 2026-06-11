/**
 * app/api/admin/licenses/route.ts — License inventory management (admin only)
 *
 * Powers the "רישוי" tab in the admin panel. Stores software license keys
 * (Office, etc.) with optional username/password (to whom the license was
 * given) and a free-text remark.
 *
 * Categories are managed via the FieldOption table (field = "licenseCategory")
 * through the existing /api/admin/field-options endpoints.
 *
 * ENDPOINTS:
 *   GET    /api/admin/licenses  — list all licenses (category asc, newest first)
 *   POST   /api/admin/licenses  — bulk-add: `keys` may contain multiple keys
 *                                 separated by `;` or newlines. Duplicates
 *                                 (same category + key) are skipped.
 *                                 Body: { keys, category, username?, password?, remark? }
 *                                 Response: { ok, created, skipped }
 *   PATCH  /api/admin/licenses  — update one license by id
 *                                 Body: { id, key?, category?, username?, password?, remark? }
 *   DELETE /api/admin/licenses  — Body: { id }
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const licenses = await prisma.license.findMany({
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    })
    return NextResponse.json(licenses)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/licenses GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { keys, category, username, password, remark } = await req.json() as {
      keys: string; category: string; username?: string; password?: string; remark?: string
    }

    if (!keys?.trim())     return NextResponse.json({ error: "נדרש לפחות מפתח רישיון אחד" }, { status: 400 })
    if (!category?.trim()) return NextResponse.json({ error: "נדרשת קטגוריה" }, { status: 400 })

    // One key per line, or multiple keys separated by semicolons
    const keyList = keys.split(/[;\n]/).map(k => k.trim()).filter(Boolean)
    if (keyList.length === 0) return NextResponse.json({ error: "נדרש לפחות מפתח רישיון אחד" }, { status: 400 })

    const result = await prisma.license.createMany({
      data: keyList.map(key => ({
        key,
        category: category.trim(),
        username: username?.trim() || null,
        password: password?.trim() || null,
        remark:   remark?.trim()   || null,
      })),
      skipDuplicates: true, // same category+key already exists → skip silently
    })

    return NextResponse.json({ ok: true, created: result.count, skipped: keyList.length - result.count })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/licenses POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id, key, category, username, password, remark } = await req.json() as {
      id: string; key?: string; category?: string; username?: string; password?: string; remark?: string
    }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const license = await prisma.license.update({
      where: { id },
      data: {
        ...(key      !== undefined ? { key: key.trim() } : {}),
        ...(category !== undefined ? { category: category.trim() } : {}),
        ...(username !== undefined ? { username: username.trim() || null } : {}),
        ...(password !== undefined ? { password: password.trim() || null } : {}),
        ...(remark   !== undefined ? { remark:   remark.trim()   || null } : {}),
      },
    })
    return NextResponse.json(license)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/licenses PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    await prisma.license.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/licenses DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
