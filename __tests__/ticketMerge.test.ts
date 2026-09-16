/**
 * __tests__/ticketMerge.test.ts — merging tickets (v3.92).
 *
 * The rules live in lib/ticketMerge.ts: which merges are refused, what a merge
 * writes, who becomes a participant, who is mailed. planMerge() is pure and is
 * tested as such; mergeTickets() is tested against a transaction client that
 * records what it was asked to write.
 */

import { mergeProblems, planMerge, mergeTickets, type MergeTicket } from "@/lib/ticketMerge"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"

const mockTx = {
  ticket:            { count: jest.fn(), updateMany: jest.fn() },
  ticketMessage:     { updateMany: jest.fn() },
  ticketNote:        { updateMany: jest.fn(), createMany: jest.fn() },
  ticketAttachment:  { updateMany: jest.fn() },
  ticketParticipant: { createMany: jest.fn() },
  ticketHistory:     { createMany: jest.fn() },
}

jest.mock("@/lib/db", () => ({
  prisma: { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockTx)) },
}))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
  mailTicketMerged: jest.fn().mockReturnValue("<html/>"),
  mailTicketUpdatedStaff: jest.fn().mockReturnValue("<html/>"),
}))

const DANA = { id: "u-dana", name: "דנה לוי", email: "dana@cristalino.co.il" }
const RON  = { id: "u-ron",  name: "רון כהן", email: "ron@cristalino.co.il" }
const MAYA = { id: "u-maya", name: "מאיה", email: "maya@cristalino.co.il" }
const ACTOR = { name: "אלון", email: "alon@cristalino.co.il" }

type Person = typeof DANA

function ticket(o: { id: string; ticketNumber: number; user?: Person; participants?: Person[] } & Record<string, unknown>): MergeTicket {
  const { participants = [], user = DANA, ...rest } = o
  return {
    type: "ticket", subject: "המדפסת לא מדפיסה", description: "מופיעה שגיאה", status: "פתוח", urgency: "בינוני",
    category: "מדפסת", platform: "מחשב אישי", phone: "", computerName: "", assignedTo: "helpdesk@cristalino.co.il",
    createdAt: new Date("2026-09-01T08:00:00Z"), updatedAt: new Date("2026-09-01T08:00:00Z"),
    sourceMessageId: null, holdReason: null, mergedIntoId: null, mergedInto: null,
    userId: user.id, user,
    participants: participants.map(p => ({ user: p })),
    _count: { messages: 0, notes: 0, attachments: 0, equipment: 0 },
    ...rest,
  } as unknown as MergeTicket
}

beforeEach(() => {
  jest.clearAllMocks()
  mockTx.ticket.count.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length)
})

// ── Which merges are refused ───────────────────────────────────────────────────

describe("mergeProblems", () => {
  const target = ticket({ id: "t1", ticketNumber: 1 })

  it("has nothing to say about an ordinary merge", () => {
    expect(mergeProblems(target, [ticket({ id: "t2", ticketNumber: 2, user: RON })])).toEqual([])
  })

  it("refuses to merge a ticket into itself", () => {
    expect(mergeProblems(target, [target]).map(p => p.error)).toEqual(["לא ניתן למזג פנייה לתוך עצמה"])
  })

  it("refuses a source that was already merged, naming where it went", () => {
    const merged = ticket({ id: "t2", ticketNumber: 2, mergedIntoId: "t9", mergedInto: { ticketNumber: 9, type: "ticket" } })
    expect(mergeProblems(target, [merged])[0].error).toContain("HDTC-9")
  })

  it("refuses a target that was already merged — merge into the one it went into", () => {
    const merged = ticket({ id: "t1", ticketNumber: 1, mergedIntoId: "t9", mergedInto: { ticketNumber: 9, type: "request" } })
    const problems = mergeProblems(merged, [ticket({ id: "t2", ticketNumber: 2 })])
    expect(problems).toHaveLength(1)
    expect(problems[0].error).toContain("REQ-9")
  })

  // Equipment lines do not fold into another list: the ticket that has them stays.
  it("refuses a source with an equipment list, but not a target with one", () => {
    const withGear = { _count: { messages: 0, notes: 0, attachments: 0, equipment: 2 } }
    expect(mergeProblems(target, [ticket({ id: "t2", ticketNumber: 2, ...withGear })])[0].error).toContain("רשימת ציוד")
    expect(mergeProblems(ticket({ id: "t1", ticketNumber: 1, ...withGear }), [ticket({ id: "t2", ticketNumber: 2 })])).toEqual([])
  })

  it("refuses a merge with nothing to merge", () => {
    expect(mergeProblems(target, [])).toHaveLength(1)
  })
})

