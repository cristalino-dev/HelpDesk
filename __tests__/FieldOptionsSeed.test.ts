/**
 * __tests__/FieldOptionsSeed.test.ts
 *
 * Unit tests for the seeding behaviour of GET /api/admin/field-options.
 *
 * Two things are easy to get wrong here and both break the whole app:
 *   1. A value added to an ALREADY-POPULATED field (the "עובד חדש" category)
 *      never appears on a live install, because plain seeding only fires when a
 *      field is completely empty.
 *   2. Every signed-in page load hits this endpoint, so the back-fill must be
 *      race-safe — a bare create() would collide on the (field, label) unique
 *      index and 500 the request, taking out every dropdown in the app.
 */

import { GET, DELETE } from "@/app/api/admin/field-options/route"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    fieldOption: {
      count:      jest.fn(),
      createMany: jest.fn(),
      findMany:   jest.fn(),
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      aggregate:  jest.fn(),
      create:     jest.fn(),
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
import { NEW_EMPLOYEE_CATEGORY, DEFAULT_EQUIPMENT } from "@/lib/equipment"
import { LEAVING_EMPLOYEE_CATEGORY } from "@/lib/offboarding"

const mockAuth = auth as jest.Mock
const opt = prisma.fieldOption as unknown as {
  count: jest.Mock; createMany: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock
  findUnique: jest.Mock; aggregate: jest.Mock; create: jest.Mock; delete: jest.Mock
}

type Res = { status: number; json: () => Promise<unknown> }

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { email: "a@cristalino.co.il", isAdmin: true } })
  opt.findMany.mockResolvedValue([])
  opt.aggregate.mockResolvedValue({ _max: { order: 5 } })
  opt.createMany.mockResolvedValue({ count: 1 })
  // Fields already populated — the state of the live database.
  opt.count.mockResolvedValue(3)
})

describe("field-options seeding", () => {
  it("seeds a field's defaults only when that field is empty", async () => {
    opt.count.mockResolvedValue(0)
    opt.findFirst.mockResolvedValue({ id: "x" }) // category value already there
    await GET()

    const seededFields = opt.createMany.mock.calls.map(c => c[0].data[0].field)
    expect(seededFields).toContain("equipment")
    expect(opt.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    )
  })

  it("seeds the full default equipment list", async () => {
    opt.count.mockResolvedValue(0)
    opt.findFirst.mockResolvedValue({ id: "x" })
    await GET()

    const call = opt.createMany.mock.calls.find(c => c[0].data[0]?.field === "equipment")
    expect(call![0].data.map((d: { label: string }) => d.label)).toEqual(DEFAULT_EQUIPMENT)
  })

  it("back-fills the new-employee category into an already-populated field", async () => {
    opt.findFirst.mockResolvedValue(null) // category exists but not this label
    await GET()

    const call = opt.createMany.mock.calls.find(
      c => c[0].data[0]?.label === NEW_EMPLOYEE_CATEGORY,
    )
    expect(call).toBeDefined()
    expect(call![0].data[0]).toMatchObject({ field: "category", order: 6 })
  })

  it("uses createMany+skipDuplicates for the back-fill, never a bare create", async () => {
    // Two page loads racing would collide on the (field, label) unique index.
    opt.findFirst.mockResolvedValue(null)
    await GET()

    expect(opt.create).not.toHaveBeenCalled()
    const backfill = opt.createMany.mock.calls.find(
      c => c[0].data[0]?.label === NEW_EMPLOYEE_CATEGORY,
    )
    expect(backfill![0].skipDuplicates).toBe(true)
  })

  it("back-fills the leaving-employee category too", async () => {
    opt.findFirst.mockResolvedValue(null)
    await GET()

    const call = opt.createMany.mock.calls.find(
      c => c[0].data[0]?.label === LEAVING_EMPLOYEE_CATEGORY,
    )
    expect(call).toBeDefined()
    expect(call![0]).toMatchObject({ skipDuplicates: true })
  })

  it("does not re-create the category when it already exists", async () => {
    opt.findFirst.mockResolvedValue({ id: "cat-1", field: "category", label: NEW_EMPLOYEE_CATEGORY })
    await GET()

    expect(opt.createMany.mock.calls.some(
      c => c[0].data[0]?.label === NEW_EMPLOYEE_CATEGORY,
    )).toBe(false)
  })

  it("returns equipment among the grouped option lists", async () => {
    opt.findFirst.mockResolvedValue({ id: "x" })
    opt.findMany.mockResolvedValue([
      { id: "e1", field: "equipment", label: "מסך" },
      { id: "c1", field: "category",  label: "אחר" },
    ])
    const res = await GET() as Res
    const body = await res.json() as { equipment: string[]; category: string[] }
    expect(body.equipment).toEqual(["מסך"])
    expect(body.category).toEqual(["אחר"])
  })
})

describe("field-options DELETE protection", () => {
  it("refuses to delete the new-employee category", async () => {
    // The ticket form matches on this exact label — removing it would silently
    // kill the equipment checklist rather than just shorten a dropdown.
    opt.findUnique.mockResolvedValue({ id: "c1", field: "category", label: NEW_EMPLOYEE_CATEGORY })
    const res = await DELETE({ json: async () => ({ id: "c1" }) } as never) as Res
    expect(res.status).toBe(400)
    expect(opt.delete).not.toHaveBeenCalled()
  })

  it("still allows deleting an ordinary category", async () => {
    opt.findUnique.mockResolvedValue({ id: "c2", field: "category", label: "אחר" })
    const res = await DELETE({ json: async () => ({ id: "c2" }) } as never) as Res
    expect(res.status).toBe(200)
    expect(opt.delete).toHaveBeenCalledWith({ where: { id: "c2" } })
  })

  it("refuses to delete the leaving-employee category", async () => {
    // It is what builds the return checklist and what blocks closure.
    opt.findUnique.mockResolvedValue({ id: "c3", field: "category", label: LEAVING_EMPLOYEE_CATEGORY })
    const res = await DELETE({ json: async () => ({ id: "c3" }) } as never) as Res
    expect(res.status).toBe(400)
    expect(opt.delete).not.toHaveBeenCalled()
  })

  it("allows deleting an equipment item", async () => {
    opt.findUnique.mockResolvedValue({ id: "e1", field: "equipment", label: "מסך שני" })
    const res = await DELETE({ json: async () => ({ id: "e1" }) } as never) as Res
    expect(res.status).toBe(200)
  })
})
