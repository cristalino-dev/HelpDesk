/**
 * __tests__/TicketDeleteAPI.test.ts
 *
 * Unit tests for DELETE /api/tickets/[id] — the permanent removal of a ticket.
 *
 * This is the one destructive endpoint in the ticket API, so the tests are
 * about what must NOT happen:
 *   - nobody below admin can reach it, including non-admin staff
 *   - a missing ticket is a 404, not a silent success
 *   - attachment bytes on disk go with the row, and a file that has already
 *     vanished does not strand the ticket
 *   - the deletion leaves a trace in the log, because the ticket's own history
 *     cascades away with it
 */

import { DELETE } from "@/app/api/tickets/[id]/route"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("@/lib/attachmentStorage", () => ({ deleteAttachmentFile: jest.fn() }))
jest.mock("next/server", () => ({
  NextResponse: class {
    status: number
    data: unknown
    constructor(data: unknown, init?: { status?: number }) {
      this.data = data
      this.status = init?.status ?? 200
    }
    static json(data: unknown, init?: { status?: number }) {
      return new (this as unknown as { new (d: unknown, i?: { status?: number }): unknown })(data, init)
    }
    async json() { return this.data }
  },
}))

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logInfo } from "@/lib/logError"
import { deleteAttachmentFile } from "@/lib/attachmentStorage"

const mockAuth = auth as jest.Mock
const ticketDb = prisma.ticket as unknown as { findUnique: jest.Mock; delete: jest.Mock }
const removeFile = deleteAttachmentFile as jest.Mock

type Res = { status: number; json: () => Promise<{ ok?: boolean; ticketNumber?: number }> }

const TICKET = {
  id: "ticket-1",
  ticketNumber: 512,
  subject: "בדיקה",
  attachments: [{ storedName: "a.png" }, { storedName: "b.png" }],
}

/** DELETE takes (req, { params }); the request itself is never read. */
const call = (id = "ticket-1") =>
  DELETE({} as never, { params: Promise.resolve({ id }) }) as unknown as Promise<Res>

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue({ user: { email: "admin@cristalino.co.il", name: "Admin", isAdmin: true } })
  ticketDb.findUnique.mockResolvedValue(TICKET)
  ticketDb.delete.mockResolvedValue(TICKET)
  removeFile.mockResolvedValue(undefined)
})

describe("DELETE /api/tickets/[id] — authorization", () => {
  it("lets an admin delete a ticket", async () => {
    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ticketNumber: 512 })
    expect(ticketDb.delete).toHaveBeenCalledWith({ where: { id: "ticket-1" } })
  })

  it("rejects an anonymous caller", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await call()

    expect(res.status).toBe(401)
    expect(ticketDb.delete).not.toHaveBeenCalled()
  })

  it("rejects non-admin staff — closing is theirs, erasing is not", async () => {
    mockAuth.mockResolvedValue({ user: { email: "staff@cristalino.co.il", isAdmin: false } })
    const res = await call()

    expect(res.status).toBe(403)
    expect(ticketDb.delete).not.toHaveBeenCalled()
  })

  it("rejects the ticket's own owner", async () => {
    mockAuth.mockResolvedValue({ user: { email: "user@cristalino.co.il", isAdmin: false } })
    const res = await call()

    expect(res.status).toBe(403)
    expect(ticketDb.delete).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/tickets/[id] — lookup", () => {
  it("404s on a ticket that does not exist", async () => {
    ticketDb.findUnique.mockResolvedValue(null)
    const res = await call("missing")

    expect(res.status).toBe(404)
    expect(ticketDb.delete).not.toHaveBeenCalled()
  })

  it("accepts the human-readable HDTC-N form", async () => {
    await call("HDTC-512")

    expect(ticketDb.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticketNumber: 512 } }),
    )
  })

  it("accepts a raw id", async () => {
    await call("ticket-1")

    expect(ticketDb.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ticket-1" } }),
    )
  })
})

describe("DELETE /api/tickets/[id] — attachments on disk", () => {
  it("removes every stored file before deleting the row", async () => {
    // The DB cascade covers child ROWS; the bytes have lived on disk since v3.48.
    await call()

    expect(removeFile).toHaveBeenCalledTimes(2)
    expect(removeFile).toHaveBeenCalledWith("a.png")
    expect(removeFile).toHaveBeenCalledWith("b.png")
  })

  it("skips legacy rows that hold their bytes inline", async () => {
    ticketDb.findUnique.mockResolvedValue({ ...TICKET, attachments: [{ storedName: null }] })
    const res = await call()

    expect(res.status).toBe(200)
    expect(removeFile).not.toHaveBeenCalled()
  })

  it("still deletes the ticket when a file has already vanished", async () => {
    removeFile.mockRejectedValue(new Error("ENOENT"))
    const res = await call()

    expect(res.status).toBe(200)
    expect(ticketDb.delete).toHaveBeenCalled()
  })
})

describe("DELETE /api/tickets/[id] — audit", () => {
  it("logs who deleted which ticket", async () => {
    await call()

    const [message, source] = (logInfo as jest.Mock).mock.calls[0]
    expect(message).toContain("HDTC-512")
    expect(message).toContain("בדיקה")
    expect(message).toContain("Admin")
    expect(source).toBe("/api/tickets/[id] DELETE")
  })

  it("returns 500 without logging a deletion that did not happen", async () => {
    ticketDb.delete.mockRejectedValue(new Error("db down"))
    const res = await call()

    expect(res.status).toBe(500)
    expect(logInfo).not.toHaveBeenCalled()
  })
})