// ── What a merge writes ───────────────────────────────────────────────────────

describe("planMerge", () => {
  it("records the merge on both tickets, and the source's closing", () => {
    const plan = planMerge(ticket({ id: "t1", ticketNumber: 1 }), [ticket({ id: "t2", ticketNumber: 2, urgency: "דחוף" })], ACTOR)
    if (!plan.ok) throw new Error("expected a plan")
    expect(plan.plan.history.map(h => [h.ticketId, h.field, h.oldValue, h.newValue])).toEqual([
      ["t2", "status", "פתוח", "סגור"],
      ["t2", "urgency", "דחוף", "נמוך"],
      ["t2", "merged", "HDTC-2", "HDTC-1"],
      ["t1", "mergedFrom", "HDTC-2", "HDTC-1"],
    ])
    expect(plan.plan.history.every(h => h.actorEmail === ACTOR.email && h.actorName === ACTOR.name)).toBe(true)
  })

  it("writes no status row for a source that was already closed", () => {
    const plan = planMerge(ticket({ id: "t1", ticketNumber: 1 }), [ticket({ id: "t2", ticketNumber: 2, status: "סגור", urgency: "נמוך" })], ACTOR)
    if (!plan.ok) throw new Error("expected a plan")
    expect(plan.plan.history.map(h => h.field)).toEqual(["merged", "mergedFrom"])
  })

  it("keeps the source's subject, opener and description in a note on the target", () => {
    const plan = planMerge(
      ticket({ id: "t1", ticketNumber: 1 }),
      [ticket({ id: "t2", ticketNumber: 2, type: "request", user: RON, subject: "אין הדפסה", description: "כל הקומה" })],
      ACTOR,
    )
    if (!plan.ok) throw new Error("expected a plan")
    expect(plan.plan.notes).toHaveLength(1)
    expect(plan.plan.notes[0]).toMatchObject({ ticketId: "t1", authorEmail: ACTOR.email })
    expect(plan.plan.notes[0].content).toContain("REQ-2")
    expect(plan.plan.notes[0].content).toContain("אין הדפסה")
    expect(plan.plan.notes[0].content).toContain("רון כהן")
    expect(plan.plan.notes[0].content).toContain("כל הקומה")
  })

  describe("participants", () => {
    it("adds the owner of a source that someone else owns", () => {
      const plan = planMerge(ticket({ id: "t1", ticketNumber: 1 }), [ticket({ id: "t2", ticketNumber: 2, user: RON })], ACTOR)
      if (!plan.ok) throw new Error("expected a plan")
      expect(plan.plan.newParticipants).toEqual([RON])
      expect(plan.plan.history.at(-1)).toMatchObject({ ticketId: "t1", field: "participant", newValue: "רון כהן" })
    })

    it("adds nobody when both tickets are the same person's", () => {
      const plan = planMerge(ticket({ id: "t1", ticketNumber: 1 }), [ticket({ id: "t2", ticketNumber: 2 })], ACTOR)
      if (!plan.ok) throw new Error("expected a plan")
      expect(plan.plan.newParticipants).toEqual([])
    })

    it("carries a source's participants over, without the target's owner or its participants", () => {
      const plan = planMerge(
        ticket({ id: "t1", ticketNumber: 1, participants: [MAYA] }),
        [ticket({ id: "t2", ticketNumber: 2, user: RON, participants: [DANA, MAYA] })],
        ACTOR,
      )
      if (!plan.ok) throw new Error("expected a plan")
      expect(plan.plan.newParticipants).toEqual([RON])
    })

    it("adds a person once, however many sources they opened", () => {
      const plan = planMerge(
        ticket({ id: "t1", ticketNumber: 1 }),
        [ticket({ id: "t2", ticketNumber: 2, user: RON }), ticket({ id: "t3", ticketNumber: 3, user: RON })],
        ACTOR,
      )
      if (!plan.ok) throw new Error("expected a plan")
      expect(plan.plan.newParticipants).toEqual([RON])
    })
  })

  it("treats the same source named twice as one", () => {
    const s = ticket({ id: "t2", ticketNumber: 2 })
    const plan = planMerge(ticket({ id: "t1", ticketNumber: 1 }), [s, s], ACTOR)
    if (!plan.ok) throw new Error("expected a plan")
    expect(plan.plan.sources).toHaveLength(1)
    expect(plan.plan.notes).toHaveLength(1)
  })

  it("returns the problems instead of a plan when a merge is refused", () => {
    const t = ticket({ id: "t1", ticketNumber: 1 })
    expect(planMerge(t, [t], ACTOR)).toEqual({ ok: false, problems: [expect.objectContaining({ ticketId: "t1" })] })
  })
})

