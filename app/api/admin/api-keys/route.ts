/**
 * /api/admin/api-keys — the keys other programs use for /api/v1 (v3.88). Admins only.
 *
 *   GET  → { data: Key[] } newest first — never the key itself, never its hash
 *   POST { name, scope: "read" | "write" } → 201 { key, data: Key }
 *        `key` is in this one response and nowhere else, ever: only its
 *        SHA-256 is stored. Lose it, and the answer is a new key.
 *
 * Creating a key is logged, with who created it.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError, logInfo } from "@/lib/logError"
import { generateApiKey, normalizeScope, KEY_FIELDS } from "@/lib/apiKeys"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!session.user.isAdmin) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { email: session.user.email, name: session.user.name ?? session.user.email }
}

export async function GET() {
  try {
    const admin = await requireAdmin()
    if ("response" in admin) return admin.response
    const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, select: KEY_FIELDS })
    return NextResponse.json({ data: keys })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/api-keys GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    if ("response" in admin) return admin.response

    const body = (await req.json().catch(() => null)) as { name?: unknown; scope?: unknown } | null
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const scope = normalizeScope(body?.scope)
    if (!name || name.length > 80) return NextResponse.json({ error: "שם התוכנה נדרש (עד 80 תווים)" }, { status: 400 })
    if (!scope) return NextResponse.json({ error: "הרשאה: read או write" }, { status: 400 })

    const { key, prefix, hash } = generateApiKey()
    const created = await prisma.apiKey.create({
      data: { name, prefix, hash, scope, createdBy: admin.email },
      select: KEY_FIELDS,
    })
    await logInfo(`API key "${name}" (${prefix}…, ${scope}) created by ${admin.name}`, "/api/admin/api-keys POST")
    return NextResponse.json({ key, data: created }, { status: 201 })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/api-keys POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
