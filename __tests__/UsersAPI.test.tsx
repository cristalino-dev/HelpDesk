/**
 * __tests__/UsersAPI.test.tsx — Admin user management API
 *
 * Focused on the LAST-ADMIN GUARD (v3.50): the system must never reach
 * 0 admins — staff email notifications and admin-panel access depend on
 * the isAdmin flag, so demoting or deleting the final admin is blocked.
 */
import { PATCH, DELETE } from "@/app/api/users/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

jest.mock("@/auth", () => ({ auth: jest.fn() }))

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    ticket: { updateMany: jest.fn() },
  },
}))

jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))

jest.mock("next/server", () => ({
  NextResponse: class {
    status: number; data: unknown
    constructor(data: unknown, init?: { status?: number }) { this.data = data; this.status = init?.status || 200 }
    static json(data: unknown, init?: { status?: number }) { return new (this as never)(data, init) }
    async json() { return this.data }
  },
}))

const mockAuth = auth as unknown as jest.Mock
const mockUser = prisma.user as unknown as Record<string, jest.Mock>

const req = (body: unknown) => ({ json: async () => body }) as never

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { email: "alon@cristalino.co.il", isAdmin: true } })
})

describe("PATCH /api/users — last-admin guard", () => {
  it("blocks demoting the last admin (400)", async () => {
    mockUser.findUnique.mockResolvedValue({ isAdmin: true })  // target is admin
    mockUser.count.mockResolvedValue(0)                        // no other admins
    const res = await PATCH(req({ id: "u1", isAdmin: false }))
    expect(res.status).toBe(400)
    expect(mockUser.update).not.toHaveBeenCalled()
  })

  it("allows demoting an admin when another admin remains", async () => {
    mockUser.findUnique.mockResolvedValue({ isAdmin: true })
    mockUser.count.mockResolvedValue(1)                        // one other admin
    mockUser.update.mockResolvedValue({ id: "u1", isAdmin: false })
    const res = await PATCH(req({ id: "u1", isAdmin: false }))
    expect(res.status).toBe(200)
    expect(mockUser.update).toHaveBeenCalled()
  })

  it("does not run the guard when isAdmin is not being turned off", async () => {
    mockUser.update.mockResolvedValue({ id: "u1", isAdmin: true })
    const res = await PATCH(req({ id: "u1", isAdmin: true, name: "שם" }))
    expect(res.status).toBe(200)
    expect(mockUser.count).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/users — last-admin guard", () => {
  it("blocks deleting the last admin (400)", async () => {
    // 1st findUnique: self-lookup (different id); 2nd: target admin check
    mockUser.findUnique
      .mockResolvedValueOnce({ id: "self-id" })
      .mockResolvedValueOnce({ isAdmin: true })
    mockUser.count.mockResolvedValue(0)
    const res = await DELETE(req({ id: "u1" }))
    expect(res.status).toBe(400)
    expect(mockUser.delete).not.toHaveBeenCalled()
  })

  it("allows deleting a non-admin user", async () => {
    mockUser.findUnique
      .mockResolvedValueOnce({ id: "self-id" })
      .mockResolvedValueOnce({ isAdmin: false })
    mockUser.upsert.mockResolvedValue({ id: "fallback-id" })
    ;(prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 })
    mockUser.delete.mockResolvedValue({})
    const res = await DELETE(req({ id: "u1" }))
    expect(res.status).toBe(200)
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: "u1" } })
  })
})
