/**
 * __tests__/AuthSession.test.ts — the session callback in auth.ts
 *
 * auth.ts was the last place that resolved a User from an email without going
 * through lib/users.ts: it wrote whatever Google returned, capitals and all,
 * which is the row that a normalised lookup elsewhere then missed (v3.65,
 * rule 45). v3.66 routes it through `resolveUserByEmail` and writes the STORED
 * address back onto the session.
 *
 * That second half is the load-bearing part. Some thirty places in the app
 * match `session.user.email` against a stored email exactly — ticket
 * ownership, message authorship, the self-notification filter, STAFF_EMAILS.
 * Normalising the row while leaving the session on Google's casing would lock
 * a user out of their own ticket. The invariant these tests pin down:
 *
 *   session.user.email is the address as the database stores it.
 *
 * The tests drive the REAL callback — auth.ts is imported and the config it
 * hands to NextAuth is captured — rather than restating what it ought to do.
 */

// The prisma mock deliberately exposes ONLY findFirst and upsert, the two
// methods lib/users.ts uses. A regression back to a direct
// `prisma.user.findUnique(...)` / `.create(...)` in auth.ts fails loudly here
// instead of quietly reintroducing the bug.
jest.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: jest.fn(), upsert: jest.fn() } },
}))

jest.mock("next-auth/providers/google", () => ({
  __esModule: true,
  default: { id: "google" },
}))

jest.mock("next-auth", () => ({
  __esModule: true,
  default: (config: unknown) => {
    ;(globalThis as Record<string, unknown>).__capturedAuthConfig = config
    return { handlers: {}, signIn: jest.fn(), signOut: jest.fn(), auth: jest.fn() }
  },
}))

import { prisma } from "@/lib/db"
const db = prisma.user as unknown as { findFirst: jest.Mock; upsert: jest.Mock }

type SessionUser = { email?: string | null; name?: string | null; image?: string | null; isAdmin?: boolean; id?: string }
type SessionCallback = (args: { session: { user?: SessionUser } }) => Promise<{ user?: SessionUser }>

/** Import auth.ts for real and hand back the session callback it registered. */
function sessionCallback(): SessionCallback {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/auth")
  const config = (globalThis as Record<string, unknown>).__capturedAuthConfig as {
    callbacks: { session: SessionCallback }
  }
  return config.callbacks.session
}

const STORED = {
  id: "u-dana",
  email: "dana@cristalino.co.il",
  name: "דנה לוי",
  image: "https://lh3.example/dana.jpg",
  isAdmin: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  db.findFirst.mockResolvedValue(null)
  db.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) =>
    ({ id: "u-new", isAdmin: false, ...create }))
})

describe("auth.ts session callback", () => {
  it("finds the existing row when Google sends a differently-cased address", async () => {
    db.findFirst.mockResolvedValue(STORED)

    await sessionCallback()({ session: { user: { email: "Dana@Cristalino.CO.IL", name: "Dana" } } })

    expect(db.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "dana@cristalino.co.il", mode: "insensitive" } },
    })
    // The whole point: no second account for the same person.
    expect(db.upsert).not.toHaveBeenCalled()
  })

  // The invariant. Google's casing must not survive onto the session, because
  // every ownership check compares it to a stored email.
  it("puts the stored address on the session, not the one Google sent", async () => {
    db.findFirst.mockResolvedValue(STORED)

    const session = await sessionCallback()({
      session: { user: { email: "Dana@Cristalino.CO.IL", name: "Dana" } },
    })

    expect(session.user!.email).toBe("dana@cristalino.co.il")
  })

  it("creates a normalised row on a first-ever sign-in", async () => {
    const session = await sessionCallback()({
      session: { user: { email: "New.Hire@Cristalino.co.il", name: "עובד חדש", image: "https://lh3.example/n.jpg" } },
    })

    expect(db.upsert).toHaveBeenCalledWith({
      where:  { email: "new.hire@cristalino.co.il" },
      create: { email: "new.hire@cristalino.co.il", name: "עובד חדש", image: "https://lh3.example/n.jpg" },
      update: {},
    })
    expect(session.user!.email).toBe("new.hire@cristalino.co.il")
  })

  it("attaches id and isAdmin from the database row", async () => {
    db.findFirst.mockResolvedValue({ ...STORED, isAdmin: true })

    const session = await sessionCallback()({
      session: { user: { email: "dana@cristalino.co.il", isAdmin: false } },
    })

    expect(session.user!.id).toBe("u-dana")
    expect(session.user!.isAdmin).toBe(true)
  })

  // An existing user who has since edited their profile must not be renamed
  // back to whatever Google currently calls them on every page load.
  it("does not rewrite the name or photo of a user who already exists", async () => {
    db.findFirst.mockResolvedValue(STORED)

    await sessionCallback()({
      session: { user: { email: "dana@cristalino.co.il", name: "Dana L.", image: "https://lh3.example/other.jpg" } },
    })

    expect(db.upsert).not.toHaveBeenCalled()
  })

  it("leaves a session with no email alone and touches no database", async () => {
    const session = await sessionCallback()({ session: { user: {} } })

    expect(session.user!.email).toBeUndefined()
    expect(db.findFirst).not.toHaveBeenCalled()
    expect(db.upsert).not.toHaveBeenCalled()
  })
})
