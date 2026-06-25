/**
 * __tests__/PrintersAPI.test.ts
 *
 * Unit tests for /api/admin/printers (GET / POST / PATCH / DELETE).
 *
 * Covers:
 *   - Admin-only authorization (403 for non-admins)
 *   - POST validation (name required) + trimming / null-on-blank
 *   - PATCH id requirement + optional-field null normalization, and that name
 *     is only updated when a non-empty value is sent
 *   - DELETE id requirement + removal of the printer's driver files from disk
 *     before the row is deleted
 */

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/printers/route"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    printer: {
      findMany: jest.fn(),
      create:   jest.fn(),
      update:   jest.fn(),
      delete:   jest.fn(),
    },
    printerDriver: {
      findMany: jest.fn(),
    },
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/printerStorage", () => ({ deleteDriverFile: jest.fn() }))
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
import { deleteDriverFile } from "@/lib/printerStorage"

const mockAuth = auth as jest.Mock
const printer = prisma.printer as unknown as {
  findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock
}
const driver = prisma.printerDriver as unknown as { findMany: jest.Mock }
const mockDeleteFile = deleteDriverFile as jest.Mock

const admin    = () => mockAuth.mockResolvedValue({ user: { email: "a@cristalino.co.il", isAdmin: true } })
const nonAdmin = () => mockAuth.mockResolvedValue({ user: { email: "u@cristalino.co.il", isAdmin: false } })
const body = (b: unknown) => ({ json: async () => b } as unknown as Parameters<typeof POST>[0])

beforeEach(() => jest.clearAllMocks())

// ── Authorization ────────────────────────────────────────────────────────────

describe("printers authorization", () => {
  it("GET rejects non-admins with 403", async () => {
    nonAdmin()
    const res = await GET() as unknown as { status: number }
    expect(res.status).toBe(403)
    expect(printer.findMany).not.toHaveBeenCalled()
  })

  it("POST rejects non-admins with 403", async () => {
    nonAdmin()
    const res = await POST(body({ name: "HP" })) as unknown as { status: number }
    expect(res.status).toBe(403)
    expect(printer.create).not.toHaveBeenCalled()
  })

  it("DELETE rejects non-admins with 403", async () => {
    nonAdmin()
    const res = await DELETE(body({ id: "p1" })) as unknown as { status: number }
    expect(res.status).toBe(403)
    expect(printer.delete).not.toHaveBeenCalled()
  })
})

// ── POST ───────────────────────────────────────────────────────────────────────

describe("POST /api/admin/printers", () => {
  it("returns 400 when name is missing/blank", async () => {
    admin()
    const res = await POST(body({ name: "   ", maker: "HP" })) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(printer.create).not.toHaveBeenCalled()
  })

  it("trims the name and stores blank optionals as null", async () => {
    admin()
    printer.create.mockResolvedValue({ id: "p1" })
    await POST(body({ name: "  HP M404  ", maker: " HP ", model: "", supplier: "  ", ipv4: "10.0.0.5", hostname: "", inkToner: "59A" }))

    const data = printer.create.mock.calls[0][0].data
    expect(data.name).toBe("HP M404")
    expect(data.maker).toBe("HP")
    expect(data.model).toBeNull()
    expect(data.supplier).toBeNull()
    expect(data.ipv4).toBe("10.0.0.5")
    expect(data.hostname).toBeNull()
    expect(data.inkToner).toBe("59A")
  })
})

// ── PATCH ──────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/printers", () => {
  it("returns 400 when id is missing", async () => {
    admin()
    const res = await PATCH(body({ name: "no-id" })) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(printer.update).not.toHaveBeenCalled()
  })

  it("clears optional fields sent as null and leaves undefined ones untouched", async () => {
    admin()
    printer.update.mockResolvedValue({ id: "p1" })
    await PATCH(body({ id: "p1", supplier: null, ipv4: "  ", inkToner: "TN-2420" }))

    const data = printer.update.mock.calls[0][0].data
    expect(data.supplier).toBeNull()        // explicit null → cleared
    expect(data.ipv4).toBeNull()            // blank → cleared
    expect(data.inkToner).toBe("TN-2420")   // value → trimmed set
    expect(data).not.toHaveProperty("maker")    // undefined → untouched
    expect(data).not.toHaveProperty("hostname")
    expect(data).not.toHaveProperty("name")     // not sent → not updated
  })

  it("updates name only when a non-empty value is provided", async () => {
    admin()
    printer.update.mockResolvedValue({ id: "p1" })
    await PATCH(body({ id: "p1", name: "  " }))
    expect(printer.update.mock.calls[0][0].data).not.toHaveProperty("name")

    printer.update.mockClear()
    await PATCH(body({ id: "p1", name: " Brother " }))
    expect(printer.update.mock.calls[0][0].data.name).toBe("Brother")
  })
})

// ── DELETE ───────────────────────────────────────────────────────────────────────

describe("DELETE /api/admin/printers", () => {
  it("returns 400 without an id", async () => {
    admin()
    const res = await DELETE(body({})) as unknown as { status: number }
    expect(res.status).toBe(400)
    expect(printer.delete).not.toHaveBeenCalled()
  })

  it("removes every driver file from disk before deleting the printer row", async () => {
    admin()
    driver.findMany.mockResolvedValue([{ storedName: "uuid1__a.zip" }, { storedName: "uuid2__b.exe" }])
    printer.delete.mockResolvedValue({})

    const res = await DELETE(body({ id: "p9" })) as unknown as { status: number }
    expect(res.status).toBe(200)
    expect(mockDeleteFile).toHaveBeenCalledTimes(2)
    expect(mockDeleteFile).toHaveBeenCalledWith("uuid1__a.zip")
    expect(mockDeleteFile).toHaveBeenCalledWith("uuid2__b.exe")
    expect(printer.delete).toHaveBeenCalledWith({ where: { id: "p9" } })
  })
})
