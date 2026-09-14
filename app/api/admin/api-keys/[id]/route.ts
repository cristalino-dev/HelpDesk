/**
 * DELETE /api/admin/api-keys/{id} — revoke a key (v3.88). Admins only.
 *
 * The key stops working at once. The row is kept, marked revoked, so the
 * history's "API: <name>" entries still say whose key made them. Revoking is
 * logged. → { data: Key }
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError, logInfo } from "@/lib/logError"
import { NextRequest, NextResponse } from "next/server"
import { KEY_FIELDS } from "@/lib/apiKeys"

export const runtime = "nodejs"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await params
    const key = await prisma.apiKey.findUnique({ where: { id }, select: KEY_FIELDS })
    if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (key.revokedAt) return NextResponse.json({ data: key })

    const revoked = await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() }, select: KEY_FIELDS })
    await logInfo(`API key "${key.name}" (${key.prefix}…) revoked by ${session.user.name ?? session.user.email}`, "/api/admin/api-keys DELETE")
    return NextResponse.json({ data: revoked })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/api-keys/[id] DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
