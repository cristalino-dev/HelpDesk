/**
 * @jest-environment node
 */
/**
 * __tests__/apiKeys.test.ts — the check every /api/v1 route starts with (v3.88).
 *
 * A key is looked up by its SHA-256 (the key itself is never stored); a missing,
 * unknown or revoked key is 401; a read key that tries to write is 403; more
 * than RATE_LIMIT_PER_MINUTE requests a minute is 429.
 */

import {
  generateApiKey, hashKey, keyFrom, authenticateApi, rateLimited, resetApiKeyState, apiActor,
  RATE_LIMIT_PER_MINUTE,
} from "@/lib/apiKeys"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({ prisma: { apiKey: { findUnique: jest.fn(), update: jest.fn() } } }))
jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      ({ status: init?.status ?? 200, headers: init?.headers ?? {}, json: async () => data }),
  },
}))

type Res = { status: number; headers: Record<string, string>; json: () => Promise<{ error: { code: string } }> }
const req = (headers: Record<string, string>) =>
  ({ headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } }) as unknown as Request
const row = (over: Record<string, unknown> = {}) =>
  ({ id: "k1", name: "ERP", prefix: "hdk_abcdefgh", scope: "write", revokedAt: null, ...over })

beforeEach(() => {
  jest.clearAllMocks()
  resetApiKeyState()
})

describe("generateApiKey", () => {
  it("makes an hdk_ key, its 12-character prefix and its SHA-256", () => {
    const { key, prefix, hash } = generateApiKey()
    expect(key).toMatch(/^hdk_[A-Za-z0-9_-]{43}$/)
    expect(prefix).toBe(key.slice(0, 12))
    expect(hash).toBe(hashKey(key))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(generateApiKey().key).not.toBe(key)
  })
})

describe("keyFrom", () => {
  it("reads a Bearer header, in any case, or X-Api-Key", () => {
    expect(keyFrom(req({ authorization: "Bearer hdk_1" }))).toBe("hdk_1")
    expect(keyFrom(req({ authorization: "bearer   hdk_2 " }))).toBe("hdk_2")
    expect(keyFrom(req({ "x-api-key": "hdk_3" }))).toBe("hdk_3")
    expect(keyFrom(req({}))).toBe("")
  })
})

describe("authenticateApi", () => {
  const call = async (headers: Record<string, string>, need: "read" | "write") => {
    const result = await authenticateApi(req(headers), need)
    return "response" in result ? { status: (result.response as unknown as Res).status, result } : { status: 200, result }
  }

  it("refuses a request with no key", async () => {
    expect((await call({}, "read")).status).toBe(401)
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled()
  })

  it("looks the key up by its hash, and refuses an unknown one", async () => {
    ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null)
    expect((await call({ authorization: "Bearer hdk_nope" }, "read")).status).toBe(401)
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith({ where: { hash: hashKey("hdk_nope") } })
  })

  it("refuses a revoked key", async () => {
    ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(row({ revokedAt: new Date() }))
    expect((await call({ authorization: "Bearer hdk_x" }, "read")).status).toBe(401)
  })

  it("lets a read key read, and refuses it a write", async () => {
    ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(row({ scope: "read" }))
    expect((await call({ "x-api-key": "hdk_x" }, "read")).status).toBe(200)
    expect((await call({ "x-api-key": "hdk_x" }, "write")).status).toBe(403)
  })

  it("names the caller for a write key", async () => {
    ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(row())
    const { result } = await call({ authorization: "Bearer hdk_x" }, "write")
    expect(result).toEqual({ caller: { id: "k1", name: "ERP", prefix: "hdk_abcdefgh", scope: "write" } })
  })

  it("records 'last used' at most once a minute", async () => {
    ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(row())
    await call({ authorization: "Bearer hdk_x" }, "read")
    await call({ authorization: "Bearer hdk_x" }, "read")
    expect(prisma.apiKey.update).toHaveBeenCalledTimes(1)
  })

  it(`stops a key after ${RATE_LIMIT_PER_MINUTE} requests in a minute, saying when to retry`, async () => {
    ;(prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(row())
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) expect((await call({ authorization: "Bearer hdk_x" }, "read")).status).toBe(200)
    const over = await call({ authorization: "Bearer hdk_x" }, "read")
    expect(over.status).toBe(429)
    expect(Number(((over.result as { response: unknown }).response as Res).headers["Retry-After"])).toBeGreaterThan(0)
  })
})

describe("rateLimited", () => {
  it("opens a new window after a minute", () => {
    const t0 = 1_000_000
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) expect(rateLimited("k", t0)).toBeNull()
    expect(rateLimited("k", t0 + 1000)).toBeGreaterThan(0)
    expect(rateLimited("k", t0 + 60_000)).toBeNull()
  })
})

describe("apiActor", () => {
  it("names a change 'API: <key name>'", () => {
    const actor = apiActor({ id: "k1", name: "ERP", prefix: "hdk_AbCdEfGh", scope: "write" })
    expect(actor.name).toBe("API: ERP")
    expect(actor.email).toBe("api+hdk_abcdefgh@cristalino.co.il")
  })
})
