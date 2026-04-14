import "@testing-library/jest-dom"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ProfilePage from "@/app/profile/page"

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "ישראל ישראלי", email: "israel@cristalino.co.il", isAdmin: false, id: "u1" } },
    status: "authenticated",
    update: jest.fn(),
  }),
  signOut: jest.fn(),
}))

// Mock next/navigation
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }))

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

// Mock version
jest.mock("@/lib/version", () => ({ __esModule: true, default: "test" }))

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ name: "ישראל ישראלי", phone: "050-1234567", station: "PC-TEST-01" }),
  } as Response)
})

/**
 * ProfilePage.test.tsx
 * 
 * Verifies the user profile editing experience.
 * Checks for default value loading and successful status updates via API.
 */

describe("ProfilePage", () => {
  /**
   * ARRANGE: Session state setup
   * ACT: Component render
   * ASSERT: Check for title presence.
   */
  it("renders the page heading", async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText("הגדרות חשבון")).toBeInTheDocument())
  })

  /**
   * ARRANGE: Mocked API response
   * ACT: Component render
   * ASSERT: Verify all form labels are present.
   */
  it("renders all form fields", async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText("שם פרטי")).toBeInTheDocument())
    expect(screen.getByText("שם משפחה")).toBeInTheDocument()
    expect(screen.getByText("טלפון")).toBeInTheDocument()
    expect(screen.getByText("שם מחשב / תחנת עבודה")).toBeInTheDocument()
    expect(screen.getByText("כתובת אימייל")).toBeInTheDocument()
  })

  it("pre-fills data from API", async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByDisplayValue("050-1234567")).toBeInTheDocument())
    expect(screen.getByDisplayValue("PC-TEST-01")).toBeInTheDocument()
  })

  it("email field is read-only", async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByDisplayValue("israel@cristalino.co.il")).toBeDisabled())
  })

  it("shows save button", async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByRole("button", { name: "שמור פרטים" })).toBeInTheDocument())
  })

  it("calls PATCH on submit", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: "ישראל ישראלי", phone: "050-1234567", station: "PC-TEST-01" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)

    render(<ProfilePage />)
    const user = userEvent.setup()
    await waitFor(() => screen.getByRole("button", { name: "שמור פרטים" }))
    await user.click(screen.getByRole("button", { name: "שמור פרטים" }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/profile", expect.objectContaining({ method: "PATCH" })))
  })
})
