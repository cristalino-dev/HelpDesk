/**
 * __tests__/ReportsAPI.test.ts — GET /api/admin/reports
 *
 * The route's whole job is resolving a close DATE for tickets that have no
 * closedAt column. Everything subtle about the reports lives in that mapping:
 *
 *   • a reopened ticket has several "→ סגור" history rows and must yield the
 *     LATEST one, not the first;
 *   • a ticket that was closed and then reopened is OPEN, and must carry no
 *     close date at all — otherwise the backlog line sinks below the truth;
 *   • a closed ticket whose closure predates the history feature has no row,
 *     and must come back as closed-but-undated rather than silently open.
 */

import { GET } from "@/app/api/admin/reports/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findMany: jest.fn() },
    ticketHistory: { findMany: jest.fn() },
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

const admin = { user: { email: "alon@cristalino.co.il", isAdmin: true } }

const ticket = (over: Record<string, unknown> = {}) => ({
  id: "t1", ticketNumber: 1, createdAt: new Date("2026-09-01T08:00:00Z"),
  category: "אחר", urgency: "בינוני", platform: "מחשב אישי",
  status: "פתוח", assignedTo: "helpdesk@cristalino.co.il", ...over,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = async () => ((await GET()) as any).data.tickets

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue(admin)
  ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([])
})

describe("access", () => {
  it("rejects a signed-out caller", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await GET()) as any).status).toBe(401)
  })

  it("rejects a signed-in non-admin — ticket analytics is not a user-facing page", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "x@y.com", isAdmin: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await GET()) as any).status).toBe(403)
  })

  it("does not touch the database when the caller is refused", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    await GET()
    expect(prisma.ticket.findMany).not.toHaveBeenCalled()
  })
})

describe("resolving the close date", () => {
  it("dates a closed ticket from its status history", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket({ status: "סגור" })])
    ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([
      { ticketId: "t1", changedAt: new Date("2026-09-02T10:00:00Z") },
    ])
    expect((await rows())[0].closedAt).toBe("2026-09-02T10:00:00.000Z")
  })

  it("takes the LAST closure when a ticket was closed, reopened and closed again", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket({ status: "סגור" })])
    ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([
      { ticketId: "t1", changedAt: new Date("2026-09-02T10:00:00Z") },
      { ticketId: "t1", changedAt: new Date("2026-09-09T10:00:00Z") },
    ])
    expect((await rows())[0].closedAt).toBe("2026-09-09T10:00:00.000Z")
  })

  it("gives a reopened ticket NO close date, even though it has closure history", async () => {
    // This is the one that would sink the backlog: the ticket is open again,
    // so its old closure must not count against the queue.
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket({ status: "בטיפול" })])
    ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([
      { ticketId: "t1", changedAt: new Date("2026-09-02T10:00:00Z") },
    ])
    const r = (await rows())[0]
    expect(r.closedAt).toBeNull()
    expect(r.status).toBe("בטיפול")
  })

  it("reports a closed ticket with no history row as closed but undated", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket({ status: "סגור" })])
    const r = (await rows())[0]
    expect(r.status).toBe("סגור")
    expect(r.closedAt).toBeNull()
  })

  it("never attributes one ticket's closure to another", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([
      ticket({ id: "t1", ticketNumber: 1, status: "סגור" }),
      ticket({ id: "t2", ticketNumber: 2, status: "סגור" }),
    ])
    ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([
      { ticketId: "t2", changedAt: new Date("2026-09-05T10:00:00Z") },
    ])
    const r = await rows()
    expect(r[0].closedAt).toBeNull()
    expect(r[1].closedAt).toBe("2026-09-05T10:00:00.000Z")
  })

  it("only asks the database for closure rows, not the whole history table", async () => {
    await GET()
    expect((prisma.ticketHistory.findMany as jest.Mock).mock.calls[0][0].where)
      .toEqual({ field: "status", newValue: "סגור" })
  })
})

describe("the payload", () => {
  it("flattens the dimensions the report breaks down by", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([
      ticket({ category: "תוכנה", urgency: "דחוף", platform: "נייד", assignedTo: "a@b.c" }),
    ])
    expect((await rows())[0]).toEqual({
      ticketNumber: 1,
      createdAt: "2026-09-01T08:00:00.000Z",
      closedAt: null,
      category: "תוכנה", urgency: "דחוף", platform: "נייד",
      status: "פתוח", assignedTo: "a@b.c",
    })
  })

  it("returns 500 rather than a half-built report when the query fails", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockRejectedValue(new Error("db down"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await GET()) as any).status).toBe(500)
  })
})
