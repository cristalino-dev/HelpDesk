import "@testing-library/jest-dom"
import { render, screen } from "@testing-library/react"
import HelpPage from "@/app/help/page"
import { auth } from "@/auth"
import { STAFF_EMAILS } from "@/lib/staffEmails"

jest.mock("@/auth", () => ({ auth: jest.fn() }))

/** /help is an async server component; resolve it before rendering. */
const renderHelp = async (user: Record<string, unknown> | null = null) => {
  ;(auth as jest.Mock).mockResolvedValue(user ? { user } : null)
  render(await HelpPage())
}

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

// Mock next/link
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

// Mock version
jest.mock("@/lib/version", () => ({ __esModule: true, default: "test" }))

describe("HelpPage", () => {
  it("renders the page title", async () => {
    await renderHelp()
    expect(screen.getByText(/מדריך שימוש במערכת helpdesk/)).toBeInTheDocument()
  })

  it("renders all 5 sections", async () => {
    await renderHelp()
    expect(screen.getAllByText("כניסה למערכת").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/לוח הבקרה/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("פתיחת פנייה חדשה").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("מצבי פנייה").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/רמות דחיפות/).length).toBeGreaterThanOrEqual(1)
  })

  it("renders table of contents links", async () => {
    await renderHelp()
    expect(screen.getByRole("link", { name: "כניסה למערכת" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /פתיחת פנייה/ })).toBeInTheDocument()
  })

  it("renders all status badges", async () => {
    await renderHelp()
    const openBadges = screen.getAllByText("פתוח")
    expect(openBadges.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("בטיפול").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("סגור").length).toBeGreaterThanOrEqual(1)
  })

  it("renders all urgency levels", async () => {
    await renderHelp()
    expect(screen.getAllByText("דחוף").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("גבוה").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("נמוך").length).toBeGreaterThanOrEqual(1)
  })

  it("renders back to dashboard link", async () => {
    await renderHelp()
    expect(screen.getByRole("link", { name: "חזרה ללוח הבקרה" })).toHaveAttribute("href", "/dashboard")
  })

  it("renders the version in the page title", async () => {
    // The version badge moved from the old page header into the hero title
    // when the shared dark AppHeader landed (v3.52).
    await renderHelp()
    expect(screen.getByText(/helpdesk test/)).toBeInTheDocument()
  })
})


describe("the manual is one page now", () => {
  /**
   * /help, /manual and /admin-manual were three pages answering overlapping
   * questions; whether you found the one that answered yours depended on which
   * link you clicked. The other two redirect here, and the support team's half
   * is a section of this page — shown from the session, so a stranger is never
   * sent the markup at all.
   */
  it("always offers a way back to the main screen", async () => {
    await renderHelp()
    expect(screen.getAllByText(/חזרה למסך הראשי/).length).toBeGreaterThanOrEqual(1)
  })

  it("hides the support team's guide from a signed-out visitor", async () => {
    await renderHelp(null)
    expect(screen.queryByText("מדריך מנהל")).not.toBeInTheDocument()
  })

  it("hides it from an ordinary signed-in user", async () => {
    await renderHelp({ email: "someone@cristalino.co.il", isAdmin: false })
    expect(screen.queryByText("מדריך מנהל")).not.toBeInTheDocument()
    expect(screen.queryByText("לצוות התמיכה בלבד")).not.toBeInTheDocument()
  })

  it("shows it to an admin", async () => {
    await renderHelp({ email: "alon@cristalino.co.il", isAdmin: true })
    expect(screen.getByText("מדריך מנהל")).toBeInTheDocument()
    expect(screen.getByText("לצוות התמיכה בלבד")).toBeInTheDocument()
  })

  it("shows it to staff, who its own opening line addresses", async () => {
    await renderHelp({ email: STAFF_EMAILS[0], isAdmin: false })
    expect(screen.getByText("מדריך מנהל")).toBeInTheDocument()
  })

  it("keeps the user guide visible to everyone either way", async () => {
    await renderHelp({ email: "someone@cristalino.co.il", isAdmin: false })
    expect(screen.getByText(/מדריך שימוש במערכת helpdesk/)).toBeInTheDocument()
  })
})
