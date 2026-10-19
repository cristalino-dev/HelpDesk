/**
 * @jest-environment node
 */
/**
 * __tests__/userEmails.test.ts — secondary addresses and the merge (v3.101)
 *
 * The failure this exists to prevent: one person reaching us from two
 * mailboxes becomes two User rows, and the tickets they filed by mail are
 * invisible on the dashboard they sign in to. REQ-862 was somebody reporting
 * exactly that about their own 24 tickets.
 *
 * So what is pinned here is the resolution order — a real account is never
 * shadowed by somebody's alias — and the merge leaving nothing behind.
 */

import { findUserByEmail, mergeUserInto, mergePreview, normalizeEmail } from "@/lib/users"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    user:              { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    userEmail:         { findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    ticket:            { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    ticketParticipant: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

const YANIV = { id: "u-cris", email: "yaniv.p@cristalino.co.il", name: "Yaniv Perry" }

beforeEach(() => jest.clearAllMocks())

describe("resolving an address", () => {
  it("finds the person by their own address, without looking at aliases", async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(YANIV)
    expect(await findUserByEmail("Yaniv.P@Cristalino.co.il")).toEqual(YANIV)
    expect(prisma.userEmail.findFirst).not.toHaveBeenCalled()
  })

  // The whole point: mail from the other mailbox lands on the same person.
  it("finds them by a secondary address when no account carries it", async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.userEmail.findFirst as jest.Mock).mockResolvedValue({ user: YANIV })
    expect(await findUserByEmail("yanivp@mly.co.il")).toEqual(YANIV)
  })

  // An alias must never be able to take over somebody's real account, however
  // it got typed in: the primary lookup runs first and wins.
  it("lets a real account outrank an alias claiming the same address", async () => {
    const realOwner = { id: "u-other", email: "shared@cristalino.co.il" }
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(realOwner)
    ;(prisma.userEmail.findFirst as jest.Mock).mockResolvedValue({ user: YANIV })
    expect(await findUserByEmail("shared@cristalino.co.il")).toEqual(realOwner)
  })

  it("is null for an address nobody holds, and for an empty one", async () => {
    ;(prisma.user.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.userEmail.findFirst as jest.Mock).mockResolvedValue(null)
    expect(await findUserByEmail("nobody@x.com")).toBeNull()
    expect(await findUserByEmail("   ")).toBeNull()
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com")
  })
})

describe("counting before merging", () => {
  it("reports what would move, and moves nothing", async () => {
    ;(prisma.ticket.count as jest.Mock).mockResolvedValue(24)
    ;(prisma.ticketParticipant.count as jest.Mock).mockResolvedValue(2)
    ;(prisma.userEmail.count as jest.Mock).mockResolvedValue(0)
    expect(await mergePreview("u-mly")).toEqual({ tickets: 24, following: 2, aliases: 0 })
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled()
    expect(prisma.user.delete).not.toHaveBeenCalled()
  })
})

describe("folding one row into another", () => {
  const tx = {
    user:              { findUnique: jest.fn(), delete: jest.fn() },
    userEmail:         { count: jest.fn(async () => 0), create: jest.fn(), updateMany: jest.fn() },
    ticket:            { count: jest.fn(async () => 24), findMany: jest.fn(async () => [{ id: "t1" }]), updateMany: jest.fn() },
    ticketParticipant: { count: jest.fn(async () => 1), findMany: jest.fn(async () => [{ ticketId: "t9" }]), updateMany: jest.fn(), deleteMany: jest.fn() },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    tx.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "u-mly" ? { id: "u-mly", email: "yanivp@mly.co.il" } : YANIV)
    ;(prisma.$transaction as jest.Mock).mockImplementation(fn => fn(tx))
  })

  it("moves the tickets, deletes the row, and keeps the address as an alias", async () => {
    const plan = await mergeUserInto("u-mly", "u-cris", "alon@cristalino.co.il")

    expect(plan).toEqual({ tickets: 24, following: 1, aliases: 0 })
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({ where: { userId: "u-mly" }, data: { userId: "u-cris" } })
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "u-mly" } })
    expect(tx.userEmail.create).toHaveBeenCalledWith({
      data: { email: "yanivp@mly.co.il", userId: "u-cris", addedBy: "alon@cristalino.co.il" },
    })
  })

  // TicketParticipant is unique on (ticketId, userId): a ticket both rows
  // follow would collide on the way across, and one the survivor now OWNS has
  // no business also listing them as a follower.
  it("clears the follow rows that would collide, both directions", async () => {
    await mergeUserInto("u-mly", "u-cris", "alon@cristalino.co.il")
    expect(tx.ticketParticipant.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u-mly", ticketId: { in: ["t9"] } },
    })
    expect(tx.ticketParticipant.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u-cris", ticketId: { in: ["t1"] } },
    })
  })

  it("refuses to merge a row into itself", async () => {
    await expect(mergeUserInto("u-cris", "u-cris", "alon@cristalino.co.il")).rejects.toThrow(/itself/)
  })

  it("refuses when either row is gone", async () => {
    tx.user.findUnique.mockResolvedValue(null)
    await expect(mergeUserInto("u-mly", "u-cris", "alon@cristalino.co.il")).rejects.toThrow(/must exist/)
    expect(tx.user.delete).not.toHaveBeenCalled()
  })
})
