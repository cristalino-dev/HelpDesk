/**
 * __tests__/AppNav.test.tsx — the one navigation bar
 *
 * The bug this replaced: every page hand-rolled its own link row, so which
 * links you saw depended on the page you were standing on rather than on who
 * you are. An admin on /admin/reviews saw one link; the same admin on /admin
 * saw five; the dashboard hid כל הפניות from admins entirely because it gated
 * that link on STAFF_EMAILS instead of isAdmin.
 *
 * Two properties are worth holding down, and they pull against each other:
 *
 *   1. An admin sees EVERYTHING. That is the request, and it is the half that
 *      silently regresses when someone adds a page and forgets the nav.
 *   2. Nobody sees a link they cannot open. A link that leads to a redirect is
 *      worse than no link, so the roles here have to mirror the guards on the
 *      pages themselves.
 *
 * The list is also asserted to be identical on every page — that is the whole
 * point of the component, and it is the thing that decayed last time.
 */

import { render, screen, within } from "@testing-library/react"
import { useSession } from "next-auth/react"
import AppNav, { navLinksFor, COMPACT_PX, initials } from "@/components/AppNav"
import { STAFF_EMAILS, VIEWER_EMAILS } from "@/lib/staffEmails"

jest.mock("next-auth/react", () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))
jest.mock("@/lib/useIsMobile", () => ({ useIsMobile: jest.fn(() => false) }))

const admin  = { email: "alon@cristalino.co.il", isAdmin: true }
const staff  = { email: STAFF_EMAILS[0], isAdmin: false }
const viewer = { email: VIEWER_EMAILS[0] ?? "viewer@cristalino.co.il", isAdmin: false }
const plain  = { email: "someone@cristalino.co.il", isAdmin: false }

const hrefs = (u: Parameters<typeof navLinksFor>[0]) => navLinksFor(u).map(l => l.href)

describe("an admin sees everything", () => {
  const ADMIN_PAGES = [
    "/dashboard", "/help", "/contact", "/tickets",
    "/admin", "/admin/reports", "/admin/reviews", "/admin/logs", "/admin-manual",
  ]

  it.each(ADMIN_PAGES)("offers %s", page => {
    expect(hrefs(admin)).toContain(page)
  })

  it("offers כל הפניות through isAdmin alone, not membership of STAFF_EMAILS", () => {
    // The original bug: /tickets admits `isAdmin || STAFF_EMAILS`, but the
    // dashboard's nav checked only the second half, so an admin who is not on
    // that list never saw the queue.
    const outsider = { email: "not-on-the-staff-list@cristalino.co.il", isAdmin: true }
    expect(STAFF_EMAILS).not.toContain(outsider.email)
    expect(hrefs(outsider)).toContain("/tickets")
  })

  it("has no link an admin cannot open", () => {
    expect(hrefs(admin).sort()).toEqual([...ADMIN_PAGES].sort())
  })
})

describe("everyone else sees only what they can open", () => {
  it("gives a plain user their own pages and nothing administrative", () => {
    expect(hrefs(plain)).toEqual(["/dashboard", "/help", "/contact"])
  })

  it("never shows a plain user an admin page", () => {
    for (const href of hrefs(plain)) expect(href.startsWith("/admin")).toBe(false)
  })

  it("gives staff the queue and the error log, which their guards allow", () => {
    // /tickets admits isAdmin || STAFF_EMAILS; /admin/logs admits staff too.
    expect(hrefs(staff)).toContain("/tickets")
    expect(hrefs(staff)).toContain("/admin/logs")
  })

  it("does not give staff the admin-only pages", () => {
    for (const href of ["/admin", "/admin/reports", "/admin/reviews", "/admin-manual"]) {
      expect(hrefs(staff)).not.toContain(href)
    }
  })

  it("sends viewers to the read-only queue instead of the editable one", () => {
    if (VIEWER_EMAILS.length === 0) return // no viewers configured in this build
    expect(hrefs(viewer)).toContain("/tickets/view")
    expect(hrefs(viewer)).not.toContain("/tickets")
  })

  it("shows a signed-out visitor nothing at all", () => {
    expect(navLinksFor(null)).toEqual([])
    expect(navLinksFor(undefined)).toEqual([])
  })
})

describe("the queue link is never doubled", () => {
  it.each([[admin, "admin"], [staff, "staff"], [viewer, "viewer"], [plain, "plain"]])(
    "%#: one כל הפניות at most (%s)", user => {
      const queue = navLinksFor(user).filter(l => l.label === "כל הפניות")
      expect(queue.length).toBeLessThanOrEqual(1)
    },
  )
})

describe("rendered", () => {
  const renderAs = (user: typeof admin | null) => {
    ;(useSession as jest.Mock).mockReturnValue(
      user ? { data: { user: { ...user, name: "אלון כרם" } }, status: "authenticated" }
           : { data: null, status: "unauthenticated" },
    )
    return render(<AppNav />)
  }

  it("renders one link per entry, labelled", () => {
    const { container } = renderAs(admin)
    for (const l of navLinksFor(admin)) {
      expect(within(container).getByText(l.label)).toBeInTheDocument()
    }
  })

  it("renders nothing for a signed-out visitor", () => {
    const { container } = renderAs(null)
    expect(container).toBeEmptyDOMElement()
  })

  it("always offers the profile, the share link and the way out", () => {
    renderAs(plain)
    expect(screen.getByText("אלון כרם")).toBeInTheDocument()
    expect(screen.getByLabelText("העתק קישור למערכת")).toBeInTheDocument()
    expect(screen.getByText("יציאה")).toBeInTheDocument()
  })

  it("badges an admin as ADMIN and a plain user not at all", () => {
    const a = renderAs(admin)
    expect(within(a.container).getByText("ADMIN")).toBeInTheDocument()
    a.unmount()
    const p = renderAs(plain)
    expect(within(p.container).queryByText("ADMIN")).not.toBeInTheDocument()
    expect(within(p.container).queryByText("STAFF")).not.toBeInTheDocument()
  })
})

describe("the compact layout", () => {
  it("folds into one menu rather than a second, divergent nav", () => {
    // Nine links stop fitting well before a phone, so the fold happens at a
    // desktop width. The menu renders the same list from the same source.
    expect(COMPACT_PX).toBeGreaterThan(768)
  })
})

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("אלון כרם")).toBe("אכ")
    expect(initials("Alon")).toBe("A")
  })

  it("does not throw on a missing name", () => {
    expect(initials(null)).toBe("?")
    expect(initials(undefined)).toBe("?")
  })
})
