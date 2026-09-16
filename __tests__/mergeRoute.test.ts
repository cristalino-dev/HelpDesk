/**
 * __tests__/mergeRoute.test.ts — GET and POST /api/tickets/merge (v3.92).
 *
 * The rules are lib/ticketMerge.ts's, tested in ticketMerge.test.ts. Here: who
 * may merge, what the dialog is shown before a merge, and what the route
 * answers — all or nothing, 409 with the reasons when a merge is refused.
 */

import type { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/tickets/merge/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { mergeTickets } from "@/lib/ticketMerge"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({ prisma: { ticket: { findUnique: jest.fn() } } }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({ STAFF_EMAILS: ["staff@cristalino.co.il"] }))
jest.mock("@/lib/mail", () => ({ sendMail: jest.fn(), mailTicketMerged: jest.fn(), mailTicketUpdatedStaff: jest.fn() }))
jest.mock("@/lib/ticketMerge", () => ({ ...jest.requireActual("@/lib/ticketMerge"), mergeTickets: jest.fn() }))

const mockAfter: (() => unknown)[] = []
jest.mock("next/server", () => ({
  after: (cb: () => unknown) => { mockAfter.push(cb) },
  NextResponse: class {
    status: number
    data: unknown
    constructor(data: unknown, init?: { status?: number }) { this.data = data; this.status = init?.status ?? 200 }
    static json(data: unknown, init?: { status?: number }) {
      return new (this as unknown as { new (d: unknown, i?: { status?: number }): unknown })(data, init)
    }
    async json() { return this.data }
  },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { status: number; json: () => Promise<any> }

const DANA = { id: "u-dana", name: "דנה לוי", email: "dana@cristalino.co.il" }
const RON  = { id: "u-ron", name: "רון כהן", email: "ron@cristalino.co.il" }

function row(id: string, ticketNumber: number, extra: Record<string, unknown> = {}) {
  return {
    id, ticketNumber, type: "ticket", subject: `פנייה ${ticketNumber}`, description: "", status: "פתוח", urgency: "בינוני",
    createdAt: new Date(`2026-09-0${ticketNumber}T08:00:00Z`), mergedIntoId: null, mergedInto: null,
    user: DANA, participants: [], _count: { messages: 1, notes: 0, attachments: 2, equipment: 0 },
    ...extra,
  }
}

const TICKETS: Record<string, ReturnType<typeof row>> = {
  t1: row("t1", 1),
  t2: row("t2", 2, { user: RON }),
  t3: row("t3", 3, { mergedIntoId: "t1", mergedInto: { ticketNumber: 1, type: "ticket" } }),
}

const staff = () => (auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "צוות", isAdmin: false } })
const get = (refs: string) =>
  GET({ nextUrl: new URL(`https://x/api/tickets/merge?refs=${encodeURIComponent(refs)}`) } as unknown as NextRequest) as unknown as Promise<Res>
const post = (body: unknown) => POST({ json: async () => body } as unknown as NextRequest) as unknown as Promise<Res>

beforeEach(() => {
  jest.clearAllMocks()
  mockAfter.length = 0
  staff()
  ;(prisma.ticket.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id?: string; ticketNumber?: number } }) =>
    where.id ? TICKETS[where.id] ?? null : Object.values(TICKETS).find(t => t.ticketNumber === where.ticketNumber) ?? null)
})

describe("who may merge", () => {
  it("refuses a request without a session", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await get("t1,t2")).status).toBe(401)
    expect((await post({ targetId: "t1", sourceIds: ["t2"] })).status).toBe(401)
  })

  it("refuses anyone who is not staff", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "dana@cristalino.co.il", isAdmin: false } })
    expect((await get("t1,t2")).status).toBe(403)
    expect((await post({ targetId: "t1", sourceIds: ["t2"] })).status).toBe(403)
    expect(mergeTickets).not.toHaveBeenCalled()
  })

  it("lets an admin merge", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "boss@cristalino.co.il", isAdmin: true } })
    expect((await get("t1,t2")).status).toBe(200)
  })
})

