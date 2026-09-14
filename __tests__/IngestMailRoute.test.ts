/**
 * __tests__/IngestMailRoute.test.ts — POST /api/admin/ingest-mail, driven end
 * to end against a fake mailbox.
 *
 * lib/mailIngest.ts decides; this drives the route that acts on those
 * decisions, because the ways "every mail opens a ticket" can go wrong are
 * all in the I/O: which messages are searched for at all (a 929-message
 * backlog), whether the app's own confirmation comes back round as a new
 * ticket (the loop), who gets answered, and how many tickets one run opens.
 *
 * Until v3.82 this route had no test of its own.
 */

import type { NextRequest } from "next/server"
import { POST } from "@/app/api/admin/ingest-mail/route"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { resolveUserByEmail } from "@/lib/users"
import { INGEST_START, MAX_PER_RUN, AUTO_RESPOND_MAX_PER_SENDER } from "@/lib/mailIngest"

// ── The fake mailbox ─────────────────────────────────────────────────────────

type Msg = {
  uid: number
  from: string
  name?: string
  subject?: string
  replyTo?: string
  headers?: Record<string, string>
  receivedAt?: string
  messageId?: string
}

const mockImap = {
  connect: jest.fn(),
  logout: jest.fn(),
  getMailboxLock: jest.fn(async () => ({ release: jest.fn() })),
  search: jest.fn(),
  fetchOne: jest.fn(),
  messageFlagsAdd: jest.fn(),
}
const mockParsed = new Map<string, unknown>()
const mockAfter: (() => unknown)[] = []

jest.mock("imapflow", () => ({ ImapFlow: jest.fn(() => mockImap) }))
jest.mock("mailparser", () => ({
  simpleParser: jest.fn(async (src: Buffer) => mockParsed.get(src.toString())),
}))
jest.mock("@/lib/db", () => ({
  prisma: {
    ticket: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
    ticketHistory: { create: jest.fn() },
  },
}))
jest.mock("@/lib/users", () => ({
  resolveUserByEmail: jest.fn(async (email: string) => ({ id: `u:${email}` })),
}))
jest.mock("@/lib/staffMembers", () => ({
  getStaffEmails: jest.fn(async () => ["alon@cristalino.co.il"]),
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => {}),
  mailTicketOpenedStaff: jest.fn(() => "<staff>"),
  mailTicketOpenedUser: jest.fn(() => "<user>"),
  MAIL_FROM_ADDRESS: "noreply_helpdesk@cristalino.co.il",
}))
jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }),
  },
  after: (cb: () => unknown) => { mockAfter.push(cb) },
}))

/** Put these messages in the inbox, as UNSEEN and matching the search. */
function inbox(...msgs: Msg[]) {
  mockParsed.clear()
  mockImap.search.mockResolvedValue(msgs.map(m => m.uid))
  mockImap.fetchOne.mockImplementation(async (uid: string) => {
    const m = msgs.find(x => String(x.uid) === uid)!
    return { source: Buffer.from(`msg-${m.uid}`), internalDate: new Date(m.receivedAt ?? "2026-09-15T10:00:00+03:00") }
  })
  for (const m of msgs) {
    mockParsed.set(`msg-${m.uid}`, {
      from: { value: [{ address: m.from, name: m.name ?? "" }] },
      replyTo: m.replyTo ? { value: [{ address: m.replyTo, name: "דנה לוי" }] } : undefined,
      subject: m.subject ?? "נושא",
      text: "גוף ההודעה",
      messageId: m.messageId ?? `<${m.uid}@mail>`,
      headerLines: Object.entries(m.headers ?? {}).map(([k, v]) => ({ key: k.toLowerCase(), line: `${k}: ${v}` })),
    })
  }
}

type Body = { ok?: boolean; created?: number; tickets?: number[]; skipped?: Record<string, number>; error?: string }
const req = (secret = "s") =>
  ({ headers: { get: (k: string) => (k === "x-ingest-secret" ? secret : null) } }) as unknown as NextRequest
