/**
 * __tests__/UsersAPI.test.tsx — Admin user management API
 *
 * Focused on the LAST-ADMIN GUARD (v3.50): the system must never reach
 * 0 admins — staff email notifications and admin-panel access depend on
 * the isAdmin flag, so demoting or deleting the final admin is blocked.
 */
import { GET, PATCH, DELETE } from "@/app/api/users/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

jest.mock("@/auth", () => ({ auth: jest.fn() }))

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    ticket: { updateMany: jest.fn(), findMany: jest.fn() },
  },
}))

jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))

jest.mock("next/server", () => ({
  NextResponse: class {
    status: number; data: unknown
    constructor(data: unknown, init?: { status?: number }) { this.data = data; this.status = init?.status || 200 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static json(data: unknown, init?: { status?: number }) { return new (this as any)(data, init) }
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
    mockUser.findFirst.mockResolvedValue(null)     // no fallback account yet
    mockUser.upsert.mockResolvedValue({ id: "fallback-id" })
    ;(prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 })
    mockUser.delete.mockResolvedValue({})
    const res = await DELETE(req({ id: "u1" }))
    expect(res.status).toBe(200)
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: "u1" } })
  })

  // The reassignment target is looked up case-insensitively (v3.65). A second
  // fallback account would strand the deleted user's tickets on a row nobody
  // signs in to — the tickets would be "reassigned" and simultaneously gone.
  it("reuses an existing helpdesk account whose address carries capitals", async () => {
    mockUser.findUnique
      .mockResolvedValueOnce({ id: "self-id" })
      .mockResolvedValueOnce({ isAdmin: false })
    mockUser.findFirst.mockResolvedValue({ id: "existing-fallback", email: "HelpDesk@cristalino.co.il" })
    ;(prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 })
    mockUser.delete.mockResolvedValue({})

    const res = await DELETE(req({ id: "u1" }))

    expect(res.status).toBe(200)
    expect(mockUser.upsert).not.toHaveBeenCalled()
    expect(prisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "existing-fallback" } })
    )
  })
})

/**
 * GET ?withContact=1 — what an admin filing a ticket for someone else sees.
 *
 * The profile columns are null for nearly everyone (almost nobody visits
 * /profile), so without a fallback the ticket form blanked two required fields
 * and the admin had to ask the caller for details the system already had, in
 * every ticket that person had ever opened.
 */
describe("GET /api/users?withContact=1", () => {
  const USERS = [
    { id: "u1", name: "דנה",  email: "dana@x.co", phone: "050-1", station: "PC-DANA", isAdmin: false },
    { id: "u2", name: "גיא",  email: "guy@x.co",  phone: null,    station: null,      isAdmin: false },
    { id: "u3", name: "נועה", email: "noa@x.co",  phone: null,    station: null,      isAdmin: false },
  ]
  const mockTicket = prisma.ticket as unknown as Record<string, jest.Mock>

  const get = (qs: string) => GET({ nextUrl: { searchParams: new URLSearchParams(qs) } } as never)

  beforeEach(() => {
    mockUser.findMany.mockResolvedValue(USERS)
    mockTicket.findMany.mockImplementation(({ select }) =>
      Promise.resolve(select.phone
        ? [{ userId: "u2", phone: "050-2" }]
        : [{ userId: "u2", computerName: "PC-GUY" }]))
  })

  it("does NOT touch tickets without the flag — the admin table shows the profile itself", async () => {
    const res = await get("")
    expect(await res.json()).toEqual(USERS)
    expect(mockTicket.findMany).not.toHaveBeenCalled()
  })

  it("keeps the profile value when there is one", async () => {
    const rows = await (await get("withContact=1")).json() as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({ phone: "050-1", phoneFrom: "profile", station: "PC-DANA", stationFrom: "profile" })
  })

  it("falls back to the person's last ticket when the profile is empty", async () => {
    const rows = await (await get("withContact=1")).json() as Array<Record<string, unknown>>
    expect(rows[1]).toMatchObject({ phone: "050-2", phoneFrom: "ticket", station: "PC-GUY", stationFrom: "ticket" })
  })

  it("reports none for someone with no profile and no tickets", async () => {
    const rows = await (await get("withContact=1")).json() as Array<Record<string, unknown>>
    expect(rows[2]).toMatchObject({ phone: "", phoneFrom: "none", station: "", stationFrom: "none" })
  })

  it("costs two queries, not one per user", async () => {
    await get("withContact=1")
    expect(mockTicket.findMany).toHaveBeenCalledTimes(2)
  })

  it("looks up the newest ticket that actually FILLED the field", async () => {
    // A ticket where the field was left blank must not win just by being newer.
    await get("withContact=1")
    for (const [args] of mockTicket.findMany.mock.calls) {
      expect(args.orderBy).toEqual({ createdAt: "desc" })
      expect(args.distinct).toEqual(["userId"])
      const field = args.select.phone ? "phone" : "computerName"
      expect(args.where[field]).toEqual({ not: "" })
    }
  })

  it("stays admin-only", async () => {
    mockAuth.mockResolvedValue({ user: { email: "x@x.co", isAdmin: false } })
    expect((await get("withContact=1")).status).toBe(403)
  })
})
