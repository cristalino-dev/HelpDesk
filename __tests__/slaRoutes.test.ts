/**
 * @jest-environment node
 */
/**
 * __tests__/slaRoutes.test.ts — reading and setting the SLA per type (v3.87).
 *
 * Anyone signed in may read it (every queue marks what is overdue); only an
 * admin may change it, to whole workdays between 1 and 60, and the change is
 * logged. A database with nothing stored reads as the defaults.
 */

import type { NextRequest } from "next/server"
import { GET } from "@/app/api/settings/sla/route"
import { PUT } from "@/app/api/admin/settings/sla/route"
import { auth } from "@/auth"
import { logInfo } from "@/lib/logError"

const mockStore = new Map<string, string>()

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    appSetting: {
      findMany: jest.fn(async () => [...mockStore.entries()].map(([key, value]) => ({ key, value }))),
      upsert: jest.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        mockStore.set(where.key, update.value)
        return {}
      }),
    },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("next/server", () => ({
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}))

type Res = { status: number; json: () => Promise<Record<string, unknown>> }
const signedIn = (user: Record<string, unknown> | null) => (auth as jest.Mock).mockResolvedValue(user ? { user } : null)
const read = () => GET() as unknown as Promise<Res>
const write = (body: unknown) => PUT({ json: async () => body } as unknown as NextRequest) as unknown as Promise<Res>

const ADMIN = { email: "alon@cristalino.co.il", name: "אלון", isAdmin: true }
const STAFF = { email: "staff@cristalino.co.il", isAdmin: false }

beforeEach(() => {
  jest.clearAllMocks()
  mockStore.clear()
})

describe("GET /api/settings/sla", () => {
  it("refuses a caller who is not signed in", async () => {
    signedIn(null)
    expect((await read()).status).toBe(401)
  })

  it("reads as the defaults when nothing is stored", async () => {
    signedIn(STAFF)
    expect(await (await read()).json()).toEqual({ ticket: 4, request: 10 })
  })

  it("reads what admins stored, and ignores a value that is not usable", async () => {
    signedIn(STAFF)
    mockStore.set("sla.ticket", "3")
    mockStore.set("sla.request", "abc")
    expect(await (await read()).json()).toEqual({ ticket: 3, request: 10 })
  })
})

describe("PUT /api/admin/settings/sla", () => {
  it("is for admins only", async () => {
    signedIn(null)
    expect((await write({ ticket: 5, request: 12 })).status).toBe(401)
    signedIn(STAFF)
    expect((await write({ ticket: 5, request: 12 })).status).toBe(403)
    expect(mockStore.size).toBe(0)
  })

  it("refuses anything but whole workdays from 1 to 60, saying so", async () => {
    signedIn(ADMIN)
    for (const body of [{ ticket: 0, request: 10 }, { ticket: 4, request: 61 }, { ticket: 2.5, request: 10 }, { ticket: "x", request: 10 }, {}]) {
      const res = await write(body)
      expect(res.status).toBe(400)
      expect(String((await res.json()).error)).toContain("ימי עבודה")
    }
    expect(mockStore.size).toBe(0)
  })

  it("stores both, answers with them, and logs who changed what", async () => {
    signedIn(ADMIN)
    const res = await write({ ticket: 6, request: "14" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ticket: 6, request: 14 })
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining("ticket 4→6, request 10→14"), expect.any(String))
    expect(await (await read()).json()).toEqual({ ticket: 6, request: 14 })
  })
})
