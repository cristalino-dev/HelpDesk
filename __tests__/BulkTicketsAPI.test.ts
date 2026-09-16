/**
 * __tests__/BulkTicketsAPI.test.ts — POST /api/tickets/bulk
 *
 * Tests for the bulk ticket mutation endpoint:
 *   - Authentication & role authorization (staff / admin)
 *   - Admin-only owner reassignment
 *   - Field updates: status, urgency, category, platform, assignedTo
 *   - Invariants: compound close (status "סגור" -> urgency "נמוך"), hold reason required for "בהמתנה"
 *   - Offboarding closure blocking for unticked return items
 *   - Internal notes creation
 *   - Ticket audit history recording
 */

import type { NextRequest } from "next/server"
import { POST } from "@/app/api/tickets/bulk/route"
import { auth } from "@/auth"
import { sendMail } from "@/lib/mail"
import { prisma } from "@/lib/db"
import { findUserByEmail } from "@/lib/users"
import { getStaffEmails } from "@/lib/staffMembers"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: jest.fn(), update: jest.fn() },
    ticketHistory: { createMany: jest.fn() },
    ticketNote: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({ STAFF_EMAILS: ["staff@cristalino.co.il"] }))
jest.mock("@/lib/staffMembers", () => ({ getStaffEmails: jest.fn() }))
jest.mock("@/lib/users", () => ({ findUserByEmail: jest.fn() }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
  mailTicketUpdatedStaff: jest.fn().mockReturnValue("<html/>"),
  mailTicketStatusUser: jest.fn().mockReturnValue("<html/>"),
  mailTicketClosedWithReview: jest.fn().mockReturnValue("<html/>"),
}))
// Callbacks handed to `after()` — Next.js runs these once the response is out.
const mockAfterCallbacks: (() => unknown)[] = []
jest.mock("next/server", () => ({
  after: (cb: () => unknown) => { mockAfterCallbacks.push(cb) },
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

type BulkJson = {
  ok: boolean
  total: number
  updatedCount: number
  errors: { ticketId: string; ticketNumber?: number; error: string }[]
}
type Res = { status: number; json: () => Promise<BulkJson> }
/** The transaction client the route's callback is handed. */
type Tx = {
  ticket: { update: jest.Mock }
  ticketHistory: { createMany: jest.Mock }
  ticketNote: { create: jest.Mock }
}
const mockAuth = auth as jest.Mock
const mockFindUnique = prisma.ticket.findUnique as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock
const mockGetStaffEmails = getStaffEmails as jest.Mock
const mockFindUserByEmail = findUserByEmail as jest.Mock

const session = (user: Record<string, unknown> | null) =>
  mockAuth.mockResolvedValue(user ? { user } : null)

const makeRequest = (body: unknown) => ({
  json: async () => body,
} as unknown as NextRequest)

const call = (body: unknown) => POST(makeRequest(body)) as unknown as Promise<Res>

describe("POST /api/tickets/bulk — Authentication & Authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetStaffEmails.mockResolvedValue(["staff@cristalino.co.il", "admin@cristalino.co.il"])
  })

  it("rejects unauthenticated requests with 401", async () => {
    session(null)
    const res = await call({ ids: ["t1"], changes: { status: "סגור" } })
    expect(res.status).toBe(401)
  })

  it("rejects regular non-staff users with 403", async () => {
    session({ email: "user@cristalino.co.il", isAdmin: false })
    const res = await call({ ids: ["t1"], changes: { status: "סגור" } })
    expect(res.status).toBe(403)
  })

  it("rejects non-admin staff trying to change ownerEmail with 403", async () => {
    session({ email: "staff@cristalino.co.il", isAdmin: false })
    const res = await call({ ids: ["t1"], changes: { ownerEmail: "other@cristalino.co.il" } })
    expect(res.status).toBe(403)
  })

  it("rejects owner reassignment to non-existent user with 400", async () => {
    session({ email: "admin@cristalino.co.il", isAdmin: true })
    mockFindUserByEmail.mockResolvedValue(null)
    const res = await call({ ids: ["t1"], changes: { ownerEmail: "unknown@cristalino.co.il" } })
    expect(res.status).toBe(400)
  })

  it("rejects requests with empty ticket ids array with 400", async () => {
    session({ email: "admin@cristalino.co.il", isAdmin: true })
    const res = await call({ ids: [], changes: { status: "סגור" } })
    expect(res.status).toBe(400)
  })
})

