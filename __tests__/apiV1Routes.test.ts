/**
 * @jest-environment node
 */
/**
 * __tests__/apiV1Routes.test.ts — the public API, route by route (v3.88).
 *
 * Driven with a real key check (lib/apiKeys.ts) against a mocked database:
 * who may call what, what each route writes, what the history says, and when
 * mail goes out.
 */

import type { NextRequest } from "next/server"
import { GET as listTickets, POST as createTicket } from "@/app/api/v1/tickets/route"
import { GET as getTicket, PATCH as updateTicket } from "@/app/api/v1/tickets/[ref]/route"
import { POST as addMessage } from "@/app/api/v1/tickets/[ref]/messages/route"
import { POST as addNote } from "@/app/api/v1/tickets/[ref]/notes/route"
import { GET as getOptions } from "@/app/api/v1/options/route"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { resolveUserByEmail } from "@/lib/users"
import { hashKey, resetApiKeyState } from "@/lib/apiKeys"

const WRITE_KEY = "hdk_write-key-for-the-tests-000000000000000000"
const READ_KEY = "hdk_read-key-for-the-tests-0000000000000000000"
const mockAfter: (() => unknown)[] = []
const mockTxUpdate = jest.fn()
const mockTxHistory = jest.fn()

jest.mock("@/lib/db", () => ({
  prisma: {
    apiKey: { findUnique: jest.fn(), update: jest.fn() },
    ticket: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    ticketHistory: { create: jest.fn() },
    ticketMessage: { create: jest.fn() },
    ticketNote: { create: jest.fn() },
    fieldOption: { findMany: jest.fn(async () => []) },
    appSetting: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ ticket: { update: mockTxUpdate }, ticketHistory: { createMany: mockTxHistory }, ticketNote: { create: jest.fn() } })),
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("@/lib/staffMembers", () => ({ getStaffEmails: jest.fn(async () => ["alon@cristalino.co.il"]) }))
jest.mock("@/lib/users", () => ({ resolveUserByEmail: jest.fn() }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => {}),
  mailTicketOpenedStaff: jest.fn(() => ""), mailTicketOpenedUser: jest.fn(() => ""),
  mailNewMessageToUser: jest.fn(() => ""), mailTicketUpdatedStaff: jest.fn(() => ""),
  mailTicketStatusUser: jest.fn(() => ""), mailTicketClosedWithReview: jest.fn(() => ""),
}))
jest.mock("next/server", () => ({
  after: (cb: () => unknown) => { mockAfter.push(cb) },
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}))

type Res = { status: number; json: () => Promise<Record<string, any>> }   // eslint-disable-line @typescript-eslint/no-explicit-any
const request = (key: string | null, body?: unknown, url = "http://h/api/v1/tickets") => ({
  url,
  headers: { get: (k: string) => (k.toLowerCase() === "authorization" && key ? `Bearer ${key}` : null) },
  json: async () => body,
}) as unknown as NextRequest
const ref = (value: string) => ({ params: Promise.resolve({ ref: value }) })
const run = (p: unknown) => p as Promise<Res>

const t0 = new Date("2026-09-14T08:00:00Z")
const TICKET = {
  id: "c1", ticketNumber: 597, type: "ticket", subject: "מדפסת", description: "לא מדפיסה", status: "פתוח",
  holdReason: null, urgency: "בינוני", category: "אחר", platform: "מחשב אישי", assignedTo: "helpdesk@cristalino.co.il",
  phone: "", computerName: "", createdAt: t0, updatedAt: t0, userId: "u1",
  user: { name: "דנה", email: "dana@cristalino.co.il" }, equipment: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockAfter.length = 0
  resetApiKeyState()
  ;(prisma.apiKey.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { hash: string } }) =>
    where.hash === hashKey(WRITE_KEY) ? { id: "kw", name: "ERP", prefix: "hdk_write-ke", scope: "write", revokedAt: null }
    : where.hash === hashKey(READ_KEY) ? { id: "kr", name: "BI", prefix: "hdk_read-key", scope: "read", revokedAt: null }
    : null)
  ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(TICKET)
})

describe("GET /api/v1/tickets", () => {
  it("wants a key", async () => {
    const res = await run(listTickets(request(null)))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe("unauthorized")
  })

  it("lists a page, filtered as asked", async () => {
    ;(prisma.ticket.count as jest.Mock).mockResolvedValue(120)
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([{ ...TICKET, type: "request", ticketNumber: 601 }])
    const res = await run(listTickets(request(READ_KEY, undefined, "http://h/api/v1/tickets?type=request&limit=50&page=2")))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].label).toBe("REQ-601")
    expect(body.page).toEqual({ number: 2, limit: 50, total: 120, pages: 3 })
    const args = (prisma.ticket.findMany as jest.Mock).mock.calls[0][0]
    expect(args.where).toEqual({ AND: [{ type: { in: ["request"] } }] })
    expect({ skip: args.skip, take: args.take }).toEqual({ skip: 50, take: 50 })
  })

  it("says which parameter it did not understand", async () => {
    const res = await run(listTickets(request(READ_KEY, undefined, "http://h/api/v1/tickets?colour=red")))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toEqual({ code: "invalid_query", message: "unknown parameter: colour" })
  })
})

