import { POST, PATCH, GET } from "@/app/api/tickets/route"

// Mock dependencies
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    ticket: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(),
  mailTicketOpenedStaff: jest.fn(),
  mailTicketOpenedUser: jest.fn(),
  mailTicketUpdatedStaff: jest.fn(),
  mailTicketStatusUser: jest.fn(),
  mailTicketClosedWithReview: jest.fn(),
  mailDailyDigest: jest.fn(),
}))

jest.mock("@/lib/logError", () => ({
  logError: jest.fn(),
}))

jest.mock("@/lib/staffEmails", () => ({
  STAFF_EMAILS: ["staff@cristalino.co.il"],
}))

// Mock NextResponse
jest.mock("next/server", () => ({
  NextResponse: class {
    status: number
    data: any
    constructor(data: any, init?: any) {
      this.data = data
      this.status = init?.status || 200
    }
    static json(data: any, init?: any) {
      return new (this as any)(data, init)
    }
    async json() {
      return this.data
    }
  },
}))

describe("Tickets API", () => {
  const { auth } = require("@/auth")
  const { prisma } = require("@/lib/db")
  const { sendMail } = require("@/lib/mail")

  const mockSession = (user: any) => {
    ;(auth as jest.Mock).mockResolvedValue({ user })
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("POST /api/tickets", () => {
    it("creates a ticket and sends emails", async () => {
      const user = { id: "user-1", email: "user@cristalino.co.il", name: "Test User" }
      mockSession(user)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
      ;(prisma.ticket.create as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        ticketNumber: 1001,
        subject: "Test Issue",
        status: "פתוח",
      })

      const req = {
        json: async () => ({
          subject: "Test Issue",
          description: "Something is broken",
          phone: "123",
          computerName: "PC-1",
          urgency: "בינוני",
          category: "חומרה",
          platform: "Windows",
        }),
      } as any

      const res = await POST(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.id).toBe("ticket-1")
      expect(prisma.ticket.create).toHaveBeenCalled()
      expect(sendMail).toHaveBeenCalledTimes(2)
    })
  })

  describe("PATCH /api/tickets", () => {
    it("updates ticket status as admin", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true, name: "Admin" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        status: "בטיפול",
        subject: "Test Issue",
      })

      const req = {
        json: async () => ({
          id: "ticket-1",
          status: "בטיפול",
        }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("בטיפול")
      expect(prisma.ticket.update).toHaveBeenCalled()
      // Staff notification + user notification for status change
      expect(sendMail).toHaveBeenCalledTimes(2)
    })

    it("allows non-admin staff to close a ticket", async () => {
      mockSession({ email: "staff@cristalino.co.il", isAdmin: false, name: "Staff" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-2",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-2",
        status: "סגור",
        subject: "Test Issue",
      })

      const req = {
        json: async () => ({ id: "ticket-2", status: "סגור" }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("סגור")
      // Staff notification + user notification for closure
      expect(sendMail).toHaveBeenCalledTimes(2)
    })

    it("allows ticket owner (regular user) to close their own ticket", async () => {
      mockSession({ email: "user@cristalino.co.il", isAdmin: false, name: "User" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-3",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-3",
        status: "סגור",
        subject: "Test Issue",
      })

      const req = {
        json: async () => ({ id: "ticket-3", status: "סגור" }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("סגור")
      // Staff notification + review CTA email to the ticket owner (even self-close)
      expect(sendMail).toHaveBeenCalledTimes(2)
    })

    it("rejects regular user closing someone else's ticket", async () => {
      mockSession({ email: "other@cristalino.co.il", isAdmin: false, name: "Other" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-4",
        user: { name: "User", email: "user@cristalino.co.il" },
      })

      const req = {
        json: async () => ({ id: "ticket-4", status: "סגור" }),
      } as any

      const res = await PATCH(req) as any

      expect(res.status).toBe(403)
      expect(prisma.ticket.update).not.toHaveBeenCalled()
    })

    it("rejects regular user changing status to non-close value", async () => {
      mockSession({ email: "user@cristalino.co.il", isAdmin: false, name: "User" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-5",
        user: { name: "User", email: "user@cristalino.co.il" },
      })

      const req = {
        json: async () => ({ id: "ticket-5", status: "בטיפול" }),
      } as any

      const res = await PATCH(req) as any

      expect(res.status).toBe(403)
      expect(prisma.ticket.update).not.toHaveBeenCalled()
    })
  })

  describe("PATCH /api/tickets — assignedTo", () => {
    it("assigns ticket to a staff member without sending user email", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true, name: "Admin" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        status: "פתוח",
        assignedTo: "staff@cristalino.co.il",
        subject: "Test Issue",
      })

      const req = {
        json: async () => ({
          id: "ticket-1",
          assignedTo: "staff@cristalino.co.il",
        }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.assignedTo).toBe("staff@cristalino.co.il")
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { assignedTo: "staff@cristalino.co.il" } })
      )
      // Only staff notification — no user email when there's no status change
      expect(sendMail).toHaveBeenCalledTimes(1)
    })
  })

  describe("GET /api/tickets", () => {
    it("returns all tickets for admin", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true })
      const mockTickets = [{ id: "1" }, { id: "2" }]
      ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue(mockTickets)

      const res = await GET() as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveLength(2)
    })
  })
})
