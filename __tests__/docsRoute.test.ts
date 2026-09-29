/**
 * @jest-environment node
 */
/**
 * __tests__/docsRoute.test.ts — GET /api/admin/docs and /api/admin/docs/[name] (v3.99).
 *
 * The shelf holds the team's internal write-ups, one of them a security
 * runbook. What is pinned here is who gets them: admins, and nobody else — a
 * link pasted into a chat leads to a sign-in page, not to the network topology.
 */

import type { NextRequest } from "next/server"
import { GET as list } from "@/app/api/admin/docs/route"
import { GET as serve } from "@/app/api/admin/docs/[name]/route"
import { auth } from "@/auth"
import { listDocs, readDoc } from "@/lib/docStorage"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/docStorage", () => ({ listDocs: jest.fn(), readDoc: jest.fn() }))
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

type Res = { status: number; headers: Map<string, string>; json: () => Promise<{ docs?: unknown[]; error?: string }> }

const DOC = {
  name: "09_SECURITY_OPERATIONS_AND_INCIDENT_RUNBOOK.docx",
  title: "SECURITY OPERATIONS AND INCIDENT RUNBOOK",
  index: "09", group: "infra" as const, ext: ".docx", size: 36920, updatedAt: "2026-09-29T09:00:00.000Z",
}

const signedOut = () => (auth as jest.Mock).mockResolvedValue(null)
const asUser    = () => (auth as jest.Mock).mockResolvedValue({ user: { email: "dana@cristalino.co.il", isAdmin: false } })
const asAdmin   = () => (auth as jest.Mock).mockResolvedValue({ user: { email: "alon@cristalino.co.il", isAdmin: true } })

const getOne = (name: string) =>
  serve({} as NextRequest, { params: Promise.resolve({ name }) }) as unknown as Promise<Res>

beforeEach(() => {
  jest.clearAllMocks()
  ;(listDocs as jest.Mock).mockResolvedValue([DOC])
  ;(readDoc as jest.Mock).mockResolvedValue(Buffer.from("PK\u0003\u0004docx"))
})

describe("who may read the shelf", () => {
  it("turns a signed-out request away from both routes", async () => {
    signedOut()
    expect(((await list()) as unknown as Res).status).toBe(401)
    expect((await getOne(DOC.name)).status).toBe(401)
    expect(readDoc).not.toHaveBeenCalled()
  })

  // Staff run the queue; these documents are the admins'.
  it("refuses an ordinary signed-in user", async () => {
    asUser()
    expect(((await list()) as unknown as Res).status).toBe(403)
    expect((await getOne(DOC.name)).status).toBe(403)
    expect(readDoc).not.toHaveBeenCalled()
  })
})

describe("the listing", () => {
  it("hands an admin the shelf", async () => {
    asAdmin()
    const res = (await list()) as unknown as Res
    expect(res.status).toBe(200)
    expect((await res.json()).docs).toEqual([DOC])
  })

  it("is an empty shelf, not an error, when there are no documents", async () => {
    asAdmin()
    ;(listDocs as jest.Mock).mockResolvedValue([])
    expect((await ((await list()) as unknown as Res).json()).docs).toEqual([])
  })
})

describe("one document", () => {
  it("serves the bytes with the headers its type asks for", async () => {
    asAdmin()
    const res = await getOne(DOC.name)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/)
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("opens a guide in the tab instead, under a CSP", async () => {
    asAdmin()
    ;(readDoc as jest.Mock).mockResolvedValue(Buffer.from("<p>שלום</p>"))
    const name = encodeURIComponent("מדריך הקמת נציגים - Zoho Desk.html")
    const res = await getOne(name)
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/)
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'")
  })

  it("answers 404 for a name the shelf does not hold — traversal included", async () => {
    asAdmin()
    ;(readDoc as jest.Mock).mockResolvedValue(null)
    expect((await getOne("../../.env")).status).toBe(404)
    expect((await getOne("nothing.docx")).status).toBe(404)
  })
})
