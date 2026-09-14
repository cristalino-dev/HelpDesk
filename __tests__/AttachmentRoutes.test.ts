/**
 * @jest-environment node
 */
/**
 * __tests__/AttachmentRoutes.test.ts — uploading and serving ticket
 * attachments (v3.84).
 *
 * Upload: what lib/attachmentTypes.ts allows is stored; what it does not is
 * refused with a status the page can explain — 413 too large, 415 wrong type.
 * Serving: a raster image inline, everything else as a download, and nothing
 * the browser could execute — the SVG stored-XSS hole this release closes.
 */

import type { NextRequest } from "next/server"
import { POST as upload } from "@/app/api/tickets/[id]/attachments/route"
import { GET as serve } from "@/app/api/attachments/[id]/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { storeAttachment } from "@/lib/storeAttachment"
import { decodeDataUrl, readAttachmentFile, MAX_ATTACHMENT_DATAURL_LENGTH } from "@/lib/attachmentStorage"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: { ticket: { findUnique: jest.fn() }, ticketAttachment: { findUnique: jest.fn() } },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({ STAFF_EMAILS: ["helpdesk@cristalino.co.il"] }))
jest.mock("@/lib/storeAttachment", () => ({
  storeAttachment: jest.fn(async (_id: string, f: { mimeType: string; filename?: string | null }) =>
    ({ id: "a1", mimeType: f.mimeType, filename: f.filename ?? null })),
}))
jest.mock("@/lib/attachmentStorage", () => ({
  ...jest.requireActual("@/lib/attachmentStorage"),
  readAttachmentFile: jest.fn(),
}))
jest.mock("next/server", () => {
  class NextResponse {
    status: number
    headers: Map<string, string>
    body: unknown
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status ?? 200
      this.headers = new Map(Object.entries(init?.headers ?? {}))
    }
    static json(data: unknown, init?: { status?: number }) { return new NextResponse(data, init) }
    async json() { return this.body }
  }
  return { NextResponse }
})

type Res = { status: number; headers: Map<string, string>; json: () => Promise<{ error?: string; id?: string }> }

const OWNER = "dana@cristalino.co.il"
const b64 = (s: string) => Buffer.from(s).toString("base64")
const post = (body: unknown) =>
  upload({ json: async () => body } as unknown as NextRequest, { params: Promise.resolve({ id: "t1" }) }) as unknown as Promise<Res>
const get = () =>
  serve({} as NextRequest, { params: Promise.resolve({ id: "a1" }) }) as unknown as Promise<Res>
const storedAs = () => (storeAttachment as jest.Mock).mock.calls.map(c => ({ ticketId: c[0], mimeType: c[1].mimeType, filename: c[1].filename }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({ user: { email: OWNER, isAdmin: false } })
  ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: "t1", user: { email: OWNER } })
})

