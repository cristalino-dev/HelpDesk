/**
 * @jest-environment node
 */
/**
 * __tests__/relineRoute.test.ts — POST /api/tickets/[id]/reline (v3.102)
 *
 * This route mails a person's name, phone and address to a company outside
 * Cristalino. So what is pinned is who may do that, where it goes, and that
 * the escalation is on record before the 200 — the button reads "נשלח" from
 * that row, so a 200 that had not written it would lie to the next reader.
 */

import type { NextRequest } from "next/server"
import { POST, PATCH } from "@/app/api/tickets/[id]/reline/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({ STAFF_EMAILS: ["alon@cristalino.co.il"] }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => {}),
  mailRelineRequest: jest.fn(() => "<html>reline</html>"),
}))
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: jest.fn(), update: jest.fn() },
    ticketHistory: { create: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  },
}))
jest.mock("next/server", () => {
  class NextResponse {
    status: number
    body: unknown
    constructor(body: unknown, init?: { status?: number }) { this.body = body; this.status = init?.status ?? 200 }
    static json(d: unknown, init?: { status?: number }) { return new NextResponse(d, init) }
    async json() { return this.body }
  }
  return { NextResponse, after: jest.fn((cb: () => Promise<void>) => cb()) }
})

type Res = { status: number; json: () => Promise<Record<string, unknown>> }
const call = (id = "t1") =>
  POST({} as NextRequest, { params: Promise.resolve({ id }) }) as unknown as Promise<Res>
const patch = (body: unknown, id = "t1") =>
  PATCH({ json: async () => body } as unknown as NextRequest,
        { params: Promise.resolve({ id }) }) as unknown as Promise<Res>

const TICKET = {
  id: "t1", ticketNumber: 862, type: "request", status: "פתוח", subject: "המדפסת לא עובדת",
  description: "לא מדפיסה בכלל", category: "חומרה", platform: "מחשב אישי", urgency: "גבוה",
  phone: "052-2222222", createdAt: new Date("2026-10-18T14:44:00Z"), relineRef: null,
  mergedInto: null, user: { name: "דנה לוי", email: "dana@cristalino.co.il", phone: "050-1111111" },
}

const asStaff = () => (auth as jest.Mock).mockResolvedValue({ user: { email: "alon@cristalino.co.il", name: "אלון כרם", isAdmin: false } })

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(TICKET)
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (ops: unknown[]) => ops)
})

describe("who may escalate", () => {
  it("turns away a signed-out caller and an ordinary user", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await call()).status).toBe(401)
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "dana@cristalino.co.il", isAdmin: false } })
    expect((await call()).status).toBe(403)
    expect(sendMail).not.toHaveBeenCalled()
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })

  it("lets an admin who is not on the staff list through", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "boss@cristalino.co.il", isAdmin: true } })
    expect((await call()).status).toBe(200)
  })
})

describe("the escalation", () => {
  it("mails Reline, with our label in the subject", async () => {
    asStaff()
    const res = await call()
    expect(res.status).toBe(200)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "support@reline.co.il",
      subject: "[REQ-862] המדפסת לא עובדת",
    }))
  })

  // The button reads "נשלח" off this row, so a 200 without it would lie.
  it("records that it went before answering", async () => {
    asStaff()
    await call()
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "t1" },
      data: expect.objectContaining({ relineSentAt: expect.any(Date) }),
    }))
    expect(prisma.ticketHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ field: "reline", actorEmail: "alon@cristalino.co.il" }),
    }))
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it("is 404 for a ticket that is not there", async () => {
    asStaff()
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null)
    expect((await call("nope")).status).toBe(404)
    expect(sendMail).not.toHaveBeenCalled()
  })

  // The conversation moved; escalating this one would send a dead reference.
  it("refuses a merged ticket with 409", async () => {
    asStaff()
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      ...TICKET, mergedInto: { ticketNumber: 900, type: "ticket" },
    })
    expect((await call()).status).toBe(409)
    expect(sendMail).not.toHaveBeenCalled()
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })
})

// ── Parking the ticket while Reline hold it (v3.103) ─────────────────────────
describe("what the escalation does to the ticket", () => {
  it("moves it to ממתין לגורם חיצוני and records the change", async () => {
    asStaff()
    const res = await call()
    expect((await res.json()).status).toBe("ממתין לגורם חיצוני")
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ממתין לגורם חיצוני", relineSentAt: expect.any(Date) }),
    }))
    expect(prisma.ticketHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ field: "status", oldValue: "פתוח", newValue: "ממתין לגורם חיצוני" }),
    }))
  })

  // Escalating a closed ticket is for the record, not a reopening.
  it("leaves a closed ticket closed", async () => {
    asStaff()
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...TICKET, status: "סגור" })
    const res = await call()
    expect((await res.json()).status).toBe("סגור")
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ status: expect.anything() }),
    }))
  })

  // A second send is a new case at their end, so the old number describes
  // nothing and must not sit there looking current.
  it("clears a previous reference and reply time on a re-send", async () => {
    asStaff()
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...TICKET, relineRef: "111111" })
    await call()
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ relineRef: null, relineRepliedAt: null }),
    }))
  })
})

// ── When no acknowledgement ever arrives ─────────────────────────────────────
describe("typing the reference in by hand", () => {
  beforeEach(() => { (prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ relineRef: null }) })

  it("saves it, and stamps when it was recorded", async () => {
    asStaff()
    const res = await patch({ ref: "269311" })
    expect(res.status).toBe(200)
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { relineRef: "269311", relineRepliedAt: expect.any(Date) },
    }))
  })

  // A hand-entered number must never read as one Reline sent.
  it("attributes it to the staff member, not to Reline", async () => {
    asStaff()
    await patch({ ref: "269311" })
    expect(prisma.ticketHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ field: "relineRef", actorEmail: "alon@cristalino.co.il" }),
    }))
  })

  it("clears it, and the reply time with it", async () => {
    asStaff()
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ relineRef: "269311" })
    await patch({ ref: null })
    expect(prisma.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { relineRef: null, relineRepliedAt: null },
    }))
  })

  it("refuses anything that is not a case number", async () => {
    asStaff()
    for (const ref of ["abc", "26 9311", "12", "<script>"]) {
      expect((await patch({ ref })).status).toBe(400)
    }
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })

  it("is staff only", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "dana@cristalino.co.il", isAdmin: false } })
    expect((await patch({ ref: "269311" })).status).toBe(403)
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await patch({ ref: "269311" })).status).toBe(401)
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })
})