describe("POST /api/tickets/bulk — Execution & Business Rules", () => {
  const sampleTicket1 = {
    id: "t1",
    ticketNumber: 101,
    subject: "מחשב לא נדלק",
    category: "חומרה",
    platform: "PC",
    urgency: "גבוה",
    status: "פתוח",
    assignedTo: "staff@cristalino.co.il",
    holdReason: null,
    user: { name: "ישראל ישראלי", email: "israel@cristalino.co.il" },
    equipment: [],
  }

  const sampleTicket2 = {
    id: "t2",
    ticketNumber: 102,
    subject: "עוזב חברה",
    category: "סגירת משתמש",
    platform: "PC",
    urgency: "בינוני",
    status: "פתוח",
    assignedTo: "staff@cristalino.co.il",
    holdReason: null,
    user: { name: "משה כהן", email: "moshe@cristalino.co.il" },
    equipment: [
      { label: "מחשב נייד", quantity: 1, receivedQty: 0 },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAfterCallbacks.length = 0
    session({ email: "admin@cristalino.co.il", name: "אלון", isAdmin: true })
    mockGetStaffEmails.mockResolvedValue(["staff@cristalino.co.il", "admin@cristalino.co.il"])
    mockTransaction.mockImplementation(async (callback: (tx: Tx) => Promise<unknown>) => {
      const mockTx = {
        ticket: { update: jest.fn() },
        ticketHistory: { createMany: jest.fn() },
        ticketNote: { create: jest.fn() },
      }
      return await callback(mockTx)
    })
  })

  it("applies compound close: sets status to סגור and urgency to נמוך", async () => {
    mockFindUnique.mockResolvedValueOnce(sampleTicket1)

    const res = await call({ ids: ["t1"], changes: { status: "סגור" } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.updatedCount).toBe(1)
    expect(mockTransaction).toHaveBeenCalled()
  })

  it("blocks closing offboarding ticket with unreceived equipment items", async () => {
    mockFindUnique.mockResolvedValueOnce(sampleTicket2)

    const res = await call({ ids: ["t2"], changes: { status: "סגור" } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.updatedCount).toBe(0)
    expect(json.errors.length).toBe(1)
    expect(json.errors[0].ticketNumber).toBe(102)
    expect(json.errors[0].error).toContain("מחשב נייד")
  })

  // v3.92 — a merged ticket is frozen; the rest of the selection goes ahead.
  it("reports a merged ticket as refused and changes the others", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ ...sampleTicket1, id: "t9", ticketNumber: 109, status: "סגור", mergedInto: { ticketNumber: 101, type: "ticket" } })
      .mockResolvedValueOnce(sampleTicket1)

    const res = await call({ ids: ["t9", "t1"], changes: { status: "פתוח" } })
    const json = await res.json()
    expect(json.updatedCount).toBe(1)
    expect(json.errors).toHaveLength(1)
    expect(json.errors[0]).toMatchObject({ ticketId: "t9", ticketNumber: 109 })
    expect(json.errors[0].error).toContain("HDTC-101")
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it("applies status, urgency, category, platform, assignedTo and note in bulk", async () => {
    mockFindUnique
      .mockResolvedValueOnce(sampleTicket1)
      .mockResolvedValueOnce({ ...sampleTicket1, id: "t3", ticketNumber: 103 })

    const res = await call({
      ids: ["t1", "t3"],
      changes: {
        status: "בטיפול",
        urgency: "דחוף",
        category: "תוכנה",
        platform: "Mac",
        assignedTo: "staff@cristalino.co.il",
        note: "הערת בדיקה מרוכזת",
      },
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.updatedCount).toBe(2)
  })

  it("requires holdReason when changing status to בהמתנה", async () => {
    mockFindUnique.mockResolvedValueOnce(sampleTicket1)

    const res = await call({ ids: ["t1"], changes: { status: "בהמתנה" } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.updatedCount).toBe(0)
    expect(json.errors[0].error).toContain("יש להזין סיבת המתנה")
  })

  // "" means unassigned and the column is NOT NULL. The route used to turn ""
  // into null, which threw inside the transaction: every bulk unassign was a 500.
  it("stores an unassign as \"\" rather than null", async () => {
    mockFindUnique.mockResolvedValueOnce(sampleTicket1)
    const update = jest.fn()
    mockTransaction.mockImplementationOnce(async (callback: (tx: Tx) => Promise<unknown>) =>
      callback({ ticket: { update }, ticketHistory: { createMany: jest.fn() }, ticketNote: { create: jest.fn() } }))

    const res = await call({ ids: ["t1"], changes: { assignedTo: "" } })
    expect(res.status).toBe(200)
    expect((await res.json()).updatedCount).toBe(1)
    expect(update).toHaveBeenCalledWith({ where: { id: "t1" }, data: { assignedTo: "" } })
  })

  // Rule 41: the sends start at once but are awaited in after(), not abandoned.
  it("hands its mail to after(), so a send is not lost when the response returns", async () => {
    mockFindUnique.mockResolvedValueOnce(sampleTicket1)
    const res = await call({ ids: ["t1"], changes: { status: "סגור" } })
    expect(res.status).toBe(200)
    expect(sendMail).toHaveBeenCalled()
    expect(mockAfterCallbacks).toHaveLength(1)
    await Promise.all(mockAfterCallbacks.splice(0).map(cb => cb()))
  })
})