async function run(secret?: string): Promise<{ status: number; body: Body }> {
  const res = (await POST(req(secret))) as unknown as { status: number; json: () => Promise<Body> }
  return { status: res.status, body: await res.json() }
}

const created  = () => (prisma.ticket.create as jest.Mock).mock.calls.map(c => c[0].data)
const mailedTo = () => (sendMail as jest.Mock).mock.calls.map(c => c[0].to)
const seen     = () => mockImap.messageFlagsAdd.mock.calls.map(c => Number(c[0]))

const EMPLOYEE = "dana@cristalino.co.il"
const STAFF = ["alon@cristalino.co.il"]
const env = process.env

beforeEach(() => {
  jest.clearAllMocks()
  mockAfter.length = 0
  process.env = { ...env, INGEST_SECRET: "s", SMTP_USER: "helpdesk@cristalino.co.il", SMTP_PASS: "p" }
  delete process.env.INGEST_SINCE
  delete process.env.TICKET_MAIL_KEYWORD
  let n = 900
  ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(null)
  ;(prisma.ticket.create as jest.Mock).mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    ({ id: `t${++n}`, ticketNumber: n, status: "פתוח", ...data }))
  ;(prisma.ticket.count as jest.Mock).mockResolvedValue(0)
})
afterAll(() => { process.env = env })

describe("access", () => {
  it("refuses a bad secret without touching the mailbox", async () => {
    expect((await run("nope")).status).toBe(401)
    expect(mockImap.connect).not.toHaveBeenCalled()
  })

  it("answers 503 when the mailbox is not configured", async () => {
    delete process.env.SMTP_PASS
    expect((await run()).status).toBe(503)
  })
})

describe("which mail is even looked at", () => {
  it("searches unread mail since the cutoff — no longer by subject keyword", async () => {
    inbox()
    await run()
    expect(mockImap.search).toHaveBeenCalledWith({ seen: false, since: new Date(INGEST_START) }, { uid: true })
  })

  it("honours INGEST_SINCE", async () => {
    process.env.INGEST_SINCE = "2026-10-01T00:00:00Z"
    inbox()
    await run()
    expect(mockImap.search.mock.calls[0][0].since.toISOString()).toBe("2026-10-01T00:00:00.000Z")
  })
})

describe("every mail opens a ticket", () => {
  it("opens one for an ordinary email with no keyword, at the default urgency", async () => {
    inbox({ uid: 1, from: EMPLOYEE, name: "דנה לוי", subject: "המסך מהבהב" })
    const { body } = await run()
    expect(body.created).toBe(1)
    expect(created()[0]).toMatchObject({
      subject: "המסך מהבהב", urgency: "בינוני", userId: `u:${EMPLOYEE}`, sourceMessageId: "<1@mail>",
    })
    expect(seen()).toEqual([1])
  })

  it("keeps the keyword meaning urgent, and strips it from the subject", async () => {
    inbox({ uid: 1, from: EMPLOYEE, subject: "Ticket: VPN לא מתחבר" })
    await run()
    expect(created()[0]).toMatchObject({ subject: "VPN לא מתחבר", urgency: "דחוף" })
  })

  it("tells staff, and answers the sender", async () => {
    inbox({ uid: 1, from: EMPLOYEE })
    await run()
    expect(mailedTo()).toEqual([STAFF, EMPLOYEE])
  })

  // Rule 41: the response does not claim the mail was delivered, so it is
  // awaited in after() rather than abandoned with a bare `void`.
  it("hands its mail to after(), so it is not abandoned when the response returns", async () => {
    inbox({ uid: 1, from: EMPLOYEE })
    await run()
    expect(mockAfter).toHaveLength(1)
    await expect(Promise.all(mockAfter.map(cb => cb()))).resolves.toBeDefined()
  })
})

