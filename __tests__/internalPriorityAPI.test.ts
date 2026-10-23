/**
 * @jest-environment node
 */
/**
 * __tests__/internalPriorityAPI.test.ts — the internal priority at the routes (v3.107).
 *
 *   • only staff set it, only to P1–P5 or nothing, and a change to it alone
 *     is triage: a history row, no mail;
 *   • it never reaches anyone who is not staff — not the reporter on their
 *     own ticket, not a viewer reading the queue — and neither do its history
 *     rows or its SLA targets.
 */

import type { NextRequest } from "next/server"
import { PATCH, GET as getMine } from "@/app/api/tickets/route"
import { GET as getOne } from "@/app/api/tickets/[id]/route"
import { GET as getHistory } from "@/app/api/tickets/[id]/history/route"
import { GET as getAll } from "@/app/api/tickets/all/route"
import { GET as readPrioritySla } from "@/app/api/settings/priority-sla/route"
import { PUT as writePrioritySla } from "@/app/api/admin/settings/priority-sla/route"
import { applyTicketChanges, type LoadedTicket } from "@/lib/ticketChanges"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { logInfo } from "@/lib/logError"
import { PRIORITY_HISTORY_FIELD } from "@/lib/internalPriority"

const mockStore = new Map<string, string>()

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    $transaction: jest.fn(async (ops: unknown) =>
      typeof ops === "function" ? (ops as (tx: unknown) => unknown)(jest.requireMock("@/lib/db").prisma) : Promise.all(ops as Promise<unknown>[])),
    user: { findFirst: jest.fn() },
    userEmail: { findFirst: jest.fn(async () => null) },
    ticket: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    ticketHistory: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    ticketNote: { create: jest.fn() },
    ticketEquipment: { findMany: jest.fn().mockResolvedValue([]) },
    appSetting: {
      findMany: jest.fn(async () => [...mockStore.entries()].map(([key, value]) => ({ key, value }))),
      upsert: jest.fn(async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        mockStore.set(where.key, update.value)
        return {}
      }),
    },
  },
}))
jest.mock("@/lib/mail", () => ({
  sendMail: jest.fn(async () => undefined),
  mailTicketOpenedStaff: jest.fn(), mailTicketOpenedUser: jest.fn(), mailTicketUpdatedStaff: jest.fn(),
  mailTicketStatusUser: jest.fn(), mailTicketClosedWithReview: jest.fn(), mailTicketClosedParticipant: jest.fn(),
}))
jest.mock("@/lib/logError", () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock("@/lib/staffEmails", () => ({
  STAFF_EMAILS: ["helpdesk@cristalino.co.il"],
  VIEWER_EMAILS: ["viewer@cristalino.co.il"],
}))
jest.mock("@/lib/staffMembers", () => ({ getStaffEmails: jest.fn().mockResolvedValue(["staff@cristalino.co.il"]) }))
jest.mock("next/server", () => ({
  after: (cb: () => unknown) => { void cb() },
  NextResponse: { json: (data: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => data }) },
}))

type Res = { status: number; json: () => Promise<Record<string, unknown> & Record<string, unknown>[]> }
const signedIn = (user: Record<string, unknown> | null) => (auth as jest.Mock).mockResolvedValue(user ? { user } : null)
const body = (b: unknown) => ({ json: async () => b, nextUrl: { searchParams: new URLSearchParams() } }) as unknown as NextRequest
const params = (id: string) => ({ params: Promise.resolve({ id }) })

const ADMIN = { email: "eyal@cristalino.co.il", name: "אייל", isAdmin: true }
const STAFF = { email: "helpdesk@cristalino.co.il", name: "Helpdesk", isAdmin: false }
const OWNER = { email: "user@cristalino.co.il", name: "User", isAdmin: false }
const VIEWER = { email: "viewer@cristalino.co.il", name: "Viewer", isAdmin: false }

const row = (over: Record<string, unknown> = {}) => ({
  id: "t1", ticketNumber: 700, type: "ticket", subject: "המדפסת", description: "", phone: "", computerName: "",
  urgency: "בינוני", category: "אחר", platform: "מחשב אישי", status: "פתוח", assignedTo: "helpdesk@cristalino.co.il",
  internalPriority: null, userId: "u1", updatedAt: new Date(), createdAt: new Date(),
  user: { name: "User", email: "user@cristalino.co.il" }, participants: [], mergedInto: null, ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockStore.clear()
})

