/**
 * __tests__/IngestMailRoute.test.ts — POST /api/admin/ingest-mail, driven end
 * to end against a fake mailbox.
 *
 * lib/mailIngest.ts decides; this drives the route that acts on those
 * decisions, because the ways "every mail opens a ticket" can go wrong are
 * all in the I/O: which messages are searched for at all (a 929-message
 * backlog), whether the app's own confirmation comes back round as a new
 * ticket (the loop), who gets answered, how many tickets one run opens — and,
 * since v3.83, whether a reply to a ticket joins it or wrongly opens another.
 */

import type { NextRequest } from "next/server"
import { POST } from "@/app/api/admin/ingest-mail/route"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { resolveUserByEmail, findUserByEmail } from "@/lib/users"
import { INGEST_START, MAX_PER_RUN, AUTO_RESPOND_MAX_PER_SENDER } from "@/lib/mailIngest"
import { storeAttachment } from "@/lib/storeAttachment"
import { logError } from "@/lib/logError"

// ── The fake mailbox ─────────────────────────────────────────────────────────

type Msg = {
  uid: number
  from: string
  name?: string
  subject?: string
  text?: string
  replyTo?: string
  headers?: Record<string, string>
  receivedAt?: string
  messageId?: string
  attachments?: { filename?: string; contentType?: string; related?: boolean; content: Buffer }[]
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
    ticketMessage: { findFirst: jest.fn(), create: jest.fn() },
  },
}))
jest.mock("@/lib/users", () => ({
  resolveUserByEmail: jest.fn(async (email: string) => ({ id: `u:${email}` })),
  findUserByEmail: jest.fn(async () => null),
}))
jest.mock("@/lib/staffMembers", () => ({
  getStaffEmails: jest.fn(async () => ["alon@cristalino.co.il"]),
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))
jest.mock("@/lib/storeAttachment", () => ({ storeAttachment: jest.fn(async () => ({ id: "a1" })) }))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => {}),
  mailTicketOpenedStaff: jest.fn(() => "<staff>"),
  mailTicketOpenedUser: jest.fn(() => "<user>"),
  mailNewMessageToUser: jest.fn(() => "<message-to-user>"),
  mailNewMessageToStaff: jest.fn(() => "<message-to-staff>"),
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
      text: m.text ?? "גוף ההודעה",
      messageId: m.messageId ?? `<${m.uid}@mail>`,
      attachments: m.attachments ?? [],
      headerLines: Object.entries(m.headers ?? {}).map(([k, v]) => ({ key: k.toLowerCase(), line: `${k}: ${v}` })),
    })
  }
}

type Body = {
  ok?: boolean; created?: number; tickets?: number[]; replies?: number[]
  skipped?: Record<string, number>; error?: string
}
const req = (secret = "s") =>
  ({ headers: { get: (k: string) => (k === "x-ingest-secret" ? secret : null) } }) as unknown as NextRequest
async function run(secret?: string): Promise<{ status: number; body: Body }> {
  const res = (await POST(req(secret))) as unknown as { status: number; json: () => Promise<Body> }
  return { status: res.status, body: await res.json() }
}

