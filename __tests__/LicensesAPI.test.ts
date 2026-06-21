/**
 * __tests__/LicensesAPI.test.ts
 *
 * Unit tests for /api/admin/licenses (GET / POST / PATCH / DELETE).
 *
 * Covers:
 *   - Admin-only authorization (403 for non-admins on every verb)
 *   - POST bulk-split: keys separated by newlines and/or semicolons
 *   - POST validation: empty keys / empty category → 400
 *   - POST skipDuplicates + created/skipped count in the response
 *   - PATCH null-handling regression (v3.33): optional fields arriving as
 *     null must NOT crash (null.trim()) and must clear to DB null
 *   - DELETE requires an id
 */

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/licenses/route"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    license: {
      findMany:   jest.fn(),
      createMany: jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    },
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("next/server", () => ({
  NextResponse: class {
    status: number
    data: unknown
    constructor(data: unknown, init?: { status?: number }) {
      this.data = data
      this.status = init?.status ?? 200
    }
    static json(data: unknown, init?: { status?: number }) {
      return new (this as unknown as { new (d: unknown, i?: { status?: number }): unknown })(data, init)
    }
    async json() { return this.data }
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/db"

const mockAuth = auth as jest.Mock
const lic = prisma.license as unknown as {
  findMany: jest.Mock; createMany: jest.Mock; update: jest.Mock; delete: jest.Mock
}

const admin    = () => mockAuth.mockResolvedValue({ user: { email: "a@cristalino.co.il", isAdmin: true } })
const nonAdmin = () => mockAuth.mockResolvedValue({ user: { email: "u@cristalino.co.il", isAdmin: false } })
const body = (b: unknown) => ({ json: async () => b } as unknown as Parameters<typeof POST>[0])

beforeEach(() => jest.clearAllMocks())

// ── Authorization ────────────────────────────────────────────────────────────

describe("licenses authorization", () => {
  it("GET rejects non-admins with 403", async () => {
    nonAdmin()
    const res = await GET() as unknown as { status: number }
    expect(res.status).toBe(403)
    expect(lic.findMany).not.toHaveBeenCalled()
  })

  it("POST rejects non-admins with 403", async () => {
    nonAdmin()
    const res = await POST(body({ keys: "X", category: "Office" })) as unknown as { status: number }
    expect(res.status).toBe(403)
    expect(lic.createMany).not.toHaveBeenCalled()
  })
})

// ── POST bulk insert ─────────────────────────────────────────────────────────

describe("POST /api/admin/licenses — bulk insert", () => {
  it("splits keys by newlines and semicolons, trims, drops blanks", async () => {
    admin()
    lic.createMany.mockResolvedValue({ count: 3 })

    const res = await POST(body({
      keys: " AAA-1 \n BBB-2 ;; CCC-3 \n  ",
      category: "Office",
    })) as unknown as { status: number; json: () => Promise<{ created: number; skipped: number }> }

    const passed = lic.createMany.mock.calls[0][0].data as Array<{ key: string; category: string }>
    expect(passed.map(d => d.key)).toEqual(["AAA-1", "BBB-2", "CCC-3"])
    expect(passed.every(d => d.category === "Office")).toBe(true)
    expect(lic.createMany.mock.calls[0][0].skipDuplicates).toBe(true)

    const data = await res.json()
    expect(data.created).toBe(3)
    expect(data.skipped).toBe(0)
  })

  it("reports skipped duplicates (keys submitted minus rows created)", async () => {
    admin()
    lic.createMany.mockResolvedValue({ count: 1 }) // 2 submitted, 1 was a dup

    const res = await POST(body({ keys: "DUP-1;NEW-2", category: "Office" })) as unknown as
      { json: () => Promise<{ created: number; skipped: number }> }
    const data = await res.json()
    expect(data.created).toBe(1)
    expect(data.skipped).toBe(1)
  })

  it("applies optional username/password/remark to every key, null when blank", async () => {
    admin()
    lic.createMany.mockResolvedValue({ count: 2 })
    await POST(body({ keys: "K1\nK2", category: "Office", username: "  alice  ", password: "", remark: "for lab" }))

    const rows = lic.createMany.mock.calls[0][0].data as Array<{ username: string | null; password: string | null; remark: string | null }>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ username: "alice", password: null, remark: "for lab" })
  })

  it("returns 400 when keys is empty/whitespace", async () => {
    admin()
    const res = await POST(body({ keys: "   ", category: "Office" })) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(lic.createMany).not.toHaveBeenCalled()
  })

  it("returns 400 when category is missing", async () => {
    admin()
    const res = await POST(body({ keys: "K1", category: "" })) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(lic.createMany).not.toHaveBeenCalled()
  })
})

// ── PATCH null-handling regression (v3.33) ─────────────────────────────────────

describe("PATCH /api/admin/licenses — null optional fields (v3.33 regression)", () => {
  it("does not crash when username/password/remark arrive as null; clears them to null", async () => {
    admin()
    lic.update.mockResolvedValue({ id: "lic-1" })

    // The edit form sends the row as-is, so untouched optionals are null.
    const res = await PATCH(body({
      id: "lic-1", key: "ABC-123", category: "Office",
      username: null, password: null, remark: "given to Dana",
    })) as unknown as { status: number }

    expect(res.status).toBe(200)
    const data = lic.update.mock.calls[0][0].data
    expect(data.username).toBeNull()
    expect(data.password).toBeNull()
    expect(data.remark).toBe("given to Dana")
    expect(data.key).toBe("ABC-123")
  })

  it("leaves fields untouched when they are undefined (not sent)", async () => {
    admin()
    lic.update.mockResolvedValue({ id: "lic-2" })
    await PATCH(body({ id: "lic-2", remark: "note only" }))

    const data = lic.update.mock.calls[0][0].data
    expect(data).toHaveProperty("remark", "note only")
    expect(data).not.toHaveProperty("username")
    expect(data).not.toHaveProperty("password")
    expect(data).not.toHaveProperty("key")
  })

  it("returns 400 when id is missing", async () => {
    admin()
    const res = await PATCH(body({ key: "no-id" })) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(lic.update).not.toHaveBeenCalled()
  })
})

// ── DELETE ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/admin/licenses", () => {
  it("deletes by id", async () => {
    admin()
    lic.delete.mockResolvedValue({})
    const res = await DELETE(body({ id: "lic-9" })) as unknown as { status: number }
    expect(res.status).toBe(200)
    expect(lic.delete).toHaveBeenCalledWith({ where: { id: "lic-9" } })
  })

  it("returns 400 without an id", async () => {
    admin()
    const res = await DELETE(body({})) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(lic.delete).not.toHaveBeenCalled()
  })
})
