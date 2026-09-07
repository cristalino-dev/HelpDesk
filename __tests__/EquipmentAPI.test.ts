/**
 * __tests__/EquipmentAPI.test.ts
 *
 * Unit tests for /api/tickets/[id]/equipment (POST / PATCH / DELETE) and
 * /api/admin/equipment (GET — the supplier shortage report).
 *
 * The authorization model is the point of these tests:
 *   - anyone involved with a ticket may ASK for equipment (owner or staff)
 *   - only staff may say it ARRIVED — the shortage list is a purchase order
 *   - an owner may withdraw a request, but not one already partly delivered
 *   - a closed ticket is frozen for the owner, still editable by staff
 */

import { POST, PATCH, DELETE } from "@/app/api/tickets/[id]/equipment/route"
import { GET as SHORTAGE_GET } from "@/app/api/admin/equipment/route"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket:          { findUnique: jest.fn() },
    ticketEquipment: {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      upsert:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    },
    fieldOption:     { findMany: jest.fn() },
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

import { LEAVING_EMPLOYEE_CATEGORY } from "@/lib/offboarding"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

const mockAuth = auth as jest.Mock
const ticketDb = prisma.ticket as unknown as { findUnique: jest.Mock }
const equipDb  = prisma.ticketEquipment as unknown as {
  findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock; delete: jest.Mock
}
const optionDb = prisma.fieldOption as unknown as { findMany: jest.Mock }

const OWNER = "tomer@cristalino.co.il"
const STAFF = "alon@cristalino.co.il"

const asOwner   = () => mockAuth.mockResolvedValue({ user: { email: OWNER, isAdmin: false } })
const asStaff   = () => mockAuth.mockResolvedValue({ user: { email: STAFF, isAdmin: true } })
const asOther   = () => mockAuth.mockResolvedValue({ user: { email: "someone@else.com", isAdmin: false } })
const anonymous = () => mockAuth.mockResolvedValue(null)

/** The ticket the guard resolves before doing anything. */
const givenTicket = (status = "פתוח") =>
  ticketDb.findUnique.mockResolvedValue({ id: "t1", status, user: { email: OWNER } })

const params = Promise.resolve({ id: "HDTC-506" })
const req = (body: unknown) => ({ json: async () => body }) as never

type Res = { status: number; json: () => Promise<unknown> }

beforeEach(() => {
  jest.clearAllMocks()
  optionDb.findMany.mockResolvedValue([{ label: "מסך" }, { label: "מחשב" }, { label: "עכבר" }])
  equipDb.findMany.mockResolvedValue([])
  equipDb.upsert.mockResolvedValue({})
  equipDb.update.mockResolvedValue({})
  equipDb.delete.mockResolvedValue({})
})

// ── POST — requesting equipment ──────────────────────────────────────────────

