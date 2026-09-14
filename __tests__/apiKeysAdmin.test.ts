/**
 * @jest-environment node
 */
/**
 * __tests__/apiKeysAdmin.test.ts — creating and revoking API keys (v3.88).
 *
 * Admins only. A new key is returned once and stored only as its SHA-256; the
 * list never carries a key or a hash; revoking keeps the row, marked.
 */

import type { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/admin/api-keys/route"
import { DELETE } from "@/app/api/admin/api-keys/[id]/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { hashKey } from "@/lib/apiKeys"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: { apiKey: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("next/server", () => ({
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}))

type Res = { status: number; json: () => Promise<Record<string, any>> }   // eslint-disable-line @typescript-eslint/no-explicit-any
const signedIn = (user: Record<string, unknown> | null) => (auth as jest.Mock).mockResolvedValue(user ? { user } : null)
const body = (b: unknown) => ({ json: async () => b }) as unknown as NextRequest
const idParam = (id: string) => ({ params: Promise.resolve({ id }) })
const ADMIN = { email: "alon@cristalino.co.il", name: "אלון", isAdmin: true }
const STAFF = { email: "staff@cristalino.co.il", isAdmin: false }

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.apiKey.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    ({ id: "k1", name: data.name, prefix: data.prefix, scope: data.scope, createdBy: data.createdBy, createdAt: new Date(), lastUsedAt: null, revokedAt: null }))
})

it("is for admins only", async () => {
  signedIn(null)
  expect((await (GET() as unknown as Promise<Res>)).status).toBe(401)
  signedIn(STAFF)
  expect((await (GET() as unknown as Promise<Res>)).status).toBe(403)
  expect((await (POST(body({ name: "ERP", scope: "read" })) as unknown as Promise<Res>)).status).toBe(403)
  expect((await (DELETE(body({}), idParam("k1")) as unknown as Promise<Res>)).status).toBe(403)
})

it("hands the new key back once, and stores only its hash", async () => {
  signedIn(ADMIN)
  const res = await (POST(body({ name: "ERP", scope: "write" })) as unknown as Promise<Res>)
  expect(res.status).toBe(201)
  const { key, data } = await res.json()
  expect(key).toMatch(/^hdk_/)
  const stored = (prisma.apiKey.create as jest.Mock).mock.calls[0][0].data
  expect(stored).toMatchObject({ name: "ERP", scope: "write", createdBy: ADMIN.email, prefix: key.slice(0, 12), hash: hashKey(key) })
  expect(JSON.stringify(stored)).not.toContain(key)
  expect(data).not.toHaveProperty("hash")
})

it("wants a name and a scope", async () => {
  signedIn(ADMIN)
  expect((await (POST(body({ name: " ", scope: "read" })) as unknown as Promise<Res>)).status).toBe(400)
  expect((await (POST(body({ name: "ERP", scope: "admin" })) as unknown as Promise<Res>)).status).toBe(400)
  expect(prisma.apiKey.create).not.toHaveBeenCalled()
})

it("lists keys without their hashes", async () => {
  signedIn(ADMIN)
  ;(prisma.apiKey.findMany as jest.Mock).mockResolvedValue([])
  await GET()
  const select = (prisma.apiKey.findMany as jest.Mock).mock.calls[0][0].select
  expect(select).not.toHaveProperty("hash")
})

it("revokes a key by marking it, once", async () => {
  signedIn(ADMIN)
  ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValueOnce({ id: "k1", name: "ERP", prefix: "hdk_x", revokedAt: null })
  ;(prisma.apiKey.update as jest.Mock).mockResolvedValue({ id: "k1", revokedAt: new Date() })
  expect((await (DELETE(body({}), idParam("k1")) as unknown as Promise<Res>)).status).toBe(200)
  expect((prisma.apiKey.update as jest.Mock).mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date)

  ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValueOnce({ id: "k1", name: "ERP", prefix: "hdk_x", revokedAt: new Date() })
  await DELETE(body({}), idParam("k1"))
  expect(prisma.apiKey.update).toHaveBeenCalledTimes(1)
})
