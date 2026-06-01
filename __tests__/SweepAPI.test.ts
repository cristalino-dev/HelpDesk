import { POST } from "@/app/api/admin/sweep/route"

// Mock dependencies
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket: {
      updateMany: jest.fn(),
    },
  },
}))

jest.mock("@/lib/logError", () => ({
  logError: jest.fn(),
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

describe("Sweep API", () => {
  const { prisma } = require("@/lib/db")
  const { logError } = require("@/lib/logError")

  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("returns 401 if SWEEP_SECRET and DIGEST_SECRET are not configured", async () => {
    delete process.env.SWEEP_SECRET
    delete process.env.DIGEST_SECRET

    const req = {
      headers: {
        get: (name: string) => (name === "x-sweep-secret" ? "secret-key" : null),
      },
    } as any

    const res = await POST(req) as any
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe("Unauthorized")
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
  })

  it("returns 401 if the provided x-sweep-secret header does not match", async () => {
    process.env.SWEEP_SECRET = "configured-secret"

    const req = {
      headers: {
        get: (name: string) => (name === "x-sweep-secret" ? "wrong-secret" : null),
      },
    } as any

    const res = await POST(req) as any
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe("Unauthorized")
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
  })

  it("returns 200 and performs updateMany if SWEEP_SECRET matches", async () => {
    process.env.SWEEP_SECRET = "configured-secret"
    ;(prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 5 })

    const req = {
      headers: {
        get: (name: string) => (name === "x-sweep-secret" ? "configured-secret" : null),
      },
    } as any

    const res = await POST(req) as any
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.count).toBe(5)

    expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
      where: {
        status: "סגור",
        urgency: { not: "נמוך" },
      },
      data: {
        urgency: "נמוך",
      },
    })
  })

  it("falls back to DIGEST_SECRET if SWEEP_SECRET is not configured", async () => {
    delete process.env.SWEEP_SECRET
    process.env.DIGEST_SECRET = "digest-fallback"
    ;(prisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 })

    const req = {
      headers: {
        get: (name: string) => (name === "x-sweep-secret" ? "digest-fallback" : null),
      },
    } as any

    const res = await POST(req) as any
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.count).toBe(2)
  })

  it("returns 500 and logs error if database update fails", async () => {
    process.env.SWEEP_SECRET = "configured-secret"
    const dbError = new Error("Database error")
    ;(prisma.ticket.updateMany as jest.Mock).mockRejectedValue(dbError)

    const req = {
      headers: {
        get: (name: string) => (name === "x-sweep-secret" ? "configured-secret" : null),
      },
    } as any

    const res = await POST(req) as any
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe("Server error")
    expect(logError).toHaveBeenCalledWith(dbError.message, "/api/admin/sweep POST", dbError.stack)
  })
})
