/**
 * lib/apiKeys.ts — keys for the public API, and the check every /api/v1 route
 * starts with (v3.88).
 *
 * A key is "hdk_" + 32 random bytes (base64url). Only its SHA-256 is stored;
 * the key itself is shown once, to the admin who creates it (components/
 * ApiKeysPanel.tsx). Each program gets its own key, so one can be revoked
 * without breaking the others, and the ticket history can say which program
 * changed what ("API: <name>").
 *
 *   read  — list and read tickets, their messages, notes and history
 *   write — the above, plus open tickets, change them, add messages and notes
 *
 * Sent as `Authorization: Bearer <key>` or `X-Api-Key: <key>`. At most
 * RATE_LIMIT_PER_MINUTE requests a minute per key. Errors come back in one
 * shape: { "error": { "code": "...", "message": "..." } }.
 */

import { createHash, randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export type ApiScope = "read" | "write"
export const API_SCOPES: readonly ApiScope[] = ["read", "write"]
export const KEY_PREFIX = "hdk_"
export const RATE_LIMIT_PER_MINUTE = 120
const LAST_USED_EVERY_MS = 60_000

export function normalizeScope(value: unknown): ApiScope | null {
  return value === "read" || value === "write" ? value : null
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex")
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url")
  return { key, prefix: key.slice(0, 12), hash: hashKey(key) }
}

/** The key a request carries, from either header — "" when it carries none. */
export function keyFrom(req: Request): string {
  const authorization = req.headers.get("authorization") ?? ""
  if (/^bearer\s+/i.test(authorization)) return authorization.replace(/^bearer\s+/i, "").trim()
  return (req.headers.get("x-api-key") ?? "").trim()
}

export type ApiCaller = { id: string; name: string; prefix: string; scope: ApiScope }

/** An error in the API's one shape. */
export function apiError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}

// Requests per key in the current minute. One process serves the app (pm2,
// fork mode), so memory is the right place; a restart forgetting is harmless.
const windows = new Map<string, { start: number; count: number }>()
const lastTouched = new Map<string, number>()

/** Seconds until the key may call again, or null while it is under the limit. */
export function rateLimited(keyId: string, now = Date.now()): number | null {
  const w = windows.get(keyId)
  if (!w || now - w.start >= 60_000) {
    windows.set(keyId, { start: now, count: 1 })
    return null
  }
  w.count++
  return w.count > RATE_LIMIT_PER_MINUTE ? Math.max(1, Math.ceil((w.start + 60_000 - now) / 1000)) : null
}

/** Forget the counters — for the tests. */
export function resetApiKeyState() {
  windows.clear()
  lastTouched.clear()
}

/**
 * The caller of an /api/v1 route — or the response to send instead: 401
 * without a valid, unrevoked key; 403 when a read-only key asks to write; 429
 * over the rate limit.
 */
export async function authenticateApi(
  req: Request, need: ApiScope,
): Promise<{ caller: ApiCaller } | { response: NextResponse }> {
  const key = keyFrom(req)
  if (!key) {
    return { response: apiError(401, "unauthorized", "Send the API key as 'Authorization: Bearer <key>' or 'X-Api-Key: <key>'.") }
  }
  const row = await prisma.apiKey.findUnique({ where: { hash: hashKey(key) } })
  if (!row || row.revokedAt) return { response: apiError(401, "unauthorized", "Unknown or revoked API key.") }

  const scope = normalizeScope(row.scope) ?? "read"
  if (need === "write" && scope !== "write") {
    return { response: apiError(403, "forbidden", "This key is read-only. Ask an admin for a key with write access.") }
  }

  const retryAfter = rateLimited(row.id)
  if (retryAfter !== null) {
    return {
      response: apiError(429, "rate_limited",
        `More than ${RATE_LIMIT_PER_MINUTE} requests a minute. Try again in ${retryAfter}s.`,
        { "Retry-After": String(retryAfter) }),
    }
  }

  // "Last used" in the console, written at most once a minute per key.
  const now = Date.now()
  if (now - (lastTouched.get(row.id) ?? 0) >= LAST_USED_EVERY_MS) {
    lastTouched.set(row.id, now)
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } })
  }
  return { caller: { id: row.id, name: row.name, prefix: row.prefix, scope } }
}

/** Everything about a key the admin console may show — never the key, never its hash. */
export const KEY_FIELDS = {
  id: true, name: true, prefix: true, scope: true, createdBy: true,
  createdAt: true, lastUsedAt: true, revokedAt: true,
} as const

/** How the history and the conversation name a change made through the API. */
export function apiActor(caller: ApiCaller): { name: string; email: string } {
  return { name: `API: ${caller.name}`, email: `api+${caller.prefix.toLowerCase()}@cristalino.co.il` }
}