// ── Carrying it out ───────────────────────────────────────────────────────────

describe("mergeTickets", () => {
  const target  = ticket({ id: "t1", ticketNumber: 1, assignedTo: "tech@cristalino.co.il" })
  const sourceA = ticket({ id: "t2", ticketNumber: 2, user: RON, participants: [MAYA] })
  const sourceB = ticket({ id: "t3", ticketNumber: 3 })

  it("moves the conversation, notes and files, and closes and points the sources at the target", async () => {
    const result = await mergeTickets({ target, sources: [sourceA, sourceB], actor: ACTOR })
    expect(result.ok).toBe(true)
    const moved = { where: { ticketId: { in: ["t2", "t3"] } }, data: { ticketId: "t1" } }
    expect(mockTx.ticketMessage.updateMany).toHaveBeenCalledWith(moved)
    expect(mockTx.ticketNote.updateMany).toHaveBeenCalledWith(moved)
    expect(mockTx.ticketAttachment.updateMany).toHaveBeenCalledWith(moved)
    expect(mockTx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t2", "t3"] } },
      data: { status: "סגור", urgency: "נמוך", holdReason: null, mergedIntoId: "t1" },
    })
  })

  // No chains: a ticket merged into a source now points at the target.
  it("repoints tickets that had been merged into a source", async () => {
    await mergeTickets({ target, sources: [sourceA], actor: ACTOR })
    expect(mockTx.ticket.updateMany).toHaveBeenCalledWith({ where: { mergedIntoId: { in: ["t2"] } }, data: { mergedIntoId: "t1" } })
  })

  it("adds the participants, the notes and the history in the same transaction", async () => {
    await mergeTickets({ target, sources: [sourceA, sourceB], actor: ACTOR })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockTx.ticketParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { ticketId: "t1", userId: "u-ron", addedBy: ACTOR.email },
        { ticketId: "t1", userId: "u-maya", addedBy: ACTOR.email },
      ],
      skipDuplicates: true,
    })
    expect(mockTx.ticketNote.createMany.mock.calls[0][0].data).toHaveLength(2)
    const fields = mockTx.ticketHistory.createMany.mock.calls[0][0].data.map((h: { field: string }) => h.field)
    expect(fields.filter((f: string) => f === "merged")).toHaveLength(2)
    expect(fields.filter((f: string) => f === "participant")).toHaveLength(2)
  })

  it("writes nothing when a ticket was merged by someone else in the meantime", async () => {
    mockTx.ticket.count.mockResolvedValue(1)
    const result = await mergeTickets({ target, sources: [sourceA], actor: ACTOR })
    expect(result.ok).toBe(false)
    expect(mockTx.ticketMessage.updateMany).not.toHaveBeenCalled()
    expect(mockTx.ticketHistory.createMany).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("does not start a transaction for a refused merge", async () => {
    const result = await mergeTickets({ target, sources: [target], actor: ACTOR })
    expect(result.ok).toBe(false)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  describe("mail", () => {
    const sent = () => (sendMail as jest.Mock).mock.calls.map(c => c[0] as { to: string; subject: string })

    it("tells each source's people where it went, once each, under both labels", async () => {
      const result = await mergeTickets({ target, sources: [sourceA, sourceB], actor: ACTOR })
      if (!result.ok) throw new Error("expected a merge")
      await Promise.all(result.mails)
      const people = sent().filter(m => m.to !== "tech@cristalino.co.il")
      expect(people.map(m => m.to)).toEqual([RON.email, MAYA.email, DANA.email])
      expect(people[0].subject).toContain("HDTC-2")
      expect(people[0].subject).toContain("HDTC-1")
    })

    it("tells the target's technician, and never the person who merged", async () => {
      const result = await mergeTickets({ target, sources: [sourceA], actor: ACTOR })
      if (!result.ok) throw new Error("expected a merge")
      expect(sent().map(m => m.to)).toContain("tech@cristalino.co.il")

      jest.clearAllMocks()
      mockTx.ticket.count.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length)
      await mergeTickets({ target: ticket({ id: "t1", ticketNumber: 1, assignedTo: ACTOR.email }), sources: [ticket({ id: "t2", ticketNumber: 2, user: { ...RON, email: ACTOR.email } })], actor: ACTOR })
      expect(sent().map(m => m.to)).toEqual([])
    })

    it("sends nothing with notify: false", async () => {
      const result = await mergeTickets({ target, sources: [sourceA], actor: ACTOR, notify: false })
      expect(result.ok && result.mails).toEqual([])
      expect(sendMail).not.toHaveBeenCalled()
    })
  })
})