const created  = () => (prisma.ticket.create as jest.Mock).mock.calls.map(c => c[0].data)
const messages = () => (prisma.ticketMessage.create as jest.Mock).mock.calls.map(c => c[0].data)
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
  ;(prisma.ticketMessage.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.ticketMessage.create as jest.Mock).mockResolvedValue({ id: "m1" })
  ;(findUserByEmail as jest.Mock).mockResolvedValue(null)
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

  // Gmail rewrote From back to helpdesk@ until noreply_helpdesk@ was a
  // verified send-as. That must be recognised as ours just the same.
  it("still recognises it when the sender is helpdesk@ itself", async () => {
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

describe("replies to a ticket join it (v3.83)", () => {
  // Notifications come from noreply_helpdesk@, an alias of the intake mailbox,
  // so replies to them land here. The user chose: add them to their ticket.
  const TICKET = {
    id: "t597", ticketNumber: 597, subject: "המדפסת לא עובדת", description: "", urgency: "בינוני",
    category: "אחר", platform: "מחשב אישי", phone: "", computerName: "", status: "פתוח",
    user: { name: "דנה לוי", email: EMPLOYEE },
  }
  const QUOTED = "עדיין לא עובד\n\nOn Mon, Sep 14, 2026 at 11:08 AM Cristalino Helpdesk <noreply_helpdesk@cristalino.co.il> wrote:\n> תגובה חדשה על פנייתך"
  const REPLY_SUBJECT = "Re: תגובה חדשה על פנייתך HDTC-597: המדפסת לא עובדת"
  beforeEach(() => {
    ;(prisma.ticket.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { ticketNumber?: number } }) =>
      where.ticketNumber === 597 ? TICKET : null)
  })

  it("adds the owner's reply to the ticket's conversation, without the quoted mail", async () => {
    inbox({ uid: 1, from: EMPLOYEE, name: "דנה לוי", subject: REPLY_SUBJECT, text: QUOTED })
    const { body } = await run()
    expect(body.replies).toEqual([597])
    expect(body.created).toBe(0)
    expect(prisma.ticket.create).not.toHaveBeenCalled()
    expect(messages()[0]).toMatchObject({
      ticketId: "t597", content: "עדיין לא עובד", authorEmail: EMPLOYEE, authorName: "דנה לוי", authorRole: "user",
    })
    expect(seen()).toEqual([1])
  })

  // As for a reply typed in the app — and no "your request was received".
  it("tells staff, under a subject that names the ticket, and sends the owner nothing", async () => {
    inbox({ uid: 1, from: EMPLOYEE, subject: REPLY_SUBJECT, text: QUOTED })
    await run()
    expect(mailedTo()).toEqual([STAFF])
    expect((sendMail as jest.Mock).mock.calls[0][0].subject).toContain("HDTC-597")
  })

  it("adds a staff reply as staff, and tells the owner", async () => {
    inbox({ uid: 1, from: "alon@cristalino.co.il", subject: REPLY_SUBJECT, text: "טופל, נסו עכשיו" })
    await run()
    expect(messages()[0]).toMatchObject({ authorRole: "staff", authorEmail: "alon@cristalino.co.il" })
    expect(mailedTo()).toEqual([EMPLOYEE])
  })

  it("treats an admin who is not in STAFF_EMAILS as staff", async () => {
    ;(findUserByEmail as jest.Mock).mockResolvedValue({ id: "u-aviel", name: "אביאל", isAdmin: true })
    inbox({ uid: 1, from: "aviel.bt@cristalino.co.il", subject: REPLY_SUBJECT, text: "בדרך" })
    await run()
    expect(messages()[0]).toMatchObject({ authorRole: "staff", authorName: "אביאל" })
  })

  // Nobody may write into someone else's ticket by guessing its number.
  it("opens a new ticket, not a message, when a stranger names someone else's ticket", async () => {
    inbox({ uid: 1, from: "stranger@cristalino.co.il", subject: REPLY_SUBJECT })
    const { body } = await run()
    expect(prisma.ticketMessage.create).not.toHaveBeenCalled()
    expect(body.created).toBe(1)
  })

  it("opens a new ticket when the number matches no ticket — nothing is lost", async () => {
    inbox({ uid: 1, from: EMPLOYEE, subject: "Re: HDTC-99999" })
    const { body } = await run()
    expect(prisma.ticketMessage.create).not.toHaveBeenCalled()
    expect(body.created).toBe(1)
  })

  it("does not add the same reply twice", async () => {
    ;(prisma.ticketMessage.findFirst as jest.Mock).mockResolvedValue({ id: "m-earlier" })
    inbox({ uid: 1, from: EMPLOYEE, subject: REPLY_SUBJECT, text: QUOTED })
    const { body } = await run()
    expect(prisma.ticketMessage.create).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ duplicate: 1 })
    expect(seen()).toEqual([1])
  })

  // v3.92 — merging. A reply that names a merged ticket goes on in the one it
  // was merged into; the people who follow that ticket may write to it by mail.
  describe("merged tickets and participants (v3.92)", () => {
    const SURVIVOR = {
      ...TICKET, id: "t601", ticketNumber: 601, subject: "אין הדפסה בקומה 2",
      user: { name: "רון כהן", email: "ron@cristalino.co.il" },
      participants: [{ user: { id: "u-dana", name: "דנה לוי", email: EMPLOYEE } }],
    }
    beforeEach(() => {
      ;(prisma.ticket.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { ticketNumber?: number; id?: string } }) =>
        where.ticketNumber === 597 ? { ...TICKET, mergedIntoId: "t601" }
          : where.id === "t601" || where.ticketNumber === 601 ? SURVIVOR
          : null)
    })

    it("adds a reply to a merged ticket to the ticket it was merged into", async () => {
      inbox({ uid: 1, from: EMPLOYEE, name: "דנה לוי", subject: REPLY_SUBJECT, text: QUOTED })
      const { body } = await run()
      expect(body.replies).toEqual([601])
      expect(body.created).toBe(0)
      expect(messages()[0]).toMatchObject({ ticketId: "t601", authorEmail: EMPLOYEE, authorRole: "user" })
    })

    it("accepts a participant's reply to the ticket they follow", async () => {
      inbox({ uid: 1, from: EMPLOYEE, subject: "Re: תגובה חדשה על פנייתך REQ-601: אין הדפסה", text: "גם אצלי" })
      const { body } = await run()
      expect(body.replies).toEqual([601])
      expect(messages()[0]).toMatchObject({ ticketId: "t601", content: "גם אצלי" })
    })

    it("tells the owner and the participants when staff reply by mail", async () => {
      inbox({ uid: 1, from: "alon@cristalino.co.il", subject: "Re: HDTC-601", text: "טופל" })
      await run()
      expect(messages()[0]).toMatchObject({ ticketId: "t601", authorRole: "staff" })
      expect((sendMail as jest.Mock).mock.calls.map(c => c[0].to).sort()).toEqual([EMPLOYEE, "ron@cristalino.co.il"].sort())
    })
  })

  // Our own notification names its ticket too — it must still be skipped as
  // ours, never added to the ticket as if someone had written it.
  it("never adds one of our own notifications to the ticket it names", async () => {
    inbox({ uid: 1, from: "noreply_helpdesk@cristalino.co.il", subject: "עדכון פנייה HDTC-597: המדפסת לא עובדת", headers: { "Auto-Submitted": "auto-generated" } })
    const { body } = await run()
    expect(prisma.ticketMessage.create).not.toHaveBeenCalled()
    expect(body.skipped).toEqual({ "own-address": 1 })
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

describe("attachments on inbound mail (v3.84)", () => {
  const file = (filename: string, contentType: string, bytes = 1000, related = false) =>
    ({ filename, contentType, related, content: Buffer.alloc(bytes, 1) })
  const stored = () => (storeAttachment as jest.Mock).mock.calls
    .map(c => ({ ticketId: c[0], mimeType: c[1].mimeType, filename: c[1].filename }))

  it("saves an allowed attachment onto the new ticket", async () => {
    inbox({ uid: 1, from: EMPLOYEE, subject: "המדפסת", attachments: [file("שגיאה.pdf", "application/pdf")] })
    const { body } = await run()
    expect(body.created).toBe(1)
    expect(stored()).toEqual([{ ticketId: "t901", mimeType: "application/pdf", filename: "שגיאה.pdf" }])
  })

  it("names what it could not save in the description, and saves the rest", async () => {
    inbox({ uid: 1, from: EMPLOYEE, attachments: [
      file("logo.svg", "image/svg+xml"),
      file("setup.exe", "application/octet-stream"),
      file("shot.png", "image/png", 50_000),
    ] })
    await run()
    const description = created()[0].description as string
    expect(description).toContain("קבצים מצורפים שלא נשמרו")
    expect(description).toContain("logo.svg")
    expect(description).toContain("setup.exe")
    expect(stored().map(s => s.filename)).toEqual(["shot.png"])
  })

  it("skips the small inline images of a signature, without mentioning them", async () => {
    inbox({ uid: 1, from: EMPLOYEE, attachments: [file("image001.png", "image/png", 4_000, true)] })
    await run()
    expect(storeAttachment).not.toHaveBeenCalled()
    expect(created()[0].description).not.toContain("לא נשמרו")
  })

  it("opens the ticket even when saving an attachment fails", async () => {
    ;(storeAttachment as jest.Mock).mockRejectedValueOnce(new Error("disk full"))
    inbox({ uid: 1, from: EMPLOYEE, attachments: [file("a.pdf", "application/pdf")] })
    const { body } = await run()
    expect(body.created).toBe(1)
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("disk full"), expect.any(String), expect.anything())
  })

  it("adds a reply's attachment to the ticket it answers", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({
      id: "t597", ticketNumber: 597, subject: "מדפסת", user: { name: "דנה", email: EMPLOYEE },
    })
    inbox({ uid: 1, from: EMPLOYEE, subject: "Re: עדכון על פנייתך HDTC-597 – בטיפול", text: "מצרפת צילום",
      attachments: [file("screen.png", "image/png", 80_000)] })
    const { body } = await run()
    expect(body.replies).toEqual([597])
    expect(stored()).toEqual([{ ticketId: "t597", mimeType: "image/png", filename: "screen.png" }])
  })
})

// The dev copy shares the mailbox credentials. A message it read would be
// marked \Seen, and production's intake would never see it (v3.86).
describe("the dev copy (v3.86)", () => {
  it("never reads the helpdesk mailbox", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "dev"
    inbox({ uid: 1, from: EMPLOYEE })
    const { status } = await run()
    expect(status).toBe(503)
    expect(mockImap.connect).not.toHaveBeenCalled()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })

  it("reads one only when INGEST_ENABLED=1 says it has a mailbox of its own", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "dev"
    process.env.INGEST_ENABLED = "1"
    inbox({ uid: 1, from: EMPLOYEE })
    const { body } = await run()
    expect(body.created).toBe(1)
  })
})
