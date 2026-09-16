import { POST } from "@/app/api/tickets/[id]/messages/route"

jest.mock("@/auth", () => ({ auth: jest.fn() }))

jest.mock("@/lib/db", () => ({
  prisma: {
    user:          { findUnique: jest.fn() },
    ticket:        { findUnique: jest.fn() },
    ticketMessage: { create: jest.fn() },
  },
}))

jest.mock("@/lib/mail", () => ({
  sendMail:              jest.fn(),
  mailNewMessageToUser:  jest.fn(() => "<html>to-user</html>"),
  mailNewMessageToStaff: jest.fn(() => "<html>to-staff</html>"),
  mailReplyNotification: jest.fn(() => "<html>reply</html>"),
}))

jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))

jest.mock("@/lib/staffEmails", () => ({
  STAFF_EMAILS: ["staff@cristalino.co.il"],
}))

// Staff notification recipients are DB-driven (isAdmin users) — mock the resolver
jest.mock("@/lib/staffMembers", () => ({
  getStaffEmails: jest.fn().mockResolvedValue(["staff@cristalino.co.il"]),
}))

jest.mock("next/server", () => ({
  // after() runs its callback at once here, so what a route defers — mail,
  // the profile seed — still happens inside the test (rule 41, v3.85).
  after: (cb: () => unknown) => { void cb() },
  NextResponse: class {
    status: number; data: any
    constructor(data: any, init?: any) { this.data = data; this.status = init?.status || 200 }
    static json(data: any, init?: any) { return new (this as any)(data, init) }
    async json() { return this.data }
  },
}))

// ── helpers ────────────────────────────────────────────────────────────────────

const mockTicket = {
  id: "ticket-1", ticketNumber: 101, subject: "Test Subject",
  description: "desc", urgency: "בינוני", category: "חומרה",
  platform: "Windows", phone: "050", computerName: "PC-1", status: "פתוח",
  user: { name: "Alice", email: "alice@cristalino.co.il" },
}

const makeReq = (body: object, params = { id: "ticket-1" }) => ({
  json: async () => body,
  params: Promise.resolve(params),
})

