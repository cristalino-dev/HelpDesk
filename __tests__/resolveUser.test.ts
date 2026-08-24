/**
 * __tests__/resolveUser.test.ts — lib/users.ts
 *
 * The duplicate-account bug, in one place.
 *
 * `auth.ts` writes the User row with Google's address verbatim, so it can
 * carry capitals. Every other entry point lowercases the address it was handed
 * — the on-behalf picker, an inbound From: header — and then matched exactly.
 * The miss was not a 404: it was an `upsert` whose `where` found nothing, so
 * it INSERTED. One person, two rows, tickets split between them, and only one
 * of the two is the account they can actually sign in to.
 *
 * These tests are about the insert that must not happen.
 */

import { findUserByEmail, resolveUserByEmail, normalizeEmail } from "@/lib/users"

jest.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: jest.fn(), upsert: jest.fn() } },
}))

import { prisma } from "@/lib/db"
const db = prisma.user as unknown as { findFirst: jest.Mock; upsert: jest.Mock }

const EXISTING = { id: "u1", email: "Dana@Cristalino.co.il", name: "דנה לוי" }

beforeEach(() => {
  jest.clearAllMocks()
  db.findFirst.mockResolvedValue(null)
  db.upsert.mockImplementation(async ({ create }: { create: { email: string; name: string | null } }) =>
    ({ id: "new-id", ...create }))
})

describe("normalizeEmail", () => {
  it("trims and lowercases — this is the stored form", () => {
    expect(normalizeEmail("  Dana@Cristalino.CO.IL ")).toBe("dana@cristalino.co.il")
  })
})

describe("findUserByEmail", () => {
  it("asks the database to ignore case", async () => {
    await findUserByEmail("Dana@Cristalino.co.il")

    expect(db.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "dana@cristalino.co.il", mode: "insensitive" } },
    })
  })

  it("does not go to the database for an empty address", async () => {
    expect(await findUserByEmail("   ")).toBeNull()
    expect(db.findFirst).not.toHaveBeenCalled()
  })
})

describe("resolveUserByEmail", () => {
  // The whole point of the module.
  it("returns the existing row for a differently-cased address, creating nothing", async () => {
    db.findFirst.mockResolvedValue(EXISTING)

    const user = await resolveUserByEmail("dana@cristalino.co.il", "דנה")

    expect(user).toEqual(EXISTING)
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it("creates a normalised row when the address is genuinely new", async () => {
    const user = await resolveUserByEmail("  New.Hire@Cristalino.co.il ", "  עובד חדש  ")

    expect(db.upsert).toHaveBeenCalledWith({
      where:  { email: "new.hire@cristalino.co.il" },
      create: { email: "new.hire@cristalino.co.il", name: "עובד חדש", image: null },
      update: {},
    })
    expect(user.email).toBe("new.hire@cristalino.co.il")
  })

  // Only auth.ts has a photo to pass; everybody else calls with two arguments
  // and must keep getting a row, not a TypeScript error or a stray undefined.
  it("stores the profile photo when one is supplied", async () => {
    await resolveUserByEmail("dana@cristalino.co.il", "דנה", "https://lh3.example/photo.jpg")

    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ image: "https://lh3.example/photo.jpg" }),
      })
    )
  })

  it("never overwrites the photo or the name on a row that already exists", async () => {
    db.findFirst.mockResolvedValue(EXISTING)

    await resolveUserByEmail("dana@cristalino.co.il", "New Name", "https://lh3.example/new.jpg")

    expect(db.upsert).not.toHaveBeenCalled()
  })

  // Two requests naming the same brand-new address at once must not make one
  // of them throw P2002 at the caller.
  it("creates through upsert, not create, so a concurrent insert is harmless", async () => {
    await resolveUserByEmail("new@cristalino.co.il")

    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }))
  })

  // v3.66 added UNIQUE (lower(email)) alongside the plain unique on email.
  // Because the address is normalised BEFORE the upsert, two racers insert the
  // identical string and collide on `User_email_key` — the constraint upsert
  // absorbs. Upserting the raw address would collide on the new functional
  // index instead, which upsert does not target, and the loser would throw
  // P2002 at the caller. The `where` and the `create` must carry the same
  // normalised value.
  it("targets the exact-email constraint, not the case-insensitive index", async () => {
    await resolveUserByEmail("Racy@Cristalino.co.il")

    const call = db.upsert.mock.calls[0][0]
    expect(call.where.email).toBe("racy@cristalino.co.il")
    expect(call.create.email).toBe(call.where.email)
  })

  it("never renames somebody who already exists", async () => {
    db.findFirst.mockResolvedValue(EXISTING)

    const user = await resolveUserByEmail("dana@cristalino.co.il", "Whatever The Mail Header Said")

    // Their own profile edit outranks a mail header or a typed-in form field.
    expect(user.name).toBe("דנה לוי")
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it("stores no name rather than an empty one", async () => {
    await resolveUserByEmail("nameless@cristalino.co.il", "   ")

    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ name: null }) })
    )
  })
})
