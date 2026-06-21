/**
 * __tests__/StaffMembers.test.ts
 *
 * Unit tests for lib/staffMembers.ts — the DB-driven staff roster (v3.27/v3.28).
 *
 * Covers:
 *   - getAllStaffMembers returns exactly the DB isAdmin users (ex-admins drop out)
 *   - curated handle/display from STAFF_MEMBERS is applied when the email matches
 *   - unknown admins get a handle derived from the email local-part + name display
 *   - empty-DB safety net falls back to the hardcoded STAFF_MEMBERS
 *   - parseMentionsFromList matches @handles case-insensitively
 */

jest.mock("@/lib/db", () => ({
  prisma: { user: { findMany: jest.fn() } },
}))
jest.mock("@/lib/staffEmails", () => ({
  STAFF_MEMBERS: [
    { email: "alon@cristalino.co.il",   handle: "alon",   display: "אלון" },
    { email: "daniel.l@cristalino.co.il", handle: "daniel", display: "דניאל" },
  ],
}))

import { getAllStaffMembers, parseMentionsFromList } from "@/lib/staffMembers"
import { prisma } from "@/lib/db"

const findMany = (prisma.user as unknown as { findMany: jest.Mock }).findMany

beforeEach(() => jest.clearAllMocks())

describe("getAllStaffMembers", () => {
  it("returns exactly the DB admins — a curated member who is no longer admin drops out", async () => {
    // daniel is curated but NOT in the admin list → must not appear
    findMany.mockResolvedValue([
      { email: "alon@cristalino.co.il", name: "Alon Kerem" },
    ])
    const roster = await getAllStaffMembers()
    expect(roster.map(m => m.email)).toEqual(["alon@cristalino.co.il"])
    expect(roster.map(m => m.email)).not.toContain("daniel.l@cristalino.co.il")
  })

  it("applies curated handle/display for a matching admin email", async () => {
    findMany.mockResolvedValue([{ email: "alon@cristalino.co.il", name: "Ignored DB Name" }])
    const [m] = await getAllStaffMembers()
    expect(m).toEqual({ email: "alon@cristalino.co.il", handle: "alon", display: "אלון" })
  })

  it("derives handle from email local-part and display from name for unknown admins", async () => {
    findMany.mockResolvedValue([{ email: "aviel.bt@cristalino.co.il", name: "אביאל בן-טוביים" }])
    const [m] = await getAllStaffMembers()
    expect(m.handle).toBe("aviel.bt")
    expect(m.display).toBe("אביאל בן-טוביים")
  })

  it("falls back to email local-part for display when name is null/blank", async () => {
    findMany.mockResolvedValue([{ email: "noname@cristalino.co.il", name: null }])
    const [m] = await getAllStaffMembers()
    expect(m.display).toBe("noname")
  })

  it("falls back to hardcoded STAFF_MEMBERS when the DB has zero admins", async () => {
    findMany.mockResolvedValue([])
    const roster = await getAllStaffMembers()
    expect(roster.map(m => m.email)).toEqual([
      "alon@cristalino.co.il",
      "daniel.l@cristalino.co.il",
    ])
  })
})

describe("parseMentionsFromList", () => {
  const members = [
    { email: "alon@cristalino.co.il", handle: "alon", display: "אלון" },
    { email: "aviel.bt@cristalino.co.il", handle: "aviel.bt", display: "אביאל" },
  ]

  it("returns emails for every handle mentioned, case-insensitively", () => {
    const out = parseMentionsFromList("בוא נבדוק את זה @ALON ואז @aviel.bt", members)
    expect(out).toEqual(["alon@cristalino.co.il", "aviel.bt@cristalino.co.il"])
  })

  it("returns empty array when no handles are mentioned", () => {
    expect(parseMentionsFromList("הערה רגילה בלי הזכרות", members)).toEqual([])
  })

  it("does not match a handle that is not present", () => {
    expect(parseMentionsFromList("@alon בלבד", members)).toEqual(["alon@cristalino.co.il"])
  })
})
