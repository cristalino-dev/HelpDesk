import "@testing-library/jest-dom"
import { render, screen } from "@testing-library/react"
import HelpPage from "@/app/help/page"

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
  it("renders the page title", () => {
    render(<HelpPage />)
    expect(screen.getByText("מדריך שימוש במערכת helpdesk")).toBeInTheDocument()
  })

  it("renders all 5 sections", () => {
    render(<HelpPage />)
    expect(screen.getAllByText("כניסה למערכת").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/לוח הבקרה/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("פתיחת פנייה חדשה").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("מצבי פנייה").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/רמות דחיפות/).length).toBeGreaterThanOrEqual(1)
  })

  it("renders table of contents links", () => {
    render(<HelpPage />)
    expect(screen.getByRole("link", { name: "כניסה למערכת" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /פתיחת פנייה/ })).toBeInTheDocument()
  })

  it("renders all status badges", () => {
    render(<HelpPage />)
    const openBadges = screen.getAllByText("פתוח")
    expect(openBadges.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("בטיפול").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("סגור").length).toBeGreaterThanOrEqual(1)
  })

  it("renders all urgency levels", () => {
    render(<HelpPage />)
    expect(screen.getAllByText("דחוף").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("גבוה").length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText("נמוך").length).toBeGreaterThanOrEqual(1)
  })

  it("renders back to dashboard link", () => {
    render(<HelpPage />)
    expect(screen.getByRole("link", { name: "חזרה ללוח הבקרה" })).toHaveAttribute("href", "/dashboard")
  })

  it("renders version footer", () => {
    render(<HelpPage />)
    expect(screen.getByText(/vtest/)).toBeInTheDocument()
  })
})
