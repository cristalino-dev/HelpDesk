/**
 * __tests__/AdminManualGuard.test.tsx — the old manual routes
 *
 * /admin-manual and /manual are redirects now. The support team's guide is a
 * section of /help (rendered from the session — see HelpPage.test.tsx), and the
 * second user manual that lived at /manual said much the same as /help in a
 * different layout.
 *
 * These routes stay alive because they are bookmarked, printed and linked from
 * old emails, and a dead link is worse than a redirect. That is what is pinned
 * here: they must keep resolving, and to the right place.
 *
 * The access check that used to live here moved with the content. It is now in
 * HelpPage.test.tsx, and it is a stronger one: /help never renders the markup
 * for a reader who may not see it, rather than guarding a whole page.
 */

import { redirect } from "next/navigation"
import AdminManualPage from "@/app/admin-manual/page"
import ManualPage from "@/app/manual/page"

jest.mock("next/navigation", () => ({
  // The real redirect() throws to unwind rendering; mirroring that is what
  // proves the page returns no markup of its own.
  redirect: jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

beforeEach(() => jest.clearAllMocks())

describe("the old manual routes still resolve", () => {
  it("sends /admin-manual to the support-team section of /help", () => {
    expect(() => AdminManualPage()).toThrow("REDIRECT:/help#admin")
    expect(redirect).toHaveBeenCalledWith("/help#admin")
  })

  it("sends /manual to /help", () => {
    expect(() => ManualPage()).toThrow("REDIRECT:/help")
    expect(redirect).toHaveBeenCalledWith("/help")
  })

  it("renders nothing of their own — the redirect is the whole page", () => {
    // If either ever returned markup instead, it would be a third copy of the
    // manual drifting quietly out of date, which is the thing being fixed.
    expect(() => AdminManualPage()).toThrow()
    expect(() => ManualPage()).toThrow()
  })

  it("lands somewhere inside /help, never at a dead URL", () => {
    for (const page of [AdminManualPage, ManualPage]) {
      try { page() } catch { /* expected */ }
    }
    for (const call of (redirect as unknown as jest.Mock).mock.calls) {
      expect(String(call[0]).startsWith("/help")).toBe(true)
    }
  })
})