describe("POST /api/v1/tickets", () => {
  const body = { type: "request", subject: "מסך נוסף", description: "צריך מסך שני", ownerEmail: "dana@cristalino.co.il" }

  beforeEach(() => {
    ;(resolveUserByEmail as jest.Mock).mockResolvedValue({ id: "u1", name: "דנה", email: "dana@cristalino.co.il" })
    ;(prisma.ticket.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      ({ ...TICKET, ticketNumber: 601, ...data, user: { name: "דנה", email: "dana@cristalino.co.il" } }))
  })

  it("is closed to a read-only key", async () => {
    expect((await run(createTicket(request(READ_KEY, body)))).status).toBe(403)
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })

  it("opens the ticket in the owner's name, records the program, and mails as the form does", async () => {
    const res = await run(createTicket(request(WRITE_KEY, body)))
    expect(res.status).toBe(201)
    expect((await res.json()).data.label).toBe("REQ-601")
    expect((prisma.ticket.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ type: "request", userId: "u1", urgency: "בינוני" })
    expect((prisma.ticketHistory.create as jest.Mock).mock.calls[0][0].data).toMatchObject({ field: "created", actorName: "API: ERP" })
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(mockAfter).toHaveLength(1)
  })

  it("sends nothing when told not to", async () => {
    await run(createTicket(request(WRITE_KEY, { ...body, notify: false })))
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("lists every problem with the body", async () => {
    const res = await run(createTicket(request(WRITE_KEY, { subject: "" })))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe("invalid_body")
    expect(error.message).toContain("description is required")
  })
})

describe("GET /api/v1/tickets/{ref}", () => {
  it("finds a ticket by its label, and says when there is none", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValueOnce({ ...TICKET, messages: [], notes: [], history: [], attachments: [] })
    const res = await run(getTicket(request(READ_KEY), ref("REQ-601")))
    expect(res.status).toBe(200)
    expect((prisma.ticket.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({ ticketNumber: 601 })

    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValueOnce(null)
    expect((await run(getTicket(request(READ_KEY), ref("999")))).status).toBe(404)
  })
})

describe("PATCH /api/v1/tickets/{ref}", () => {
  it("changes the ticket with the staff rules, as the program", async () => {
    const res = await run(updateTicket(request(WRITE_KEY, { status: "סגור" }), ref("HDTC-597")))
    expect(res.status).toBe(200)
    expect(mockTxUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "סגור", urgency: "נמוך" } })
    expect(mockTxHistory.mock.calls[0][0].data).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "status", newValue: "סגור", actorName: "API: ERP" }),
    ]))
    expect(mockAfter).toHaveLength(1)
  })

  it("refuses to close a leaving-employee ticket with gear still out", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      ...TICKET, category: "סגירת משתמש", equipment: [{ label: "מחשב נייד", quantity: 1, receivedQty: 0 }],
    })
    const res = await run(updateTicket(request(WRITE_KEY, { status: "סגור" }), ref("HDTC-597")))
    expect(res.status).toBe(409)
    expect(mockTxUpdate).not.toHaveBeenCalled()
  })
})

describe("messages and notes", () => {
  it("writes to the owner as staff and mails them", async () => {
    ;(prisma.ticketMessage.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", createdAt: t0, ...data }))
    const res = await run(addMessage(request(WRITE_KEY, { content: "הזמנו את המסך" }), ref("HDTC-597")))
    expect(res.status).toBe(201)
    const data = (prisma.ticketMessage.create as jest.Mock).mock.calls[0][0].data
    expect(data).toMatchObject({ authorRole: "staff", authorName: "API: ERP" })
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "dana@cristalino.co.il" }))
  })

  it("adds an internal note and mails nobody", async () => {
    ;(prisma.ticketNote.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "n1", createdAt: t0, ...data }))
    const res = await run(addNote(request(WRITE_KEY, { content: "הוזמן מספק X" }), ref("597")))
    expect(res.status).toBe(201)
    expect(sendMail).not.toHaveBeenCalled()
  })
})

describe("GET /api/v1/options", () => {
  it("hands out the configured lists and the SLA", async () => {
    const res = await run(getOptions(request(READ_KEY)))
    const { data } = await res.json()
    expect(data.type).toEqual(["ticket", "request"])
    expect(data.urgency).toEqual(["נמוך", "בינוני", "גבוה", "דחוף"])
    expect(data.sla).toEqual({ ticket: 4, request: 10 })
  })
})
