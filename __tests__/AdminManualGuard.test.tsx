/**
 * __tests__/AdminManualGuard.test.tsx — access to the support manual
 *
 * /admin-manual was the one page in the app with no guard at all. Every other
 * admin page redirects a stranger; this one rendered for anybody who knew the
 * URL — and what it renders is a detailed tour of the admin panel: which tabs
 * exist, what each does, which endpoints back them. Its own badge says
 * "Staff Only".
 *
 * The guard is server-side (auth() + redirect(), following app/page.tsx)
 * rather than the client-side useEffect the other admin pages use, so the
 * decision is made before any HTML is sent and there is no flash of content
 * the visitor should not see. That difference is worth a test of its own:
 * a client-side redirect still put the page in the DOM first.
 */

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import AdminManualPage from "@/app/admin-manual/page"
import { STAFF_EMAILS } from "@/lib/staffEmails"

jest.mock("@/auth", () => ({ auth: jest.fn() }))
jest.mock("next/navigation", () => ({
  // The real redirect() throws to unwind rendering; mirroring that here is
  // what lets the test assert the page never returns markup to a stranger.
  redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

const render = () => AdminManualPage()
const signedIn = (user: Record<string, unknown>) => (auth as jest.Mock).mockResolvedValue({ user })

beforeEach(() => jest.clearAllMocks())

describe("who may read the support manual", () => {
  it("sends a signed-out visitor to the login page", async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    await expect(render()).rejects.toThrow("REDIRECT:/login")
    expect(redirect).toHaveBeenCalledWith("/login")
  })

  it("sends a signed-in non-staff user away, rather than showing them the admin panel's map", async () => {
    signedIn({ email: "someone@cristalino.co.il", isAdmin: false })
    await expect(render()).rejects.toThrow("REDIRECT:/dashboard")
  })

  it("lets an admin in", async () => {
    signedIn({ email: "alon@cristalino.co.il", isAdmin: true })
    await expect(render()).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("lets staff in — the manual is addressed to the support team", async () => {
    signedIn({ email: STAFF_EMAILS[0], isAdmin: false })
    await expect(render()).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("does not fall over when the session carries no email", async () => {
    signedIn({ isAdmin: false })
    await expect(render()).rejects.toThrow("REDIRECT:/dashboard")
  })

  it("returns no markup at all to a visitor it turns away", async () => {
    // The point of guarding on the server: a client-side redirect would have
    // rendered this first and then navigated.
    ;(auth as jest.Mock).mockResolvedValue(null)
    await expect(render()).rejects.toThrow()
  })
})
