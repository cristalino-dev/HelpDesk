/**
 * @jest-environment node
 */
/**
 * __tests__/ticketTypeApi.test.ts — opening a request, and turning a ticket
 * into one (v3.87).
 *
 * POST /api/tickets stores the type the form sent (anything but "request" is a
 * ticket) and labels its mail by it. PATCH lets STAFF change the type, and the
 * change goes into the ticket's history; an owner's PATCH cannot.
 */

import type { NextRequest } from "next/server"
import { POST, PATCH } from "@/app/api/tickets/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    ticket: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    ticketHistory: { create: jest.fn(), createMany: jest.fn() },
    ticketNote: { create: jest.fn() },
    ticketEquipment: { findMany: jest.fn(), createMany: jest.fn() },
    fieldOption: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({ STAFF_EMAILS: ["helpdesk@cristalino.co.il"], BOT_EMAIL: "bot@cristalino.co.il" }))
jest.mock("@/lib/staffMembers", () => ({ getStaffEmails: jest.fn(async () => ["alon@cristalino.co.il"]) }))
jest.mock("@/lib/users", () => ({ findUserByEmail: jest.fn(), resolveUserByEmail: jest.fn() }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => {}),
  mailTicketOpenedStaff: jest.fn(() => ""),
  mailTicketOpenedUser: jest.fn(() => ""),
  mailTicketUpdatedStaff: jest.fn(() => ""),
  mailTicketStatusUser: jest.fn(() => ""),
  mailTicketClosedWithReview: jest.fn(() => ""),
}))
jest.mock("next/server", () => ({
  after: (cb: () => unknown) => { void cb() },
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}))

const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const signedIn = (user: Record<string, unknown>) => (auth as jest.Mock).mockResolvedValue({ user })

const EMPLOYEE = { email: "dana@cristalino.co.il", name: "דנה", isAdmin: false }
const ADMIN = { email: "alon@cristalino.co.il", name: "אלון", isAdmin: true }
const FORM = { subject: "מסך נוסף", description: "צריך מסך שני", phone: "050", computerName: "PC-1", urgency: "בינוני", category: "אחר", platform: "מחשב אישי" }

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1", email: EMPLOYEE.email, name: EMPLOYEE.name })
  ;(prisma.ticket.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    ({ id: "t1", ticketNumber: 601, status: "פתוח", ...data }))
})

describe("POST /api/tickets — the type", () => {
  it("opens a request as a request, labelled REQ-N in its mail", async () => {
    signedIn(EMPLOYEE)
    const res = await POST(req({ ...FORM, type: "request" })) as unknown as { status: number }
    expect(res.status).toBe(200)
    expect((prisma.ticket.create as jest.Mock).mock.calls[0][0].data.type).toBe("request")
    const subjectsSent = (sendMail as jest.Mock).mock.calls.map(c => c[0].subject as string)
    expect(subjectsSent.length).toBeGreaterThan(0)
    for (const s of subjectsSent) expect(s).toContain("REQ-601")
  })

  it("opens anything else as a ticket", async () => {
    signedIn(EMPLOYEE)
    await POST(req({ ...FORM, type: "urgent-please" }))
    await POST(req(FORM))
    const types = (prisma.ticket.create as jest.Mock).mock.calls.map(c => c[0].data.type)
    expect(types).toEqual(["ticket", "ticket"])
  })
})

describe("PATCH /api/tickets — changing the type", () => {
  const before = {
    id: "t1", ticketNumber: 597, type: "ticket", status: "פתוח", urgency: "בינוני", category: "אחר",
    platform: "מחשב אישי", subject: "s", description: "d", phone: "", computerName: "",
    assignedTo: "helpdesk@cristalino.co.il", updatedAt: new Date(), userId: "u1",
    user: { name: "דנה", email: EMPLOYEE.email },
  }

  beforeEach(() => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(before)
    ;(prisma.$transaction as jest.Mock).mockImplementation(async () => [{ ...before, type: "request" }])
  })

  it("lets staff turn a ticket into a request, and records it in the history", async () => {
    signedIn(ADMIN)
    const res = await PATCH(req({ id: "t1", type: "request" })) as unknown as { status: number }
    expect(res.status).toBe(200)
    expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: "t1" }, data: expect.objectContaining({ type: "request" }) })
    const rows = (prisma.ticketHistory.createMany as jest.Mock).mock.calls[0][0].data
    expect(rows).toContainEqual(expect.objectContaining({ field: "type", oldValue: "ticket", newValue: "request" }))
  })

  it("ignores a type sent by the ticket's owner", async () => {
    signedIn(EMPLOYEE)
    await PATCH(req({ id: "t1", status: "סגור", type: "request" }))
    const data = (prisma.ticket.update as jest.Mock).mock.calls[0][0].data
    expect(data).not.toHaveProperty("type")
  })
})
