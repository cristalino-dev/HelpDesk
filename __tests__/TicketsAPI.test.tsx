import { POST, PATCH, GET } from "@/app/api/tickets/route"

// Mock dependencies
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), upsert: jest.fn() },
    ticket: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    ticketHistory: {
      create: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ticketNote: {
      create: jest.fn().mockResolvedValue({}),
    },
    // Equipment request lines (v3.58) — only touched when the payload asks
    // for equipment, but the mock must exist for the paths that do.
    ticketEquipment: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      // The offboarding close guard reads the checklist back (v3.61).
      findMany:   jest.fn().mockResolvedValue([]),
    },
    fieldOption: {
      findMany: jest.fn().mockResolvedValue([{ label: "מסך" }, { label: "מחשב" }]),
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

// Staff notification recipients are DB-driven (isAdmin users) — mock the resolver
jest.mock("@/lib/staffMembers", () => ({
  getStaffEmails: jest.fn().mockResolvedValue(["staff@cristalino.co.il"]),
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
  /** PATCH a close and hand back the response — used by the offboarding tests. */
  const POST_PATCH_CLOSE = async (req: any) => await PATCH(req) as any

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

    // ── EQUIPMENT REQUEST LINES (v3.58) ────────────────────────────────────
    describe("equipment", () => {
      const equipReq = (equipment: any, category = "אחר") => ({
        json: async () => ({
          subject: "צריך מסך",
          description: "אני רוצה מסך בשביל המוניטור",
          phone: "050-1111111",
          computerName: "PC-9",
          urgency: "בינוני",
          category,
          platform: "מחשב אישי",
          equipment,
        }),
      }) as any

      beforeEach(() => {
        const user = { id: "user-1", email: "user@cristalino.co.il", name: "Test User" }
        mockSession(user)
        ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
        ;(prisma.ticket.create as jest.Mock).mockResolvedValue({ id: "ticket-1", ticketNumber: 506, status: "פתוח" })
      })

      it("stores requested equipment on an ORDINARY ticket, not just onboarding", async () => {
        // HDTC-506 in production: category אחר, employee wants a screen.
        const res = await POST(equipReq([{ label: "מסך", quantity: 2 }], "אחר")) as any

        expect(res.status).toBe(200)
        expect(prisma.ticketEquipment.createMany).toHaveBeenCalledWith({
          data: [{ ticketId: "ticket-1", label: "מסך", quantity: 2 }],
          skipDuplicates: true,
        })
      })

      it("stores equipment on a new-employee ticket too", async () => {
        // An onboarding ticket also has to carry the hire details (v3.59),
        // otherwise the request is rejected before it reaches the equipment.
        const res = await POST({
          json: async () => ({
            subject: "עובד חדש", description: "מתחיל ביום ראשון",
            phone: "050-1111111", computerName: "PC-9",
            urgency: "בינוני", category: "עובד חדש", platform: "מחשב אישי",
            equipment: [{ label: "מחשב", quantity: 1 }],
            newEmployee: { firstName: "דני", lastName: "כהן", phone: "050-2222222", jobTitle: "נציג מכירות" },
          }),
        } as any) as any

        expect(res.status).toBe(200)
        expect(prisma.ticketEquipment.createMany).toHaveBeenCalled()
      })

      it("skips the option lookup entirely when no equipment is requested", async () => {
        const res = await POST(equipReq(undefined)) as any

        expect(res.status).toBe(200)
        expect(prisma.fieldOption.findMany).not.toHaveBeenCalled()
        expect(prisma.ticketEquipment.createMany).not.toHaveBeenCalled()
      })

      it("silently drops items that are not on the admin-managed list", async () => {
        const res = await POST(equipReq([{ label: "מסך", quantity: 1 }, { label: "מכונית", quantity: 1 }])) as any

        expect(res.status).toBe(200)
        expect(prisma.ticketEquipment.createMany).toHaveBeenCalledWith({
          data: [{ ticketId: "ticket-1", label: "מסך", quantity: 1 }],
          skipDuplicates: true,
        })
      })

      it("creates no lines when every requested item is invalid", async () => {
        const res = await POST(equipReq([{ label: "מכונית", quantity: 1 }])) as any

        expect(res.status).toBe(200)
        expect(prisma.ticketEquipment.createMany).not.toHaveBeenCalled()
      })

      it("still opens the ticket normally when equipment is malformed", async () => {
        const res = await POST(equipReq("not-an-array")) as any

        expect(res.status).toBe(200)
        expect(prisma.ticket.create).toHaveBeenCalled()
      })
    })

    // ── NEW-EMPLOYEE DETAILS (v3.59) ────────────────────────────────────────
    // An onboarding ticket is an account-creation request: without the hire's
    // name, phone and role there is nothing the technician can act on. The
    // browser marks the fields required; the server is what enforces it.
    describe("new-employee details", () => {
      const hire = { firstName: "דני", lastName: "כהן", phone: "050-1234567", jobTitle: "נציג מכירות" }

      const hireReq = (newEmployee: any, category = "עובד חדש", description = "מתחיל ביום ראשון") => ({
        json: async () => ({
          subject: "פתיחת משתמשים לעובד חדש",
          description,
          phone: "050-1111111",
          computerName: "PC-9",
          urgency: "בינוני",
          category,
          platform: "מחשב אישי",
          newEmployee,
        }),
      }) as any

      beforeEach(() => {
        const user = { id: "user-1", email: "user@cristalino.co.il", name: "Test User" }
        mockSession(user)
        ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
        ;(prisma.ticket.create as jest.Mock).mockResolvedValue({ id: "ticket-1", ticketNumber: 507, status: "פתוח" })
      })

      it("folds the details into the stored description", async () => {
        const res = await POST(hireReq(hire)) as any

        expect(res.status).toBe(200)
        const description = (prisma.ticket.create as jest.Mock).mock.calls[0][0].data.description
        expect(description).toContain("מתחיל ביום ראשון")
        expect(description).toContain("שם פרטי: דני")
        expect(description).toContain("שם משפחה: כהן")
        expect(description).toContain("טלפון: 050-1234567")
        expect(description).toContain("תיאור תפקיד: נציג מכירות")
      })

      it("rejects an onboarding ticket with no details at all", async () => {
        const res = await POST(hireReq(undefined)) as any

        expect(res.status).toBe(400)
        expect(prisma.ticket.create).not.toHaveBeenCalled()
      })

      it("names the missing fields in the error", async () => {
        const res = await POST(hireReq({ firstName: "דני", lastName: "כהן" })) as any

        expect(res.status).toBe(400)
        expect((await res.json()).missing).toEqual(["טלפון", "תיאור תפקיד"])
      })

      it("rejects a field that is only whitespace", async () => {
        const res = await POST(hireReq({ ...hire, jobTitle: "   " })) as any

        expect(res.status).toBe(400)
      })

      it("leaves an ordinary ticket's description alone", async () => {
        const res = await POST(hireReq(undefined, "אחר", "המדפסת לא מדפיסה")) as any

        expect(res.status).toBe(200)
        expect((prisma.ticket.create as jest.Mock).mock.calls[0][0].data.description)
          .toBe("המדפסת לא מדפיסה")
      })

      it("ignores stray details sent on a non-onboarding ticket", async () => {
        const res = await POST(hireReq(hire, "אחר", "המדפסת לא מדפיסה")) as any

        expect(res.status).toBe(200)
        expect((prisma.ticket.create as jest.Mock).mock.calls[0][0].data.description)
          .toBe("המדפסת לא מדפיסה")
      })

      it("sends the folded description to the notification emails", async () => {
        // The details have to reach the technician's inbox, not just the DB.
        await POST(hireReq(hire)) as any

        const { mailTicketOpenedStaff } = require("@/lib/mail")
        expect(mailTicketOpenedStaff.mock.calls[0][0].description).toContain("שם פרטי: דני")
      })

      it("opens an onboarding ticket with no free-text description at all", async () => {
        const res = await POST(hireReq(hire, "עובד חדש", "")) as any

        expect(res.status).toBe(200)
        expect((prisma.ticket.create as jest.Mock).mock.calls[0][0].data.description)
          .toContain("שם פרטי: דני")
      })
    })

    // ── ON-BEHALF-OF (admin opens a ticket in someone else's name) ──────────
    describe("onBehalfOfEmail", () => {
      const admin = { id: "admin-1", email: "admin@cristalino.co.il", name: "Admin", isAdmin: true }

      const behalfReq = (body: any) => ({
        json: async () => ({
          subject: "מסך שחור",
          description: "המסך נכבה",
          phone: "050-1111111",
          computerName: "PC-9",
          urgency: "בינוני",
          category: "חומרה",
          platform: "מחשב אישי",
          ...body,
        }),
      } as any)

      beforeEach(() => {
        mockSession(admin)
        ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(admin)
        ;(prisma.ticket.create as jest.Mock).mockResolvedValue({
          id: "ticket-9", ticketNumber: 1009, subject: "מסך שחור", status: "פתוח",
        })
      })

      it("assigns the ticket to the named user, not the admin who filed it", async () => {
        const owner = { id: "user-7", email: "dana@cristalino.co.il", name: "דנה" }
        ;(prisma.user.upsert as jest.Mock).mockResolvedValue(owner)

        const res = await POST(behalfReq({ onBehalfOfEmail: "dana@cristalino.co.il" })) as any

        expect(res.status).toBe(200)
        expect(prisma.ticket.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ userId: "user-7" }) })
        )
        // The confirmation email goes to the owner, not the admin
        const userMail = (sendMail as jest.Mock).mock.calls.find(c => c[0].subject === "פנייתך התקבלה")
        expect(userMail[0].to).toBe("dana@cristalino.co.il")
      })

      it("creates the user row for an address that has never signed in", async () => {
        ;(prisma.user.upsert as jest.Mock).mockResolvedValue({
          id: "user-new", email: "newhire@cristalino.co.il", name: "עובד חדש",
        })

        await POST(behalfReq({ onBehalfOfEmail: "newhire@cristalino.co.il", onBehalfOfName: "עובד חדש" }))

        expect(prisma.user.upsert).toHaveBeenCalledWith({
          where:  { email: "newhire@cristalino.co.il" },
          create: { email: "newhire@cristalino.co.il", name: "עובד חדש" },
          update: {},
        })
      })

      it("normalises the address so casing and stray spaces still match", async () => {
        ;(prisma.user.upsert as jest.Mock).mockResolvedValue({ id: "u", email: "dana@cristalino.co.il", name: "דנה" })

        await POST(behalfReq({ onBehalfOfEmail: "  Dana@Cristalino.co.il  " }))

        expect(prisma.user.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ where: { email: "dana@cristalino.co.il" } })
        )
      })

      it("records a staff-only note naming both the owner and the admin", async () => {
        ;(prisma.user.upsert as jest.Mock).mockResolvedValue({ id: "user-7", email: "dana@cristalino.co.il", name: "דנה" })

        await POST(behalfReq({ onBehalfOfEmail: "dana@cristalino.co.il" }))

        const note = (prisma.ticketNote.create as jest.Mock).mock.calls[0][0].data
        expect(note.content).toContain("דנה")
        expect(note.content).toContain("Admin")
        expect(note.authorEmail).toBe("admin@cristalino.co.il")
      })

      it("rejects a non-admin trying to file under someone else's name", async () => {
        const plain = { id: "user-1", email: "user@cristalino.co.il", name: "Test User" }
        mockSession(plain)
        ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(plain)

        const res = await POST(behalfReq({ onBehalfOfEmail: "boss@cristalino.co.il" })) as any

        expect(res.status).toBe(403)
        expect(prisma.ticket.create).not.toHaveBeenCalled()
        expect(prisma.user.upsert).not.toHaveBeenCalled()
      })

      it("treats picking yourself as an ordinary self-opened ticket", async () => {
        const res = await POST(behalfReq({ onBehalfOfEmail: "admin@cristalino.co.il" })) as any

        expect(res.status).toBe(200)
        expect(prisma.user.upsert).not.toHaveBeenCalled()
        expect(prisma.ticketNote.create).not.toHaveBeenCalled()
      })
    })
  })

  // ── OFFBOARDING (v3.61) ───────────────────────────────────────────────────
  // A "עובד עוזב" ticket is a procedure, not a request: it is born with the
  // whole gear list and refuses to close until every line is dealt with.
  describe("offboarding", () => {
    const OPTIONS = [{ label: "מחשב נייד" }, { label: "מסך" }, { label: "חשבון Gmail" }]

    beforeEach(() => {
      const user = { id: "user-1", email: "hr@cristalino.co.il", name: "HR" }
      mockSession(user)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(user)
      ;(prisma.ticket.create as jest.Mock).mockResolvedValue({ id: "ticket-9", ticketNumber: 600, status: "פתוח" })
      ;(prisma.fieldOption.findMany as jest.Mock).mockResolvedValue(OPTIONS)
    })

    const leavingReq = (extra: Record<string, unknown> = {}) => ({
      json: async () => ({
        subject: "עזיבת עובד", description: "יום אחרון ביום חמישי",
        phone: "050-1111111", computerName: "PC-9",
        urgency: "בינוני", category: "עובד עוזב", platform: "מחשב אישי",
        ...extra,
      }),
    }) as any

    describe("POST", () => {
      it("creates a line for every item on the gear list", async () => {
        const res = await POST(leavingReq()) as any

        expect(res.status).toBe(200)
        expect(prisma.ticketEquipment.createMany).toHaveBeenCalledWith({
          data: [
            { ticketId: "ticket-9", label: "מחשב נייד",   quantity: 1 },
            { ticketId: "ticket-9", label: "מסך",         quantity: 1 },
            { ticketId: "ticket-9", label: "חשבון Gmail", quantity: 1 },
          ],
          skipDuplicates: true,
        })
      })

      it("builds the list itself and ignores what the form sent", async () => {
        // A checklist that can arrive short is not a checklist.
        await POST(leavingReq({ equipment: [{ label: "מסך", quantity: 1 }] }))

        const data = (prisma.ticketEquipment.createMany as jest.Mock).mock.calls[0][0].data
        expect(data).toHaveLength(3)
      })

      it("does not build a checklist for an ordinary ticket", async () => {
        await POST({
          json: async () => ({ subject: "x", description: "y", category: "אחר" }),
        } as any)

        expect(prisma.ticketEquipment.createMany).not.toHaveBeenCalled()
      })
    })

    describe("PATCH close guard", () => {
      const leavingTicket = {
        id: "ticket-9", ticketNumber: 600, status: "בטיפול", urgency: "בינוני",
        category: "עובד עוזב", subject: "עזיבת עובד", updatedAt: new Date(),
        user: { name: "HR", email: "hr@cristalino.co.il" },
      }

      beforeEach(() => {
        mockSession({ email: "admin@cristalino.co.il", name: "Admin", isAdmin: true })
        ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(leavingTicket)
        ;(prisma.ticket.update as jest.Mock).mockResolvedValue({ ...leavingTicket, status: "סגור" })
      })

      const closeReq = () => ({ json: async () => ({ id: "ticket-9", status: "סגור" }) }) as any

      it("refuses to close while an item is unticked", async () => {
        ;(prisma.ticketEquipment.findMany as jest.Mock).mockResolvedValue([
          { label: "מחשב נייד", quantity: 1, receivedQty: 1 },
          { label: "חשבון Gmail", quantity: 1, receivedQty: 0 },
        ])

        const res = await POST_PATCH_CLOSE(closeReq())

        expect(res.status).toBe(400)
        expect((await res.json()).blockers).toEqual(["חשבון Gmail"])
        expect(prisma.ticket.update).not.toHaveBeenCalled()
      })

      it("blocks an admin exactly like anyone else", async () => {
        ;(prisma.ticketEquipment.findMany as jest.Mock).mockResolvedValue([
          { label: "מסך", quantity: 2, receivedQty: 1 },
        ])

        const res = await POST_PATCH_CLOSE(closeReq())

        expect(res.status).toBe(400)
      })

      it("closes once every line is ticked", async () => {
        ;(prisma.ticketEquipment.findMany as jest.Mock).mockResolvedValue([
          { label: "מחשב נייד", quantity: 1, receivedQty: 1 },
          { label: "מסך", quantity: 2, receivedQty: 2 },
        ])

        const res = await POST_PATCH_CLOSE(closeReq())

        expect(res.status).toBe(200)
        expect(prisma.ticket.update).toHaveBeenCalled()
      })

      it("closes a ticket whose checklist was emptied", async () => {
        ;(prisma.ticketEquipment.findMany as jest.Mock).mockResolvedValue([])

        const res = await POST_PATCH_CLOSE(closeReq())

        expect(res.status).toBe(200)
      })

      it("does not block a status change that is not a closure", async () => {
        ;(prisma.ticketEquipment.findMany as jest.Mock).mockResolvedValue([
          { label: "מסך", quantity: 1, receivedQty: 0 },
        ])

        const res = await PATCH({ json: async () => ({ id: "ticket-9", status: "בהמתנה", holdReason: "ממתין לציוד" }) } as any) as any

        expect(res.status).toBe(200)
      })

      it("never reads the checklist for an ordinary ticket", async () => {
        ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...leavingTicket, category: "אחר" })

        const res = await POST_PATCH_CLOSE(closeReq())

        expect(res.status).toBe(200)
        expect(prisma.ticketEquipment.findMany).not.toHaveBeenCalled()
      })
    })
  })

  describe("PATCH /api/tickets", () => {
    it("updates ticket status as admin", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true, name: "Admin" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        status: "פתוח",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-1",
        status: "בטיפול",
        subject: "Test Issue",
        assignedTo: "tech@cristalino.co.il",
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
      // Status change → assignee notification + user notification (not all staff)
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
      // Actor IS in STAFF_EMAILS so they are excluded from the staff notification.
      // Only the closure email to the ticket owner is sent.
      expect(sendMail).toHaveBeenCalledTimes(1)
    })

    it("allows ticket owner (regular user) to close their own ticket", async () => {
      mockSession({ email: "user@cristalino.co.il", isAdmin: false, name: "User" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-3",
        status: "פתוח",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-3",
        status: "סגור",
        subject: "Test Issue",
        assignedTo: "tech@cristalino.co.il",
      })

      const req = {
        json: async () => ({ id: "ticket-3", status: "סגור" }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("סגור")
      // Status change → assignee notification + review CTA email to the ticket owner (even self-close)
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

    it("allows ticket owner to reopen within 4 weeks", async () => {
      mockSession({ email: "user@cristalino.co.il", isAdmin: false, name: "User" })
      // Closed 1 day ago — within the 4-week window
      const closedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-6",
        status: "סגור",
        updatedAt: closedAt,
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-6",
        status: "פתוח",
        subject: "Test Issue",
      })

      const req = {
        json: async () => ({ id: "ticket-6", status: "פתוח" }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("פתוח")
      expect(prisma.ticket.update).toHaveBeenCalled()
    })

    it("auto-sets urgency to lowest priority when closing a ticket", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true, name: "Admin" })
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-10",
        urgency: "דחוף",
        status: "בטיפול",
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-10",
        status: "סגור",
        urgency: "נמוך",
        subject: "Test Issue",
      })

      const req = {
        json: async () => ({ id: "ticket-10", status: "סגור" }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.urgency).toBe("נמוך")
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "סגור", urgency: "נמוך" }),
        })
      )
    })

    it("rejects reopen attempt after 4-week window has expired", async () => {
      mockSession({ email: "user@cristalino.co.il", isAdmin: false, name: "User" })
      // Closed 30 days ago — outside the 4-week window
      const closedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-7",
        status: "סגור",
        updatedAt: closedAt,
        user: { name: "User", email: "user@cristalino.co.il" },
      })

      const req = {
        json: async () => ({ id: "ticket-7", status: "פתוח" }),
      } as any

      const res = await PATCH(req) as any

      expect(res.status).toBe(403)
      expect(prisma.ticket.update).not.toHaveBeenCalled()
    })

    it("allows admin to reopen a ticket with no time limit", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true, name: "Admin" })
      // Closed 60 days ago — well past the user's 4-week window
      const closedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
        id: "ticket-8",
        status: "סגור",
        updatedAt: closedAt,
        user: { name: "User", email: "user@cristalino.co.il" },
      })
      ;(prisma.ticket.update as jest.Mock).mockResolvedValue({
        id: "ticket-8",
        status: "פתוח",
        subject: "Old Issue",
      })

      const req = {
        json: async () => ({ id: "ticket-8", status: "פתוח" }),
      } as any

      const res = await PATCH(req) as any
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.status).toBe("פתוח")
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