describe("GET — what the dialog shows", () => {
  it("finds tickets by label, by number and by id", async () => {
    const body = await (await get("HDTC-1, 2,t3")).json()
    expect(body.tickets.map((t: { label: string }) => t.label)).toEqual(["HDTC-1", "HDTC-2", "HDTC-3"])
    expect(body.notFound).toEqual([])
  })

  it("names what it could not find", async () => {
    const body = await (await get("HDTC-1,HDTC-99")).json()
    expect(body.tickets).toHaveLength(1)
    expect(body.notFound).toEqual(["HDTC-99"])
  })

  it("describes each ticket, and why each could not be the one that stays", async () => {
    const body = await (await get("t1,t2,t3")).json()
    const [t1, t2, t3] = body.tickets
    expect(t2).toMatchObject({
      id: "t2", subject: "פנייה 2", owner: { name: "רון כהן", email: RON.email },
      counts: { messages: 1, notes: 0, attachments: 2, equipment: 0 }, mergedInto: null,
    })
    // t3 was already merged into t1: whichever stays, t3 is a problem.
    expect(t1.problems.join(" ")).toContain("HDTC-3")
    expect(t3.mergedInto).toBe("HDTC-1")
    expect(t3.problems.join(" ")).toContain("כבר מוזגה")
  })

  it("counts one ticket named twice once", async () => {
    const body = await (await get("t1,HDTC-1")).json()
    expect(body.tickets).toHaveLength(1)
  })

  it("asks for at least one ticket, and at most ten", async () => {
    expect((await get("")).status).toBe(400)
    expect((await get(Array.from({ length: 11 }, (_, i) => `HDTC-${i + 1}`).join(","))).status).toBe(400)
  })
})

describe("POST — the merge", () => {
  it("merges the sources into the target and answers with their labels", async () => {
    const mail = Promise.resolve()
    ;(mergeTickets as jest.Mock).mockResolvedValue({
      ok: true, target: TICKETS.t1, merged: [TICKETS.t2], participantsAdded: [RON], mails: [mail],
    })
    const res = await post({ targetId: "t1", sourceIds: ["t2"] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      target: { id: "t1", ticketNumber: 1, type: "ticket", label: "HDTC-1" },
      merged: [{ id: "t2", ticketNumber: 2, type: "ticket", label: "HDTC-2" }],
      participantsAdded: [{ name: "רון כהן", email: RON.email }],
    })
    const call = (mergeTickets as jest.Mock).mock.calls[0][0]
    expect(call.target.id).toBe("t1")
    expect(call.sources.map((s: { id: string }) => s.id)).toEqual(["t2"])
    expect(call.actor).toEqual({ name: "צוות", email: "staff@cristalino.co.il" })
    // The mail is left to after() (rule 41).
    expect(mockAfter).toHaveLength(1)
  })

  it("answers 409 with the reasons, when the merge is refused", async () => {
    ;(mergeTickets as jest.Mock).mockResolvedValue({
      ok: false, problems: [{ ticketId: "t3", label: "HDTC-3", error: "HDTC-3 כבר מוזגה ל-HDTC-1" }],
    })
    const res = await post({ targetId: "t2", sourceIds: ["t3"] })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe("HDTC-3 כבר מוזגה ל-HDTC-1")
    expect(body.problems).toHaveLength(1)
    expect(mockAfter).toHaveLength(0)
  })

  it("asks for a target and at least one source", async () => {
    expect((await post({ sourceIds: ["t2"] })).status).toBe(400)
    expect((await post({ targetId: "t1", sourceIds: [] })).status).toBe(400)
    expect((await post({ targetId: "t1" })).status).toBe(400)
    expect((await post(null)).status).toBe(400)
    expect(mergeTickets).not.toHaveBeenCalled()
  })

  it("answers 404 when a ticket does not exist", async () => {
    expect((await post({ targetId: "nope", sourceIds: ["t2"] })).status).toBe(404)
    expect((await post({ targetId: "t1", sourceIds: ["nope"] })).status).toBe(404)
    expect(mergeTickets).not.toHaveBeenCalled()
  })

  it("names each source once, however often it was sent", async () => {
    ;(mergeTickets as jest.Mock).mockResolvedValue({ ok: true, target: TICKETS.t1, merged: [TICKETS.t2], participantsAdded: [], mails: [] })
    await post({ targetId: "t1", sourceIds: ["t2", "t2"] })
    expect((mergeTickets as jest.Mock).mock.calls[0][0].sources).toHaveLength(1)
  })
})
