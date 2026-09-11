/**
 * __tests__/RootRedirect.test.ts — app/page.tsx, the "/" redirect
 *
 * `/` has no content; it only decides where to send you. It used to check
 * `if (!session)` and then read `session.user.isAdmin`. But when auth is
 * misconfigured — a dev server started without .env.local, so no AUTH_SECRET —
 * `auth()` returns a truthy object with no `user`, and the page crashed with
 * "Cannot read properties of undefined (reading 'isAdmin')" instead of sending
 * the visitor to /login. Reported from localhost, 2026-09-10.
 */

import Home from "@/app/page"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

jest.mock("@/auth", () => ({ auth: jest.fn() }))

// The real redirect() throws to stop rendering, so this one must too — else
// the code after a redirect would run and the test would see the wrong target.
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url })
  }),
}))

const sessionIs = (s: unknown) => (auth as jest.Mock).mockResolvedValue(s)

/** Where Home() sent us, or a failure if it rendered or threw anything else. */
const destination = () =>
  Home().then(
    () => { throw new Error("rendered instead of redirecting") },
    (e: { url?: string; message?: string }) => e.url ?? `threw: ${e.message}`,
  )

beforeEach(() => jest.clearAllMocks())

it("sends a visitor with no session to /login", async () => {
  sessionIs(null)
  expect(await destination()).toBe("/login")
})

it("sends a session with no user to /login instead of crashing — the reported bug", async () => {
  sessionIs({})
  expect(await destination()).toBe("/login")
})

it("treats an auth error object the same way", async () => {
  sessionIs({ message: "There was a problem with the server configuration." })
  expect(await destination()).toBe("/login")
})

it("sends an admin to /admin", async () => {
  sessionIs({ user: { email: "a@cristalino.co.il", isAdmin: true } })
  expect(await destination()).toBe("/admin")
})

it("sends everyone else to /dashboard, and redirects exactly once", async () => {
  sessionIs({ user: { email: "w@cristalino.co.il", isAdmin: false } })
  expect(await destination()).toBe("/dashboard")
  expect(redirect).toHaveBeenCalledTimes(1)
})
