/**
 * __tests__/ReportsExportAPI.test.ts — GET /api/admin/reports/export
 *
 * The endpoint is a download, so the things that break it are not the ones a
 * JSON API usually gets wrong: the browser needs a Content-Disposition or it
 * renders the bytes as text, and the file needs to arrive whole.
 *
 * The substantive assertion is that its `closedAt` is resolved exactly as the
 * reports route resolves it. If the two ever disagree, the spreadsheet and the
 * chart above the button tell different stories about the same day, and the
 * spreadsheet is the one people forward.
 */

import { GET } from "@/app/api/admin/reports/export/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: { ticket: { findMany: jest.fn() }, ticketHistory: { findMany: jest.fn() } },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))

// The real NextResponse needs more of the edge runtime than jsdom provides.
// This mirrors the mock the other API suites use, extended to carry a binary
// body — the whole point of this endpoint.
jest.mock("next/server", () => ({
  NextResponse: class {
    status: number
    headers: { get(k: string): string | null }
    body: unknown
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status ?? 200
      // A plain record with a lookup, not a Map with its `get` replaced — that
      // shadows Map.prototype.get and recurses forever.
      const raw = init?.headers ?? {}
      const lower: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v
      this.headers = { get: (k: string) => lower[k.toLowerCase()] ?? null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static json(data: unknown, init?: { status?: number }) { return new (this as any)(data, init) }
    async arrayBuffer() {
      const b = this.body as Uint8Array
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
    }
    async json() { return this.body }
  },
}))

const req = (qs = "") =>
  ({ url: `https://helpdesk.cristalino.co.il/api/admin/reports/export${qs}` }) as never

const ticket = (over: Record<string, unknown> = {}) => ({
  id: "t1", ticketNumber: 565, subject: "כונן G לא זמין", description: "לא נטען",
  status: "פתוח", urgency: "בינוני", category: "אחר", platform: "מחשב אישי",
  phone: "0528287036", computerName: "", assignedTo: "helpdesk@cristalino.co.il",
  createdAt: new Date("2026-09-01T09:00:00Z"),
  user: { name: "משה בר עוז", email: "moshe.ba@cristalino.co.il" },
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { email: "alon@cristalino.co.il", isAdmin: true } })
  ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket()])
  ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([])
})

describe("access", () => {
  it("rejects a signed-out caller", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })

  it("rejects a signed-in non-admin", async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { email: "x@y.z", isAdmin: false } })
    expect((await GET(req())).status).toBe(403)
  })

  it("does not touch the database when it refuses", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    await GET(req())
    expect(prisma.ticket.findMany).not.toHaveBeenCalled()
  })
})

describe("the response is a download", () => {
  it("sends the spreadsheet MIME type", async () => {
    const res = await GET(req("?scope=all"))
    expect(res.headers.get("Content-Type"))
      .toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  it("attaches it with a filename, so the browser saves rather than renders it", async () => {
    const res = await GET(req("?scope=all"))
    const cd = res.headers.get("Content-Disposition") ?? ""
    expect(cd).toContain("attachment")
    expect(cd).toContain("helpdesk-tickets-all-")
    expect(cd).toContain(".xlsx")
  })

  it("names the file after the single ticket when that is the scope", async () => {
    const res = await GET(req("?scope=ticket&ticket=565"))
    expect(res.headers.get("Content-Disposition")).toContain("helpdesk-HDTC-565.xlsx")
  })

  it("names it after the range when that is the scope", async () => {
    const res = await GET(req("?scope=range&from=2026-09-01&to=2026-09-30"))
    expect(res.headers.get("Content-Disposition")).toContain("2026-09-01_2026-09-30")
  })

  it("returns an actual zip, with a length that matches", async () => {
    const res = await GET(req("?scope=all"))
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])           // "PK"
    expect(res.headers.get("Content-Length")).toBe(String(bytes.length))
  })

  it("is never cached — the data changes under it", async () => {
    const res = await GET(req("?scope=all"))
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })
})

describe("scope reaches the query", () => {
  it("asks the database for one ticket rather than filtering the whole table", async () => {
    await GET(req("?scope=ticket&ticket=565"))
    expect((prisma.ticket.findMany as jest.Mock).mock.calls[0][0].where)
      .toEqual({ ticketNumber: 565 })
  })

  it("asks for everything otherwise", async () => {
    await GET(req("?scope=all"))
    expect((prisma.ticket.findMany as jest.Mock).mock.calls[0][0].where).toEqual({})
  })

  it("rejects a malformed ticket number with a message, not a silent full export", async () => {
    const res = await GET(req("?scope=ticket&ticket=abc"))
    expect(res.status).toBe(400)
    expect(prisma.ticket.findMany).not.toHaveBeenCalled()
  })
})

describe("closedAt agrees with the reports route", () => {
  it("takes the LATEST closure for a closed ticket", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket({ status: "סגור" })])
    ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([
      { ticketId: "t1", changedAt: new Date("2026-09-02T10:00:00Z") },
      { ticketId: "t1", changedAt: new Date("2026-09-09T10:00:00Z") },
    ])
    const res = await GET(req("?scope=all"))
    const text = Buffer.from(await res.arrayBuffer()).toString("latin1")
    expect(text).toContain("2026-09-09")
    expect(text).not.toContain("2026-09-02 13:00")
  })

  it("gives a reopened ticket no close date, though it has closure history", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([ticket({ status: "בטיפול" })])
    ;(prisma.ticketHistory.findMany as jest.Mock).mockResolvedValue([
      { ticketId: "t1", changedAt: new Date("2026-09-02T10:00:00Z") },
    ])
    const res = await GET(req("?scope=all"))
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).not.toContain("2026-09-02 13:00")
  })

  it("only asks for closure rows, not the whole history table", async () => {
    await GET(req("?scope=all"))
    expect((prisma.ticketHistory.findMany as jest.Mock).mock.calls[0][0].where)
      .toEqual({ field: "status", newValue: "סגור" })
  })
})

describe("failure", () => {
  it("returns 500 rather than a truncated file when the query fails", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockRejectedValue(new Error("db down"))
    expect((await GET(req("?scope=all"))).status).toBe(500)
  })
})
