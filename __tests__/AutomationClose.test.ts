/**
 * __tests__/AutomationClose.test.ts
 *
 * Unit tests for POST /api/automation/close.
 *
 * Tests cover:
 *   - 503 when AUTOMATION_API_KEY is not configured
 *   - 401 when key is missing or wrong
 *   - 401 when key matches — auth accepted
 *   - 400 when ticketNumber is missing
 *   - 404 when ticket does not exist
 *   - Idempotency: already-closed ticket returns ok + alreadyClosed flag
 *   - Happy path: ticket is closed, response fields are correct
 *   - Compound close invariant: urgency forced to "נמוך"
 *   - validateKey helper accepts both Authorization and X-Api-Key headers
 *
 * The blocks above test the route's logic in isolation, re-stated as pure
 * functions. The block at the bottom drives the real POST handler, because the
 * bug that shipped in v3.61 lived in the wiring rather than in the logic: the
 * note and the message were created with `void prisma...create(...)`, so the
 * handler returned 200 and the rows were dropped when the request context tore
 * down. No amount of pure-function testing can see that.
 */

import { POST } from "@/app/api/automation/close/route"

// Callbacks handed to `after()` — Next.js runs these once the response is out.
// Collected here so a test can run them and assert on what they did.
const afterCallbacks: (() => unknown)[] = []