describe("POST /api/tickets/[id]/attachments", () => {
  it("stores a PDF under its own name", async () => {
    const res = await post({ dataUrl: `data:application/pdf;base64,${b64("%PDF-1.4")}`, filename: "טופס.pdf" })
    expect(res.status).toBe(200)
    expect(storedAs()).toEqual([{ ticketId: "t1", mimeType: "application/pdf", filename: "טופס.pdf" }])
  })

  it("still stores an image", async () => {
    const res = await post({ dataUrl: `data:image/png;base64,${b64("png")}`, filename: "shot.png" })
    expect(res.status).toBe(200)
    expect(storedAs()[0].mimeType).toBe("image/png")
  })

  it("types a file the browser could not, from its name", async () => {
    await post({ dataUrl: `data:application/octet-stream;base64,${b64("docx")}`, filename: "report.docx" })
    expect(storedAs()[0].mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  })

  it("stores a .csv that Windows labelled as Excel as CSV", async () => {
    await post({ dataUrl: `data:application/vnd.ms-excel;base64,${b64("a,b")}`, filename: "list.csv" })
    expect(storedAs()[0].mimeType).toBe("text/csv")
  })

  it("refuses SVG with 415", async () => {
    const res = await post({ dataUrl: `data:image/svg+xml;base64,${b64("<svg><script>alert(1)</script></svg>")}`, filename: "x.svg" })
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe("סוג הקובץ אינו נתמך")
    expect(storeAttachment).not.toHaveBeenCalled()
  })

  it("refuses HTML dressed up with a .pdf name", async () => {
    const res = await post({ dataUrl: `data:text/html;base64,${b64("<script></script>")}`, filename: "invoice.pdf" })
    expect(res.status).toBe(415)
  })

  it("refuses a body over the limit with 413 and a reason", async () => {
    const res = await post({ dataUrl: `data:application/pdf;base64,${"A".repeat(MAX_ATTACHMENT_DATAURL_LENGTH)}`, filename: "big.pdf" })
    expect(res.status).toBe(413)
    expect((await res.json()).error).toContain("גדול מדי")
  })

  it("refuses something that is not a data URL with 400", async () => {
    expect((await post({ dataUrl: "hello", filename: "a.pdf" })).status).toBe(400)
    expect((await post({ filename: "a.pdf" })).status).toBe(400)
  })

  it("refuses someone else's ticket", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: "t1", user: { email: "other@cristalino.co.il" } })
    const res = await post({ dataUrl: `data:application/pdf;base64,${b64("x")}`, filename: "a.pdf" })
    expect(res.status).toBe(403)
    expect(storeAttachment).not.toHaveBeenCalled()
  })

  it("refuses a caller who is not signed in", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await post({ dataUrl: `data:application/pdf;base64,${b64("x")}` })).status).toBe(401)
  })
})

describe("GET /api/attachments/[id]", () => {
  const row = (over: Record<string, unknown>) => ({
    storedName: "u.bin", mimeType: "application/pdf", dataUrl: null, filename: "טופס.pdf",
    ticket: { user: { email: OWNER } }, ...over,
  })

  beforeEach(() => {
    ;(readAttachmentFile as jest.Mock).mockResolvedValue(Buffer.from("bytes"))
  })

  it("serves a PDF as a download under its real name, with nothing executable", async () => {
    ;(prisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(row({}))
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/pdf")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; /)
    expect(res.headers.get("Content-Disposition")).toContain(`filename*=UTF-8''${encodeURIComponent("טופס.pdf")}`)
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox")
  })

  it("serves a PNG inline, so the ticket can show it", async () => {
    ;(prisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(row({ mimeType: "image/png", filename: "shot.png" }))
    const res = await get()
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline; /)
  })

  it("serves a legacy SVG as an opaque download, never as an image", async () => {
    ;(prisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(row({ mimeType: "image/svg+xml", filename: "x.svg" }))
    const res = await get()
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; /)
  })

  it("still serves a pre-v3.48 row kept inline in the database", async () => {
    ;(prisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(
      row({ storedName: null, mimeType: null, filename: null, dataUrl: `data:image/png;base64,${b64("png")}` }))
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
  })

  it("refuses someone else's attachment", async () => {
    ;(prisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(row({ ticket: { user: { email: "other@cristalino.co.il" } } }))
    expect((await get()).status).toBe(403)
  })
})

describe("decodeDataUrl", () => {
  it("splits a data URL into its declared type and its bytes", () => {
    expect(decodeDataUrl(`data:application/pdf;base64,${b64("abc")}`)).toEqual({ declared: "application/pdf", buffer: Buffer.from("abc") })
  })

  it("reads a missing type as empty, for mimeForFile to settle from the name", () => {
    expect(decodeDataUrl(`data:;base64,${b64("abc")}`)?.declared).toBe("")
  })

  it("allows parameters before ;base64", () => {
    expect(decodeDataUrl(`data:text/plain;charset=utf-8;base64,${b64("a")}`)?.declared).toBe("text/plain")
  })

  it("refuses what is not a non-empty base64 data URL", () => {
    expect(decodeDataUrl("hello")).toBeNull()
    expect(decodeDataUrl("data:text/plain,abc")).toBeNull()
    expect(decodeDataUrl("data:text/plain;base64,")).toBeNull()
  })
})