describe("the loop — the app's own mail must never open a ticket", () => {
  it("does not ingest its own confirmation when that comes back round", async () => {
    // Run 1: an employee writes in, and is answered.
    inbox({ uid: 1, from: EMPLOYEE })
    await run()
    expect(mailedTo()).toContain(EMPLOYEE)

    // Run 2: that answer — or any status mail sent to helpdesk@, the default
    // assignee — has landed in the helpdesk inbox.
    jest.clearAllMocks()
    inbox({ uid: 2, from: "noreply_helpdesk@cristalino.co.il", headers: { "Auto-Submitted": "auto-generated" } })
    const { body } = await run()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ "own-address": 1 })
    expect(seen()).toEqual([2])
  })

  // Until noreply_helpdesk@ is a verified send-as, Gmail rewrites From back to
  // helpdesk@. That must be recognised as ours just the same.
  it("still recognises it when Gmail has rewritten the sender back to helpdesk@", async () => {
    inbox({ uid: 3, from: "helpdesk@cristalino.co.il" })
    const { body } = await run()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ "own-address": 1 })
  })
})

describe("other machinery", () => {
  it("skips bounces and auto-replies, marks them read, and counts why", async () => {
    inbox(
      { uid: 1, from: "mailer-daemon@googlemail.com" },
      { uid: 2, from: EMPLOYEE, headers: { "Auto-Submitted": "auto-replied" } },
    )
    const { body } = await run()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ bounce: 1, "auto-reply": 1 })
    expect(seen()).toEqual([1, 2])
  })

  it("leaves the backlog alone — mail from before the cutoff", async () => {
    inbox({ uid: 1, from: EMPLOYEE, receivedAt: "2026-08-01T09:00:00Z" })
    const { body } = await run()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ "before-start": 1 })
  })

  it("does not open a second ticket for a message it already has", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ id: "old" })
    inbox({ uid: 1, from: EMPLOYEE })
    const { body } = await run()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ duplicate: 1 })
  })
})

describe("the contact form — mail we relayed for a person", () => {
  it("opens the ticket for the person in Reply-To, and answers them", async () => {
    inbox({ uid: 1, from: "helpdesk@cristalino.co.il", replyTo: EMPLOYEE, subject: "HelpDesk Issues" })
    const { body } = await run()
    expect(body.created).toBe(1)
    expect(resolveUserByEmail).toHaveBeenCalledWith(EMPLOYEE, "דנה לוי")
    expect(created()[0].userId).toBe(`u:${EMPLOYEE}`)
    expect(mailedTo()).toEqual([STAFF, EMPLOYEE])
  })
})

describe("who gets the automatic reply", () => {
  it("opens a ticket for list mail, but does not answer the list", async () => {
    inbox({ uid: 1, from: "news@vendor.com", headers: { Precedence: "list" } })
    await run()
    expect(prisma.ticket.create).toHaveBeenCalledTimes(1)
    expect(mailedTo()).toEqual([STAFF])
  })

  it("stops answering a sender once the per-sender budget is spent — the circuit breaker", async () => {
    ;(prisma.ticket.count as jest.Mock).mockResolvedValue(AUTO_RESPOND_MAX_PER_SENDER)
    inbox({ uid: 1, from: EMPLOYEE })
    await run()
    expect(prisma.ticket.create).toHaveBeenCalledTimes(1)
    expect(mailedTo()).toEqual([STAFF])
  })

  it("counts the breaker per sender, over recent mail tickets, excluding this one", async () => {
    inbox({ uid: 1, from: EMPLOYEE })
    await run()
    const where = (prisma.ticket.count as jest.Mock).mock.calls[0][0].where
    expect(where.userId).toBe(`u:${EMPLOYEE}`)
    expect(where.sourceMessageId).toEqual({ not: null })
    expect(where.id).toEqual({ not: expect.any(String) })
    expect(where.createdAt.gte).toBeInstanceOf(Date)
  })
})

describe("blast radius", () => {
  it(`opens at most ${MAX_PER_RUN} tickets per run, and leaves the rest unread for the next`, async () => {
    inbox(...Array.from({ length: MAX_PER_RUN + 5 }, (_, i) => ({ uid: i + 1, from: `p${i}@cristalino.co.il` })))
    const { body } = await run()
    expect(body.created).toBe(MAX_PER_RUN)
    expect(seen()).toHaveLength(MAX_PER_RUN)
    expect(seen()).not.toContain(MAX_PER_RUN + 1)
  })
})