describe("PATCH /api/tickets — setting it", () => {
  beforeEach(() => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(row())
    ;(prisma.ticket.update as jest.Mock).mockImplementation(async ({ data }) => row(data))
  })

  it("lets staff classify a ticket, records it, and mails nobody", async () => {
    signedIn(STAFF)
    const res = await PATCH(body({ id: "t1", internalPriority: "P1" })) as unknown as Res
    expect(res.status).toBe(200)
    expect((prisma.ticket.update as jest.Mock).mock.calls[0][0].data).toEqual({ internalPriority: "P1" })
    expect((prisma.ticketHistory.createMany as jest.Mock).mock.calls[0][0].data).toEqual([
      expect.objectContaining({ field: PRIORITY_HISTORY_FIELD, oldValue: null, newValue: "P1", actorEmail: STAFF.email }),
    ])
    expect(sendMail).not.toHaveBeenCalled()
    expect((await res.json()).internalPriority).toBe("P1")
  })

  it("reads a level in any case and clears it with null or an empty string", async () => {
    signedIn(ADMIN)
    await PATCH(body({ id: "t1", internalPriority: "p2" }))
    expect((prisma.ticket.update as jest.Mock).mock.calls[0][0].data.internalPriority).toBe("P2")
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(row({ internalPriority: "P2" }))
    await PATCH(body({ id: "t1", internalPriority: null }))
    await PATCH(body({ id: "t1", internalPriority: "" }))
    expect((prisma.ticket.update as jest.Mock).mock.calls[1][0].data.internalPriority).toBeNull()
    expect((prisma.ticket.update as jest.Mock).mock.calls[2][0].data.internalPriority).toBeNull()
  })

  it("refuses something that is not a level, and writes nothing", async () => {
    signedIn(STAFF)
    const res = await PATCH(body({ id: "t1", internalPriority: "P9" })) as unknown as Res
    expect(res.status).toBe(400)
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })

  it("still mails as before when the status changes alongside it", async () => {
    signedIn(STAFF)
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(row({ assignedTo: "dana@cristalino.co.il" }))
    await PATCH(body({ id: "t1", internalPriority: "P1", status: "בטיפול" }))
    expect(sendMail).toHaveBeenCalled()
  })

  it("ignores it from the reporter, and answers them without it", async () => {
    signedIn(OWNER)
    ;(prisma.ticket.update as jest.Mock).mockImplementation(async ({ data }) => row({ ...data, internalPriority: "P3" }))
    const res = await PATCH(body({ id: "t1", status: "סגור", internalPriority: "P5" })) as unknown as Res
    expect(res.status).toBe(200)
    expect((prisma.ticket.update as jest.Mock).mock.calls[0][0].data).not.toHaveProperty("internalPriority")
    expect(await res.json()).not.toHaveProperty("internalPriority")
  })
})

