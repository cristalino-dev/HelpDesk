import type { NextRequest } from "next/server"
import { GET, DELETE } from "@/app/api/admin/logs/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

// Mock NextAuth
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

// Mock Prisma
jest.mock("@/lib/db", () => ({
  prisma: {
    log: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

// Mock Staff Emails
jest.mock("@/lib/staffEmails", () => ({
  STAFF_EMAILS: ["staff@cristalino.co.il"],
}))

// Mock Next.js Server Response
jest.mock("next/server", () => ({
  NextResponse: class {
    status: number
    data: unknown
    constructor(data: unknown, init?: { status?: number }) {
      this.data = data
      this.status = init?.status || 200
    }
    static json(data: unknown, init?: { status?: number }) {
      return new this(data, init)
    }
    async json() {
      return this.data
    }
  },
}))

/** What the mocked NextResponse above hands back. */
type Res = { status: number; json: () => Promise<unknown> }

describe("Admin Logs API", () => {
  const mockSession = (user: Record<string, unknown>) => {
    ;(auth as jest.Mock).mockResolvedValue({ user })
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("GET /api/admin/logs", () => {
    it("returns 401 if user is not staff or admin", async () => {
      mockSession({ email: "user@example.com", isAdmin: false })
      const req = { url: "http://localhost/api/admin/logs" } as unknown as NextRequest
      const res = await GET(req) as unknown as Res
      expect(res.status).toBe(401)
    })

    it("returns logs for staff user", async () => {
      mockSession({ email: "staff@cristalino.co.il", isAdmin: false })
      const mockLogs = [{ id: "1", message: "Test log", level: "error", timestamp: new Date(), date: "2026-04-14" }]
      ;(prisma.log.findMany as jest.Mock).mockResolvedValue(mockLogs)

      const req = { url: "http://localhost/api/admin/logs" } as unknown as NextRequest
      const res = await GET(req) as unknown as Res
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual(mockLogs)
    })
  })

  describe("DELETE /api/admin/logs", () => {
    it("returns 403 if user is staff but not admin", async () => {
      mockSession({ email: "staff@cristalino.co.il", isAdmin: false })
      const res = await DELETE() as unknown as Res
      expect(res.status).toBe(403)
    })

    it("clears logs if user is admin", async () => {
      mockSession({ email: "admin@cristalino.co.il", isAdmin: true })
      ;(prisma.log.deleteMany as jest.Mock).mockResolvedValue({ count: 5 })

      const res = await DELETE() as unknown as Res
      expect(res.status).toBe(200)
      expect(prisma.log.deleteMany).toHaveBeenCalled()
    })
  })
})