describe("Messages API — POST /api/tickets/[id]/messages", () => {
  const { auth }    = require("@/auth")
  const { prisma }  = require("@/lib/db")
  const { sendMail, mailReplyNotification, mailNewMessageToUser, mailNewMessageToStaff } = require("@/lib/mail")

  beforeEach(() => { jest.clearAllMocks() })

  // ── auth ───────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    const res = await POST(makeReq({ content: "hi" }) as any, { params: Promise.resolve({ id: "t1" }) })
    expect((res as any).status).toBe(401)
  })

  it("returns 400 when content is empty", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", isAdmin: true } })
    const res = await POST(makeReq({ content: "  " }) as any, { params: Promise.resolve({ id: "t1" }) })
    expect((res as any).status).toBe(400)
  })

  // ── staff posts — no replyTo ───────────────────────────────────────────────

  it("staff post without replyTo → notifies ticket owner only", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
    ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-1", content: "Help is coming" })
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket)

    const res = await POST(
      makeReq({ content: "Help is coming" }) as any,
      { params: Promise.resolve({ id: "ticket-1" }) }
    ) as any

    expect(res.status).toBe(200)
    expect(mailReplyNotification).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@cristalino.co.il" }))
  })

  // ── staff replies to a specific person ────────────────────────────────────

  it("staff replies to ticket owner → sends reply notification, skips duplicate general email", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
    ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-2", content: "Got it" })
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket)

    const res = await POST(
      makeReq({
        content: "Got it",
        replyToEmail: "alice@cristalino.co.il",
        replyToName:  "Alice",
        replyToMsgId: "prev-msg-id",
      }) as any,
      { params: Promise.resolve({ id: "ticket-1" }) }
    ) as any

    expect(res.status).toBe(200)
    // Reply notification sent to Alice
    expect(mailReplyNotification).toHaveBeenCalledWith(
      expect.anything(), "Got it", "Staff", "Alice", "msg-2"
    )
    // General "new message" email NOT sent because Alice already got reply email
    expect(mailNewMessageToUser).not.toHaveBeenCalled()
    // Only 1 email total
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@cristalino.co.il" }))
  })

  it("staff replies to another staff member → sends reply + owner notification", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
    ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-3", content: "FYI" })
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket)

    const res = await POST(
      makeReq({
        content: "FYI",
        replyToEmail: "other-staff@cristalino.co.il",
        replyToName:  "Other Staff",
        replyToMsgId: "prev-msg-id",
      }) as any,
      { params: Promise.resolve({ id: "ticket-1" }) }
    ) as any

    expect(res.status).toBe(200)
    // Reply to other-staff
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "other-staff@cristalino.co.il" }))
    // Also notify ticket owner Alice (not the reply target)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@cristalino.co.il" }))
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  // ── user posts ─────────────────────────────────────────────────────────────

  it("user post without replyTo → notifies all staff", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "alice@cristalino.co.il", name: "Alice", isAdmin: false } })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1" })
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...mockTicket, userId: "u1" })
    ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-4", content: "Still broken" })

    const res = await POST(
      makeReq({ content: "Still broken" }) as any,
      { params: Promise.resolve({ id: "ticket-1" }) }
    ) as any

    expect(res.status).toBe(200)
    expect(mailReplyNotification).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["staff@cristalino.co.il"] }))
  })

  it("user replies to a staff member → sends reply notification, staff excluded from general email", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "alice@cristalino.co.il", name: "Alice", isAdmin: false } })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1" })
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...mockTicket, userId: "u1" })
    ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-5", content: "Thanks!" })

    const res = await POST(
      makeReq({
        content: "Thanks!",
        replyToEmail: "staff@cristalino.co.il",
        replyToName:  "Staff",
        replyToMsgId: "prev-msg-id",
      }) as any,
      { params: Promise.resolve({ id: "ticket-1" }) }
    ) as any

    expect(res.status).toBe(200)
    // Reply notification sent to staff member
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "staff@cristalino.co.il" }))
    // General staff email NOT sent because staff already got reply notification
    expect(mailNewMessageToStaff).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  // ── participants and merged tickets (v3.92) ────────────────────────────────

  describe("participants and merged tickets (v3.92)", () => {
    const BOB = { id: "u-bob", name: "Bob", email: "bob@cristalino.co.il" }
    const followed = { ...mockTicket, participants: [{ user: BOB }] }

    it("lets a participant write in the conversation, and tells staff", async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { email: BOB.email, name: "Bob", isAdmin: false } })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(followed)
      ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-p1", content: "גם אצלי" })

      const res = await POST(makeReq({ content: "גם אצלי" }) as any, { params: Promise.resolve({ id: "ticket-1" }) }) as any

      expect(res.status).toBe(200)
      expect(prisma.ticketMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ authorEmail: BOB.email, authorRole: "user" }) })
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["staff@cristalino.co.il"] }))
    })

    it("refuses someone who neither owns nor follows the ticket", async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { email: "eve@cristalino.co.il", name: "Eve", isAdmin: false } })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(followed)

      const res = await POST(makeReq({ content: "hi" }) as any, { params: Promise.resolve({ id: "ticket-1" }) }) as any

      expect(res.status).toBe(403)
      expect(prisma.ticketMessage.create).not.toHaveBeenCalled()
    })

    it("answers 404 for a ticket that does not exist", async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null)
      const res = await POST(makeReq({ content: "hi" }) as any, { params: Promise.resolve({ id: "nope" }) }) as any
      expect(res.status).toBe(404)
    })

    it("tells the owner and each participant when staff write", async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(followed)
      ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-p2", content: "טופל" })

      await POST(makeReq({ content: "טופל" }) as any, { params: Promise.resolve({ id: "ticket-1" }) })

      expect((sendMail as jest.Mock).mock.calls.map(c => c[0].to)).toEqual(["alice@cristalino.co.il", BOB.email])
      // Each is greeted by their own name.
      expect((mailNewMessageToUser as jest.Mock).mock.calls.map(c => c[0].submitterName)).toEqual(["Alice", "Bob"])
    })

    it("takes no messages on a merged ticket — the conversation went to the other one", async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...mockTicket, mergedInto: { ticketNumber: 205, type: "ticket" } })

      const res = await POST(makeReq({ content: "hi" }) as any, { params: Promise.resolve({ id: "ticket-1" }) }) as any

      expect(res.status).toBe(409)
      expect((await res.json()).error).toContain("HDTC-205")
      expect(prisma.ticketMessage.create).not.toHaveBeenCalled()
      expect(sendMail).not.toHaveBeenCalled()
    })
  })

  // ── no self-notification ───────────────────────────────────────────────────

  it("does not send reply notification when replying to yourself", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "staff@cristalino.co.il", name: "Staff", isAdmin: true } })
    ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "msg-6", content: "Self" })
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(mockTicket)

    await POST(
      makeReq({
        content: "Self",
        replyToEmail: "staff@cristalino.co.il",
        replyToMsgId: "own-msg",
      }) as any,
      { params: Promise.resolve({ id: "ticket-1" }) }
    )

    expect(mailReplyNotification).not.toHaveBeenCalled()
  })
})
