/**
 * @jest-environment node
 */
/**
 * __tests__/ProvisioningLogRoute.test.ts — POST /api/provisioning/log (v3.100)
 *
 * This endpoint takes no credential — it is called by scripts running on a PC
 * that is being built, which has nothing of ours on it yet. What stands in for
 * a key are the limits, so the limits are what this file holds: a cap on the
 * body, a per-IP window, and a GLOBAL window, because the thing being
 * protected is the dev inbox and a per-IP limit says nothing about a thousand
 * addresses sending one request each.
 */

import type { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"

jest.mock("@/lib/db", () => ({ prisma: { log: { create: jest.fn(async () => ({ id: "log-1" })) } } }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => {}),
  mailProvisioningLog: jest.fn(() => "<html>mail</html>"),
}))
jest.mock("next/server", () => {
  class NextResponse {
    status: number
    body: unknown
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body
      this.status = init?.status ?? 200
    }
    static json(data: unknown, init?: { status?: number }) { return new NextResponse(data, init) }
    async json() { return this.body }
  }
  return { NextResponse, after: jest.fn((cb: () => Promise<void>) => cb()) }
})

type Res = { status: number; json: () => Promise<{ ok?: boolean; error?: string; logFilename?: string }> }

/** Each test gets the module fresh: the rate-limit windows live in its memory. */
async function load() {
  let mod!: typeof import("@/app/api/provisioning/log/route")
  await jest.isolateModulesAsync(async () => { mod = await import("@/app/api/provisioning/log/route") })
  return mod
}

/** A request the route can read: text() for the body, headers for the IP. */
const post = (body: unknown, ip = "10.0.0.5") => ({
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  headers: { get: (k: string) => (k === "x-forwarded-for" ? ip : null) },
}) as unknown as NextRequest

const RUN = {
  computerName: "TEST-LAPTOP-01",
  scriptName: "setup-without-lenovo.ps1",
  status: "Success",
  duration: "00:03:45",
  errorCount: 0,
  logContent: "Transcript started...\nStep 1 OK\nStep 2 OK\nTranscript ended.",
}

beforeEach(() => jest.clearAllMocks())

describe("a run that finished", () => {
  it("records it and mails the transcript to dev@", async () => {
    const { POST } = await load()
    const res = (await POST(post(RUN))) as unknown as Res
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    expect(prisma.log.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ level: "info", source: "Provisioning: setup-without-lenovo.ps1" }),
    }))
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "dev@cristalino.co.il",
      subject: "[IT Provisioning] setup-without-lenovo.ps1 on TEST-LAPTOP-01 (Success)",
      attachments: [expect.objectContaining({
        filename: expect.stringContaining("setup-without-lenovo.ps1_TEST-LAPTOP-01"),
        content: RUN.logContent,
      })],
    }))
  })

  it("logs at error level when the script failed", async () => {
    const { POST } = await load()
    await POST(post({ ...RUN, status: "Failed", errorCount: 2 }))
    expect(prisma.log.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ level: "error" }),
    }))
  })

  // "Success" with errors counted is still a run somebody has to look at.
  it("treats a non-zero error count as a failure whatever the status says", async () => {
    const { POST } = await load()
    await POST(post({ ...RUN, status: "Success", errorCount: 3 }))
    expect(prisma.log.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ level: "error" }),
    }))
  })

  // A computer name reaches us from the workstation and goes into a filename.
  it("builds the attachment name from a filename, never a path", async () => {
    const { POST } = await load()
    const res = (await POST(post({ ...RUN, computerName: "../../etc/passwd", scriptName: "a/b.ps1" }))) as unknown as Res
    const { logFilename } = await res.json()
    expect(logFilename).not.toMatch(/[/\\]/)
    expect(logFilename).toBe("ab.ps1_etcpasswd_" + new Date().toISOString().slice(0, 10) + ".log")
    expect(logFilename).not.toMatch(/\.\./)
  })
})

describe("what it refuses", () => {
  it("answers 400 to a body that is neither a name nor a transcript", async () => {
    const { POST } = await load()
    const res = (await POST(post({}))) as unknown as Res
    expect(res.status).toBe(400)
    expect(sendMail).not.toHaveBeenCalled()
    expect(prisma.log.create).not.toHaveBeenCalled()
  })

  it("answers 400 to malformed JSON rather than failing with a 500", async () => {
    const { POST } = await load()
    const res = (await POST(post("{not json"))) as unknown as Res
    expect(res.status).toBe(400)
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Without this, one request mails an attachment of any size it likes.
  it("answers 413 to a body over the cap, before doing any work", async () => {
    const { POST, MAX_BODY_BYTES } = await load()
    const huge = { ...RUN, logContent: "x".repeat(MAX_BODY_BYTES + 1) }
    const res = (await POST(post(huge))) as unknown as Res
    expect(res.status).toBe(413)
    expect(sendMail).not.toHaveBeenCalled()
    expect(prisma.log.create).not.toHaveBeenCalled()
  })

  it("stops one machine looping, and says 429 rather than mailing again", async () => {
    const { POST } = await load()
    const codes: number[] = []
    for (let i = 0; i < 12; i++) codes.push(((await POST(post(RUN, "10.0.0.9"))) as unknown as Res).status)
    expect(codes.filter(c => c === 200)).toHaveLength(10)
    expect(codes.filter(c => c === 429)).toHaveLength(2)
    expect(sendMail).toHaveBeenCalledTimes(10)
  })

  // The per-IP window is no defence at all against a request each from many
  // addresses, and the inbox is what we are protecting.
  it("stops many machines doing it too", async () => {
    const { POST } = await load()
    let sent = 0
    for (let i = 0; i < 100; i++) {
      const res = (await POST(post(RUN, `10.0.1.${i}`))) as unknown as Res
      if (res.status === 200) sent++
    }
    expect(sent).toBe(60)
    expect(sendMail).toHaveBeenCalledTimes(60)
  })
})