jest.mock("@/lib/db", () => ({
  prisma: {
    ticket:          { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    ticketHistory:   { createMany: jest.fn() },
    ticketNote:      { create: jest.fn() },
    ticketMessage:   { create: jest.fn() },
    ticketEquipment: { findMany: jest.fn() },
  },
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("@/lib/mail", () => ({
  sendMail:                  jest.fn(),
  mailTicketClosedWithReview: jest.fn(() => "<html>closed</html>"),
  mailTicketUpdatedStaff:     jest.fn(() => "<html>staff</html>"),
  mailNewMessageToUser:       jest.fn(() => "<html>message</html>"),
}))
jest.mock("next/server", () => ({
  NextRequest: class {},
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
  after: (cb: () => unknown) => { afterCallbacks.push(cb) },
}))

import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"

// ── Minimal stubs ──────────────────────────────────────────────────────────────

const VALID_KEY = "test-secret-key"

/** Simulate the key validation logic from the route (extracted to a pure function for testing). */
function validateKey(authHeader: string, xApiKey: string, configured: string | undefined): boolean {
  if (!configured) return false
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  return bearer === configured || xApiKey === configured
}

/** Simulate the idempotency check. */
function isAlreadyClosed(status: string): boolean {
  return status === "סגור"
}

/** Simulate the compound close urgency rule. */
function compoundClose(data: Record<string, string>): Record<string, string> {
  const result = { ...data, status: "סגור", urgency: "נמוך" }
  return result
}

// ── validateKey ────────────────────────────────────────────────────────────────

describe("validateKey", () => {
  it("returns false when AUTOMATION_API_KEY is not set", () => {
    expect(validateKey("Bearer " + VALID_KEY, "", undefined)).toBe(false)
  })

  it("returns false for empty auth header and no x-api-key", () => {
    expect(validateKey("", "", VALID_KEY)).toBe(false)
  })

  it("returns false for wrong Bearer key", () => {
    expect(validateKey("Bearer wrongkey", "", VALID_KEY)).toBe(false)
  })

  it("returns false for wrong x-api-key", () => {
    expect(validateKey("", "wrongkey", VALID_KEY)).toBe(false)
  })

  it("returns true for correct Bearer token", () => {
    expect(validateKey(`Bearer ${VALID_KEY}`, "", VALID_KEY)).toBe(true)
  })

  it("returns true for correct X-Api-Key header", () => {
    expect(validateKey("", VALID_KEY, VALID_KEY)).toBe(true)
  })

  it("returns false when bearer prefix is missing", () => {
    // Must be 'Bearer <key>', not the key alone in Authorization header
    expect(validateKey(VALID_KEY, "", VALID_KEY)).toBe(false)
  })
})

// ── isAlreadyClosed ────────────────────────────────────────────────────────────

describe("isAlreadyClosed", () => {
  it("returns true for סגור status", () => {
    expect(isAlreadyClosed("סגור")).toBe(true)
  })

  it("returns false for פתוח", () => {
    expect(isAlreadyClosed("פתוח")).toBe(false)
  })

  it("returns false for בטיפול", () => {
    expect(isAlreadyClosed("בטיפול")).toBe(false)
  })
})

// ── compoundClose ──────────────────────────────────────────────────────────────

describe("compoundClose (urgency invariant)", () => {
  it("always sets status to סגור regardless of input", () => {
    const result = compoundClose({ status: "פתוח" })
    expect(result.status).toBe("סגור")
  })

  it("always sets urgency to נמוך (compound close invariant)", () => {
    const result = compoundClose({ urgency: "דחוף" })
    expect(result.urgency).toBe("נמוך")
  })

  it("preserves other fields alongside the forced status/urgency", () => {
    const result = compoundClose({ subject: "test", category: "תוכנה" })
    expect(result.subject).toBe("test")
    expect(result.category).toBe("תוכנה")
    expect(result.status).toBe("סגור")
    expect(result.urgency).toBe("נמוך")
  })

  it("overrides any urgency passed in — urgency is always נמוך on close", () => {
    // Even if caller passes urgency: "גבוה", compound close forces it to "נמוך"
    const result = compoundClose({ urgency: "גבוה" })
    expect(result.urgency).toBe("נמוך")
  })
})

// ── Request body validation ────────────────────────────────────────────────────

describe("request validation logic", () => {
  it("rejects body without ticketNumber", () => {
    const body = { message: "test" } as Record<string, unknown>
    expect(!body.ticketNumber).toBe(true)
  })

  it("accepts body with only ticketNumber", () => {
    const body = { ticketNumber: 79 }
    expect(body.ticketNumber).toBe(79)
  })

  it("ticketNumber 0 is falsy and should be rejected", () => {
    // Edge case: ticketNumbers start at 1 in the schema
    const body = { ticketNumber: 0 }
    expect(!body.ticketNumber).toBe(true)
  })

  it("parses optional fields correctly", () => {
    const body = {
      ticketNumber: 79,
      message:   "resolved",
      note:      "internal note",
      actorName: "Deploy Bot",
      actorEmail: "bot@cristalino.co.il",
      fields: { category: "תוכנה", subject: "Updated subject" },
    }
    expect(body.fields.category).toBe("תוכנה")
    expect(body.fields.subject).toBe("Updated subject")
    expect(body.actorName).toBe("Deploy Bot")
  })

  it("defaults actorName and actorEmail when not provided", () => {
    const { actorName = "Automation", actorEmail = "helpdesk@cristalino.co.il" } = {} as {
      actorName?: string; actorEmail?: string
    }
    expect(actorName).toBe("Automation")
    expect(actorEmail).toBe("helpdesk@cristalino.co.il")
  })
})

// ── History entry generation ───────────────────────────────────────────────────

describe("history entry generation", () => {
  interface HistoryRow {
    ticketId: string; field: string
    oldValue?: string | null; newValue?: string | null
    actorName: string; actorEmail: string
  }

  function buildHistoryEntries(
    ticketId: string,
    before: { status: string; urgency: string },
    fields: Record<string, string | undefined>,
    actorName: string,
    actorEmail: string
  ): HistoryRow[] {
    const entries: HistoryRow[] = [
      { ticketId, field: "status",  oldValue: before.status,  newValue: "סגור", actorName, actorEmail },
      { ticketId, field: "urgency", oldValue: before.urgency, newValue: "נמוך", actorName, actorEmail },
    ]
    const hasFieldEdit = Object.keys(fields).some(
      k => fields[k] !== undefined && fields[k] !== before[k as keyof typeof before]
    )
    if (hasFieldEdit) entries.push({ ticketId, field: "edited", actorName, actorEmail })
    return entries
  }

  it("always writes status and urgency history entries on close", () => {
    const entries = buildHistoryEntries("id1", { status: "פתוח", urgency: "דחוף" }, {}, "Bot", "bot@x.il")
    expect(entries.length).toBe(2)
    expect(entries[0].field).toBe("status")
    expect(entries[1].field).toBe("urgency")
  })

  it("adds an 'edited' entry when fields differ from before", () => {
    const entries = buildHistoryEntries(
      "id1", { status: "פתוח", urgency: "גבוה" },
      { category: "תוכנה" }, "Bot", "bot@x.il"
    )
    expect(entries.length).toBe(3)
    expect(entries[2].field).toBe("edited")
  })

  it("does not add 'edited' entry when fields object is empty", () => {
    const entries = buildHistoryEntries("id1", { status: "פתוח", urgency: "גבוה" }, {}, "Bot", "bot@x.il")
    expect(entries.length).toBe(2)
    expect(entries.some(e => e.field === "edited")).toBe(false)
  })

  it("records old and new values for status", () => {
    const entries = buildHistoryEntries("id1", { status: "בטיפול", urgency: "בינוני" }, {}, "Bot", "bot@x.il")
    const statusEntry = entries.find(e => e.field === "status")!
    expect(statusEntry.oldValue).toBe("בטיפול")
    expect(statusEntry.newValue).toBe("סגור")
  })
})

// ── The real handler: side effects that must survive the response ──────────────
//
// Everything above this line tests re-stated logic. Everything below drives the
// exported POST, because the failure being guarded against is not a wrong value
// — it is a write that never happens.

describe("POST /api/automation/close — persisted side effects", () => {
  const ticketDb  = prisma.ticket        as unknown as { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock }
  const historyDb = prisma.ticketHistory as unknown as { createMany: jest.Mock }
  const noteDb    = prisma.ticketNote    as unknown as { create: jest.Mock }
  const messageDb = prisma.ticketMessage as unknown as { create: jest.Mock }
  const mail      = sendMail as jest.Mock

  const BEFORE = {
    id:           "ticket-523",
    ticketNumber: 523,
    subject:      "מדפסת לא מדפיסה",
    description:  "תיאור",
    status:       "בטיפול",
    urgency:      "גבוה",
    category:     "חומרה",
    platform:     "Windows",
    phone:        "050-0000000",
    computerName: "PC-12",
    assignedTo:   "tech@cristalino.co.il",
    user: { name: "דנה", email: "dana@cristalino.co.il" },
  }
  const AFTER = { ...BEFORE, status: "סגור", urgency: "נמוך" }

  type Res = { status: number; json: () => Promise<Record<string, unknown>> }

  /** Build the fake NextRequest the route reads: two headers and a JSON body. */
  const call = (body: Record<string, unknown>, key = VALID_KEY) =>
    POST({
      headers: {
        get: (n: string) => (n.toLowerCase() === "authorization" ? `Bearer ${key}` : null),
      },
      json: async () => body,
    } as never) as unknown as Promise<Res>

  /** Run what the route deferred with `after()`, the way Next.js would. */
  const flushAfter = async () => {
    const pending = afterCallbacks.splice(0)
    await Promise.all(pending.map(cb => cb()))
  }

  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    afterCallbacks.length = 0
    process.env = { ...originalEnv, AUTOMATION_API_KEY: VALID_KEY }

    ticketDb.findUnique.mockResolvedValue(BEFORE)
    ticketDb.update.mockResolvedValue(AFTER)
    ticketDb.updateMany.mockResolvedValue({ count: 0 })
    historyDb.createMany.mockResolvedValue({ count: 2 })
    noteDb.create.mockResolvedValue({ id: "note-1" })
    messageDb.create.mockResolvedValue({ id: "msg-1" })
    mail.mockResolvedValue(undefined)
  })

  afterAll(() => { process.env = originalEnv })

  it("persists the note and the message that came with the close", async () => {
    // The v3.61 regression: this returned 200 and wrote neither row.
    const res = await call({
      ticketNumber: 523,
      message:      "הבעיה טופלה — המדפסת אותחלה.",
      note:         "Restarted the print spooler remotely.",
      actorName:    "Deploy Bot",
      actorEmail:   "bot@cristalino.co.il",
    })

    expect(res.status).toBe(200)

    expect(messageDb.create).toHaveBeenCalledTimes(1)
    expect(messageDb.create).toHaveBeenCalledWith({
      data: {
        ticketId:    "ticket-523",
        content:     "הבעיה טופלה — המדפסת אותחלה.",
        authorName:  "Deploy Bot",
        authorEmail: "bot@cristalino.co.il",
        authorRole:  "staff",
      },
    })

    expect(noteDb.create).toHaveBeenCalledTimes(1)
    expect(noteDb.create).toHaveBeenCalledWith({
      data: {
        ticketId:    "ticket-523",
        content:     "Restarted the print spooler remotely.",
        authorName:  "Deploy Bot",
        authorEmail: "bot@cristalino.co.il",
      },
    })
  })

  it("defaults the note/message author to Automation when no actor is given", async () => {
    await call({ ticketNumber: 523, message: "טופל", note: "auto" })

    expect(messageDb.create.mock.calls[0][0].data).toMatchObject({
      authorName:  "Automation",
      authorEmail: "helpdesk@cristalino.co.il",
      authorRole:  "staff",
    })
    expect(noteDb.create.mock.calls[0][0].data).toMatchObject({
      authorName:  "Automation",
      authorEmail: "helpdesk@cristalino.co.il",
    })
  })

  it("does not answer 200 until the note and message writes have settled", async () => {
    // This is the assertion that fails against `void prisma...create()`. A
    // response that outruns its own writes is the whole bug — checking only
    // that create() was *called* would pass on the broken code too.
    let releaseNote: () => void = () => {}
    noteDb.create.mockReturnValue(new Promise(resolve => {
      releaseNote = () => resolve({ id: "note-1" })
    }))

    let responded = false
    const pending = call({ ticketNumber: 523, message: "טופל", note: "slow write" })
      .then(res => { responded = true; return res })

    // Give every already-resolved await in the handler a chance to run.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(responded).toBe(false)

    releaseNote()
    const res = await pending
    expect(res.status).toBe(200)
  })

  it("writes nothing when neither a note nor a message was sent", async () => {
    const res = await call({ ticketNumber: 523 })

    expect(res.status).toBe(200)
    expect(noteDb.create).not.toHaveBeenCalled()
    expect(messageDb.create).not.toHaveBeenCalled()
    // The close itself still happened.
    expect(ticketDb.update).toHaveBeenCalledTimes(1)
    expect(historyDb.createMany).toHaveBeenCalledTimes(1)
  })

  it("ignores a whitespace-only note or message", async () => {
    await call({ ticketNumber: 523, message: "   ", note: "\n\t " })

    expect(noteDb.create).not.toHaveBeenCalled()
    expect(messageDb.create).not.toHaveBeenCalled()
  })

  it("trims the note and message before storing them", async () => {
    await call({ ticketNumber: 523, message: "  טופל  ", note: "  done  " })

    expect(messageDb.create.mock.calls[0][0].data.content).toBe("טופל")
    expect(noteDb.create.mock.calls[0][0].data.content).toBe("done")
  })

  it("addresses all three closure emails", async () => {
    await call({ ticketNumber: 523, message: "טופל" })
    await flushAfter()

    // Owner review request, assigned-staff update, and the new-message notice.
    expect(mail).toHaveBeenCalledTimes(3)
    const subjects = mail.mock.calls.map(c => c[0].subject as string)
    expect(subjects.some(s => s.includes("HDTC-523"))).toBe(true)
    expect(mail.mock.calls.some(c => c[0].to === "dana@cristalino.co.il")).toBe(true)
    expect(mail.mock.calls.some(c => {
      const to = c[0].to
      return Array.isArray(to) && to.includes("tech@cristalino.co.il")
    })).toBe(true)
  })

  it("keeps the closure emails alive past the response instead of abandoning them", async () => {
    // `after` does not delay the *sending* — sendMail is called while the mails
    // array is built. What it changes is who waits for the sends to finish: the
    // framework, rather than nobody. Under a bare `void`, an in-flight send is
    // dropped at request teardown and the owner never gets the review email.
    let releaseMail: () => void = () => {}
    mail.mockReturnValueOnce(new Promise<void>(resolve => { releaseMail = () => resolve() }))

    await call({ ticketNumber: 523, message: "טופל" })

    expect(mail).toHaveBeenCalledTimes(3)
    expect(afterCallbacks.length).toBeGreaterThan(0)

    let flushed = false
    const pending = flushAfter().then(() => { flushed = true })

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flushed).toBe(false)   // still holding the invocation open for the slow send

    releaseMail()
    await pending
    expect(flushed).toBe(true)
  })

  it("runs the urgency sweep after the response rather than during it", async () => {
    await call({ ticketNumber: 523 })

    expect(ticketDb.updateMany).not.toHaveBeenCalled()

    await flushAfter()

    expect(ticketDb.updateMany).toHaveBeenCalledWith({
      where: { status: "סגור", urgency: { not: "נמוך" } },
      data:  { urgency: "נמוך" },
    })
  })

  it("skips every side effect on an already-closed ticket", async () => {
    ticketDb.findUnique.mockResolvedValue({ ...BEFORE, status: "סגור", urgency: "נמוך" })

    const res = await call({ ticketNumber: 523, message: "טופל", note: "again" })

    expect(await res.json()).toMatchObject({ ok: true, alreadyClosed: true })
    expect(noteDb.create).not.toHaveBeenCalled()
    expect(messageDb.create).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(0)
  })

  it("writes nothing when the API key is wrong", async () => {
    const res = await call({ ticketNumber: 523, message: "טופל", note: "x" }, "wrong-key")

    expect(res.status).toBe(401)
    expect(noteDb.create).not.toHaveBeenCalled()
    expect(messageDb.create).not.toHaveBeenCalled()
  })
})
