/**
 * @jest-environment node
 */
/**
 * __tests__/userEmailsRoute.test.ts — POST/DELETE /api/users/emails (v3.101)
 *
 * An address listed here is an identity claim: saying that `x@elsewhere.com`
 * is this employee hands whoever holds that mailbox the right to read and
 * reply to their tickets. So the two things pinned are who may make the claim
 * — admins, nobody else — and that a merge never happens on the first ask.
 */

import type { NextRequest } from "next/server"
import { POST, DELETE } from "@/app/api/users/emails/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { mergeUserInto, mergePreview } from "@/lib/users"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    user:      { findUnique: jest.fn(), findFirst: jest.fn() },
    userEmail: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock("@/lib/users", () => ({
  ...jest.requireActual("@/lib/users"),
  mergePreview:  jest.fn(async () => ({ tickets: 24, following: 0, aliases: 0 })),
  mergeUserInto: jest.fn(async () => ({ tickets: 24, following: 0, aliases: 0 })),
}))
jest.mock("next/server", () => {
  class NextResponse {
    status: number
    body: unknown
    constructor(body: unknown, init?: { status?: number }) { this.body = body; this.status = init?.status ?? 200 }
    static json(d: unknown, init?: { status?: number }) { return new NextResponse(d, init) }
    async json() { return this.body }
  }
  return { NextResponse }
})

type Res = { status: number; json: () => Promise<Record<string, unknown>> }
const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest

const YANIV = { id: "u-cris", email: "yaniv.p@cristalino.co.il", name: "Yaniv Perry" }
const MLY = { id: "u-mly", email: "yanivp@mly.co.il", name: "Yaniv Perry", isAdmin: false }

const asAdmin = () => (auth as jest.Mock).mockResolvedValue({ user: { email: "alon@cristalino.co.il", isAdmin: true } })

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(YANIV)
  ;(prisma.userEmail.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(null)
  // The route calls .catch() on this — a Prisma promise in production, so the
  // mock has to be one too, or the route fails on the mock rather than the code.
  ;(prisma.userEmail.delete as jest.Mock).mockResolvedValue({ id: "alias-1" })
})

describe("who may claim an address", () => {
  it("turns away anyone who is not an admin", async () => {
    for (const session of [null, { user: { email: "dana@cristalino.co.il", isAdmin: false } }]) {
      ;(auth as jest.Mock).mockResolvedValue(session)
      expect(((await POST(req({ userId: "u-cris", email: "x@y.com" }))) as unknown as Res).status).toBe(403)
      expect(((await DELETE(req({ id: "a1" }))) as unknown as Res).status).toBe(403)
    }
    expect(prisma.userEmail.create).not.toHaveBeenCalled()
    expect(prisma.userEmail.delete).not.toHaveBeenCalled()
  })
})

describe("adding a free address", () => {
  it("records it against the user, with who said so", async () => {
    asAdmin()
    const res = (await POST(req({ userId: "u-cris", email: "  YanivP@Other.COM " }))) as unknown as Res
    expect(res.status).toBe(200)
    expect(prisma.userEmail.create).toHaveBeenCalledWith({
      data: { email: "yanivp@other.com", userId: "u-cris", addedBy: "alon@cristalino.co.il" },
    })
  })

  it("refuses something that is not an address", async () => {
    asAdmin()
    for (const email of ["", "nope", "a@b", "two words@x.com"]) {
      expect(((await POST(req({ userId: "u-cris", email }))) as unknown as Res).status).toBe(400)
    }
    expect(prisma.userEmail.create).not.toHaveBeenCalled()
  })

  it("refuses the user's own primary address", async () => {
    asAdmin()
    const res = (await POST(req({ userId: "u-cris", email: "YANIV.P@cristalino.co.il" }))) as unknown as Res
    expect(res.status).toBe(400)
    expect(prisma.userEmail.create).not.toHaveBeenCalled()
  })

  it("refuses an address already claimed by somebody else", async () => {
    asAdmin()
    ;(prisma.userEmail.findFirst as jest.Mock).mockResolvedValue({
      userId: "u-other", user: { id: "u-other", name: "Dana", email: "dana@cristalino.co.il" },
    })
    const res = (await POST(req({ userId: "u-cris", email: "shared@x.com" }))) as unknown as Res
    expect(res.status).toBe(400)
    expect(String((await res.json()).error)).toContain("Dana")
  })
})

describe("when the address is already an account", () => {
  beforeEach(() => { (prisma.user.findFirst as jest.Mock).mockResolvedValue(MLY) })

  // The destructive step never happens on the first ask.
  it("answers 409 with what a merge would move, and merges nothing", async () => {
    asAdmin()
    const res = (await POST(req({ userId: "u-cris", email: "yanivp@mly.co.il" }))) as unknown as Res
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.needsMerge).toBe(true)
    expect(body.plan).toEqual({ tickets: 24, following: 0, aliases: 0 })
    expect(mergeUserInto).not.toHaveBeenCalled()
  })

  it("merges on the second ask", async () => {
    asAdmin()
    const res = (await POST(req({ userId: "u-cris", email: "yanivp@mly.co.il", merge: true }))) as unknown as Res
    expect(res.status).toBe(200)
    expect(mergeUserInto).toHaveBeenCalledWith("u-mly", "u-cris", "alon@cristalino.co.il")
    expect((await res.json()).merged).toEqual({ tickets: 24, following: 0, aliases: 0 })
  })

  // Folding an admin away would take their access with it.
  it("will not merge an admin account, even when asked twice", async () => {
    asAdmin()
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...MLY, isAdmin: true })
    const res = (await POST(req({ userId: "u-cris", email: "yanivp@mly.co.il", merge: true }))) as unknown as Res
    expect(res.status).toBe(400)
    expect(mergeUserInto).not.toHaveBeenCalled()
    expect(mergePreview).not.toHaveBeenCalled()
  })
})

describe("removing an address", () => {
  it("deletes it for an admin", async () => {
    asAdmin()
    const res = (await DELETE(req({ id: "alias-1" }))) as unknown as Res
    expect(res.status).toBe(200)
    expect(prisma.userEmail.delete).toHaveBeenCalledWith({ where: { id: "alias-1" } })
  })

  it("needs an id", async () => {
    asAdmin()
    expect(((await DELETE(req({}))) as unknown as Res).status).toBe(400)
  })
})
