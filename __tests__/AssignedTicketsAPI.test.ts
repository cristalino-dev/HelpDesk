/**
 * __tests__/AssignedTicketsAPI.test.ts — GET /api/tickets/assigned
 *
 * The other half of a staff member's personal board. v3.72 scoped
 * GET /api/tickets to tickets the caller OPENED, which was right, and in doing
 * so removed the only place a technician saw the tickets ASSIGNED to them —
 * they had been visible on /dashboard purely because an admin saw everything.
 * Found in production: 22 open tickets assigned to one admin, none shown.
 *
 * What this pins down: who may ask (staff, by isAdmin OR STAFF_EMAILS — rule
 * 26 — and nobody else), and exactly which tickets come back (assigned to the
 * caller regardless of case, not closed, with the owner attached).
 */

import { GET } from "@/app/api/tickets/assigned/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({ prisma: { ticket: { findMany: jest.fn() } } }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({ STAFF_EMAILS: ["staff@cristalino.co.il"] }))
jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) =>
      ({ status: init?.status ?? 200, json: async () => data }),
  },
}))

type Res = { status: number; json: () => Promise<unknown> }
const findMany = prisma.ticket.findMany as jest.Mock
const session = (user: Record<string, unknown> | null) =>
  (auth as jest.Mock).mockResolvedValue(user ? { user } : null)
const call = () => GET() as unknown as Promise<Res>

const ROWS = [{ id: "t1", ticketNumber: 501, assignedTo: "admin@cristalino.co.il", status: "בטיפול" }]

beforeEach(() => {
  jest.clearAllMocks()
  findMany.mockResolvedValue(ROWS)
})

describe("who may ask", () => {
  it("rejects a request with no session", async () => {
    session(null)
    expect((await call()).status).toBe(401)
    expect(findMany).not.toHaveBeenCalled()
  })

  it("rejects a session with no email", async () => {
    session({ isAdmin: true })
    expect((await call()).status).toBe(401)
  })

  it("refuses an ordinary employee, without touching the database", async () => {
    session({ email: "worker@cristalino.co.il", isAdmin: false })
    expect((await call()).status).toBe(403)
    expect(findMany).not.toHaveBeenCalled()
  })

  // /api/tickets/all admits viewers; this does not. Nobody assigns work to a
  // read-only observer, so there is no list to give them.
  it("refuses a viewer, unlike the read-only queue", async () => {
    session({ email: "ran@cristalino.co.il", isAdmin: false })
    expect((await call()).status).toBe(403)
  })

  it("admits an admin who is not in STAFF_EMAILS — admin implies staff (rule 26)", async () => {
    session({ email: "admin@cristalino.co.il", isAdmin: true })
    expect((await call()).status).toBe(200)
  })

  it("admits a STAFF_EMAILS member who is not an admin", async () => {
    session({ email: "staff@cristalino.co.il", isAdmin: false })
    expect((await call()).status).toBe(200)
  })
})

describe("which tickets come back", () => {
  beforeEach(() => session({ email: "admin@cristalino.co.il", isAdmin: true }))

  it("asks for tickets assigned to the caller, ignoring case", async () => {
    await call()
    expect(findMany.mock.calls[0][0].where.assignedTo)
      .toEqual({ equals: "admin@cristalino.co.il", mode: "insensitive" })
  })

  // Closed work is history, and the queue has it. A personal board of
  // everything ever assigned would grow without bound.
  it("leaves out closed tickets", async () => {
    await call()
    expect(findMany.mock.calls[0][0].where.status).toEqual({ not: "סגור" })
  })

  // On-hold is still the technician's problem. It must not be filtered out
  // along with closed — six of the 22 tickets in the report were בהמתנה.
  it("does not filter on anything else — on-hold tickets are included", async () => {
    await call()
    expect(Object.keys(findMany.mock.calls[0][0].where).sort()).toEqual(["assignedTo", "status"])
  })

  it("attaches whose ticket it is, so each card can say", async () => {
    await call()
    expect(findMany.mock.calls[0][0].include).toEqual({ user: { select: { name: true, email: true } } })
  })

  it("returns the rows it found", async () => {
    expect(await (await call()).json()).toEqual(ROWS)
  })

  it("logs and answers 500 when the database throws", async () => {
    findMany.mockRejectedValue(new Error("db down"))
    const res = await call()
    expect(res.status).toBe(500)
    expect(logError).toHaveBeenCalledWith("db down", "/api/tickets/assigned GET", expect.any(String))
  })
})