describe("reading tickets", () => {
  it("GET /api/tickets keeps it from the reporter and on a staff member's own board", async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: "u1", email: OWNER.email })
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([row({ internalPriority: "P2" })])
    signedIn(OWNER)
    const mine = await (await getMine() as unknown as Res).json()
    expect(mine[0]).not.toHaveProperty("internalPriority")
    signedIn(STAFF)
    const staffs = await (await getMine() as unknown as Res).json()
    expect(staffs[0].internalPriority).toBe("P2")
  })

  it("GET /api/tickets/[id] strips it and its history rows for the reporter", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(row({ internalPriority: "P1", history: [] }))
    signedIn(OWNER)
    const res = await getOne(body(null), params("t1")) as unknown as Res
    expect(await res.json()).not.toHaveProperty("internalPriority")
    const include = (prisma.ticket.findUnique as jest.Mock).mock.calls[0][0].include
    expect(include.history.where).toEqual({ field: { not: PRIORITY_HISTORY_FIELD } })
  })

  it("GET /api/tickets/[id] gives staff all of it", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(row({ internalPriority: "P1", history: [] }))
    signedIn(STAFF)
    const res = await getOne(body(null), params("t1")) as unknown as Res
    expect((await res.json()).internalPriority).toBe("P1")
    expect((prisma.ticket.findUnique as jest.Mock).mock.calls[0][0].include.history.where).toBeUndefined()
  })

  it("the change-detection probe leaves the same rows out, so the signatures still agree", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue({ ...row(), attachments: [], messages: [], history: [], equipment: [] })
    signedIn(OWNER)
    const req = { nextUrl: { searchParams: new URLSearchParams("rev=x") } } as unknown as NextRequest
    await getOne(req, params("t1"))
    expect((prisma.ticket.findUnique as jest.Mock).mock.calls[0][0].select.history.where).toEqual({ field: { not: PRIORITY_HISTORY_FIELD } })
  })

  it("GET /api/tickets/[id]/history leaves the rows out for the reporter only", async () => {
    ;(prisma.ticket.findUnique as jest.Mock).mockResolvedValue(row())
    signedIn(OWNER)
    await getHistory(body(null), params("t1"))
    expect((prisma.ticketHistory.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ ticketId: "t1", field: { not: PRIORITY_HISTORY_FIELD } })
    signedIn(STAFF)
    await getHistory(body(null), params("t1"))
    expect((prisma.ticketHistory.findMany as jest.Mock).mock.calls[1][0].where).toEqual({ ticketId: "t1" })
  })

  it("GET /api/tickets/all shows it to staff and not to a viewer", async () => {
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([row({ internalPriority: "P4" })])
    signedIn(VIEWER)
    expect((await (await getAll() as unknown as Res).json())[0]).not.toHaveProperty("internalPriority")
    signedIn(ADMIN)
    expect((await (await getAll() as unknown as Res).json())[0].internalPriority).toBe("P4")
  })
})

describe("the SLA per level", () => {
  it("is read by staff only, as the defaults until admins change it", async () => {
    signedIn(null)
    expect((await readPrioritySla() as unknown as Res).status).toBe(401)
    signedIn(OWNER)
    expect((await readPrioritySla() as unknown as Res).status).toBe(403)
    signedIn(STAFF)
    expect(await (await readPrioritySla() as unknown as Res).json()).toEqual({ P1: 4, P2: 8, P3: 48, P4: 96, P5: 240 })
  })

  it("is changed by admins only, to whole hours in range, and logged", async () => {
    const next = { P1: 2, P2: 6, P3: 24, P4: 72, P5: 240 }
    signedIn(STAFF)
    expect((await writePrioritySla(body(next)) as unknown as Res).status).toBe(403)
    signedIn(ADMIN)
    expect((await writePrioritySla(body({ ...next, P1: 0 })) as unknown as Res).status).toBe(400)
    expect((await writePrioritySla(body({ ...next, P5: undefined })) as unknown as Res).status).toBe(400)
    expect(mockStore.size).toBe(0)
    const res = await writePrioritySla(body(next)) as unknown as Res
    expect(await res.json()).toEqual(next)
    expect(mockStore.get("sla.priority.P1")).toBe("2")
    expect((logInfo as jest.Mock).mock.calls[0][0]).toContain("P1 4→2")
  })
})

describe("applyTicketChanges — bulk edits and the API", () => {
  const loaded = (over: Record<string, unknown> = {}) => ({ ...row(), equipment: [], ...over }) as unknown as LoadedTicket
  const actor = { name: "אייל", email: ADMIN.email }

  it("classifies without a mail", async () => {
    const result = await applyTicketChanges({ ticket: loaded(), changes: { internalPriority: "P3" }, actor, staffEmails: ["staff@cristalino.co.il"] })
    expect(result).toEqual({ ok: true, mails: [] })
    expect((prisma.ticket.update as jest.Mock).mock.calls[0][0].data).toEqual({ internalPriority: "P3" })
    expect((prisma.ticketHistory.createMany as jest.Mock).mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({ field: PRIORITY_HISTORY_FIELD, newValue: "P3" }))
  })

  it("refuses something that is not a level", async () => {
    const result = await applyTicketChanges({ ticket: loaded(), changes: { internalPriority: "high" }, actor, staffEmails: [] })
    expect(result.ok).toBe(false)
    expect(prisma.ticket.update).not.toHaveBeenCalled()
  })
})