describe("POST /api/tickets/[id]/equipment", () => {
  it("401s an anonymous caller", async () => {
    anonymous()
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(401)
  })

  it("404s an unknown ticket", async () => {
    asStaff()
    ticketDb.findUnique.mockResolvedValue(null)
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(404)
  })

  it("403s someone who is neither staff nor the owner", async () => {
    asOther(); givenTicket()
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(403)
    expect(equipDb.upsert).not.toHaveBeenCalled()
  })

  it("lets the ticket OWNER request equipment on their own ticket", async () => {
    // This is the HDTC-506 case: an ordinary employee asking for a screen.
    asOwner(); givenTicket()
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 2 }] }), { params }) as Res
    expect(res.status).toBe(200)
    expect(equipDb.upsert).toHaveBeenCalledTimes(1)
    expect(equipDb.upsert.mock.calls[0][0].create).toMatchObject({ label: "מסך", quantity: 2 })
  })

  it("lets staff request equipment", async () => {
    asStaff(); givenTicket()
    const res = await POST(req({ equipment: [{ label: "מחשב", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(200)
    expect(equipDb.upsert).toHaveBeenCalledTimes(1)
  })

  it("blocks the owner on a CLOSED ticket", async () => {
    asOwner(); givenTicket("סגור")
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(403)
    expect(equipDb.upsert).not.toHaveBeenCalled()
  })

  it("still lets staff amend a closed ticket", async () => {
    asStaff(); givenTicket("סגור")
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(200)
  })

  it("rejects items that are not on the admin-managed list", async () => {
    asStaff(); givenTicket()
    const res = await POST(req({ equipment: [{ label: "מכונית", quantity: 1 }] }), { params }) as Res
    expect(res.status).toBe(400)
    expect(equipDb.upsert).not.toHaveBeenCalled()
  })

  it("400s an empty or junk payload", async () => {
    asStaff(); givenTicket()
    expect(((await POST(req({ equipment: [] }), { params })) as Res).status).toBe(400)
    expect(((await POST(req({}), { params })) as Res).status).toBe(400)
  })

  it("upserts, so re-requesting an item updates its quantity", async () => {
    asStaff(); givenTicket()
    await POST(req({ equipment: [{ label: "מסך", quantity: 3 }] }), { params })
    const call = equipDb.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ ticketId_label: { ticketId: "t1", label: "מסך" } })
    expect(call.update).toEqual({ quantity: 3 })
  })

  it("returns the ticket's full line list", async () => {
    asStaff(); givenTicket()
    equipDb.findMany.mockResolvedValue([{ id: "l1", label: "מסך", quantity: 1, receivedQty: 0 }])
    const res = await POST(req({ equipment: [{ label: "מסך", quantity: 1 }] }), { params }) as Res
    expect(await res.json()).toEqual([{ id: "l1", label: "מסך", quantity: 1, receivedQty: 0 }])
  })
})

// ── PATCH — recording arrivals ───────────────────────────────────────────────

describe("PATCH /api/tickets/[id]/equipment", () => {
  const line = { id: "l1", ticketId: "t1", label: "מסך", quantity: 3, receivedQty: 0 }

  it("403s the ticket owner — receiving is a staff act", async () => {
    asOwner(); givenTicket()
    const res = await PATCH(req({ id: "l1", received: true }), { params }) as Res
    expect(res.status).toBe(403)
    expect(equipDb.update).not.toHaveBeenCalled()
  })

  it("lets staff tick a whole line off", async () => {
    asStaff(); givenTicket()
    equipDb.findUnique.mockResolvedValue(line)
    const res = await PATCH(req({ id: "l1", received: true }), { params }) as Res
    expect(res.status).toBe(200)
    expect(equipDb.update.mock.calls[0][0].data).toMatchObject({ receivedQty: 3, receivedBy: STAFF })
    expect(equipDb.update.mock.calls[0][0].data.receivedAt).toBeInstanceOf(Date)
  })

  it("un-ticking clears the quantity and the stamp", async () => {
    asStaff(); givenTicket()
    equipDb.findUnique.mockResolvedValue({ ...line, receivedQty: 3 })
    await PATCH(req({ id: "l1", received: false }), { params })
    expect(equipDb.update.mock.calls[0][0].data).toEqual({ receivedQty: 0, receivedAt: null, receivedBy: null })
  })

  it("records a partial delivery without stamping it as received", async () => {
    asStaff(); givenTicket()
    equipDb.findUnique.mockResolvedValue(line)
    await PATCH(req({ id: "l1", receivedQty: 2 }), { params })
    expect(equipDb.update.mock.calls[0][0].data).toEqual({ receivedQty: 2, receivedAt: null, receivedBy: null })
  })

  it("clamps a received count above the requested quantity", async () => {
    asStaff(); givenTicket()
    equipDb.findUnique.mockResolvedValue(line)
    await PATCH(req({ id: "l1", receivedQty: 99 }), { params })
    expect(equipDb.update.mock.calls[0][0].data.receivedQty).toBe(3)
  })

  it("404s a line belonging to a different ticket", async () => {
    asStaff(); givenTicket()
    equipDb.findUnique.mockResolvedValue({ ...line, ticketId: "OTHER" })
    const res = await PATCH(req({ id: "l1", received: true }), { params }) as Res
    expect(res.status).toBe(404)
    expect(equipDb.update).not.toHaveBeenCalled()
  })
})

// ── DELETE — withdrawing a request ───────────────────────────────────────────

describe("DELETE /api/tickets/[id]/equipment", () => {
  const pending   = { id: "l1", ticketId: "t1", label: "מסך", quantity: 2, receivedQty: 0 }
  const delivered = { ...pending, receivedQty: 1 }

  it("lets the owner withdraw a request nothing arrived against", async () => {
    asOwner(); givenTicket()
    equipDb.findUnique.mockResolvedValue(pending)
    const res = await DELETE(req({ id: "l1" }), { params }) as Res
    expect(res.status).toBe(200)
    expect(equipDb.delete).toHaveBeenCalledWith({ where: { id: "l1" } })
  })

  it("stops the owner erasing a line that was partly delivered", async () => {
    asOwner(); givenTicket()
    equipDb.findUnique.mockResolvedValue(delivered)
    const res = await DELETE(req({ id: "l1" }), { params }) as Res
    expect(res.status).toBe(403)
    expect(equipDb.delete).not.toHaveBeenCalled()
  })

  it("stops the owner editing a closed ticket", async () => {
    asOwner(); givenTicket("סגור")
    equipDb.findUnique.mockResolvedValue(pending)
    const res = await DELETE(req({ id: "l1" }), { params }) as Res
    expect(res.status).toBe(403)
  })

  it("lets staff remove any line", async () => {
    asStaff(); givenTicket("סגור")
    equipDb.findUnique.mockResolvedValue(delivered)
    const res = await DELETE(req({ id: "l1" }), { params }) as Res
    expect(res.status).toBe(200)
    expect(equipDb.delete).toHaveBeenCalled()
  })
})

// ── GET /api/admin/equipment — the shortage report ───────────────────────────

describe("GET /api/admin/equipment", () => {
  const shortageReq = (includeClosed = false) => ({
    nextUrl: { searchParams: new URLSearchParams(includeClosed ? "includeClosed=1" : "") },
  }) as never

  const dbRows = [
    { label: "מסך",  quantity: 2, receivedQty: 0, ticket: { ticketNumber: 501, subject: "עובד חדש", status: "פתוח" } },
    { label: "מסך",  quantity: 3, receivedQty: 1, ticket: { ticketNumber: 506, subject: "מסך למוניטור", status: "בטיפול" } },
    { label: "עכבר", quantity: 1, receivedQty: 1, ticket: { ticketNumber: 510, subject: "עכבר", status: "בטיפול" } },
  ]

  it("403s a non-staff caller", async () => {
    mockAuth.mockResolvedValue({ user: { email: "u@x.com", isAdmin: false } })
    const res = await SHORTAGE_GET(shortageReq()) as Res
    expect(res.status).toBe(403)
  })

  it("401s an anonymous caller", async () => {
    anonymous()
    const res = await SHORTAGE_GET(shortageReq()) as Res
    expect(res.status).toBe(401)
  })

  it("aggregates outstanding units across tickets", async () => {
    asStaff()
    equipDb.findMany.mockResolvedValue(dbRows)
    const res = await SHORTAGE_GET(shortageReq()) as Res
    const body = await res.json() as { items: { label: string; outstanding: number }[]; totalOutstanding: number; ticketCount: number }
    expect(body.items).toHaveLength(1)            // only מסך is short
    expect(body.items[0]).toMatchObject({ label: "מסך", outstanding: 4 })
    expect(body.totalOutstanding).toBe(4)
    expect(body.ticketCount).toBe(2)
  })

  it("excludes closed tickets by default", async () => {
    asStaff()
    equipDb.findMany.mockResolvedValue([])
    await SHORTAGE_GET(shortageReq())
    expect(equipDb.findMany.mock.calls[0][0].where).toEqual({
      ticket: { category: { not: LEAVING_EMPLOYEE_CATEGORY }, status: { not: "סגור" } },
    })
  })

  it("includes closed tickets when asked", async () => {
    asStaff()
    equipDb.findMany.mockResolvedValue([])
    await SHORTAGE_GET(shortageReq(true))
    expect(equipDb.findMany.mock.calls[0][0].where).toEqual({
      ticket: { category: { not: LEAVING_EMPLOYEE_CATEGORY } },
    })
  })

  it("never counts a leaving employee's return checklist as an order", async () => {
    // Gear coming BACK from someone who is leaving is not gear to buy, and a
    // fresh offboarding ticket starts with every item unticked — it would
    // swamp the supplier list.
    asStaff()
    equipDb.findMany.mockResolvedValue([])
    await SHORTAGE_GET(shortageReq(true))
    expect(equipDb.findMany.mock.calls[0][0].where.ticket.category)
      .toEqual({ not: LEAVING_EMPLOYEE_CATEGORY })
  })

  it("returns ready-to-send supplier text", async () => {
    asStaff()
    equipDb.findMany.mockResolvedValue(dbRows)
    const res = await SHORTAGE_GET(shortageReq()) as Res
    const body = await res.json() as { supplierText: string }
    expect(body.supplierText).toContain("מסך — 4")
    expect(body.supplierText).not.toContain("עכבר")
  })
})
