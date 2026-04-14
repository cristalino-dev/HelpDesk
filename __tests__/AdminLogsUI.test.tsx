import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import AdminLogsPage from "@/app/admin/logs/page"

// Mock NextAuth using the common pattern that works with next/jest
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}))

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock fetch
global.fetch = jest.fn()

const mockLogs = [
  {
    id: "1",
    timestamp: new Date().toISOString(),
    level: "error",
    message: "Test Error Message",
    source: "/api/test",
    stack: "Error: Test\n at logic.js:10:5",
    date: "2026-04-14"
  },
  {
    id: "2",
    timestamp: new Date().toISOString(),
    level: "warn",
    message: "Test Warning Message",
    source: "client-side",
    stack: null,
    date: "2026-04-14"
  }
]

describe("AdminLogsPage Component", () => {
  const { useSession } = require("next-auth/react")
  const { useRouter } = require("next/navigation")

  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockLogs,
    })
  })

  it("renders logs and statistics when authenticated as admin", async () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: "Admin User", email: "admin@cristalino.co.il", isAdmin: true } },
      status: "authenticated",
    })

    render(<AdminLogsPage />)

    await waitFor(() => {
      expect(screen.getByText("Test Error Message")).toBeInTheDocument()
      expect(screen.getByText("Test Warning Message")).toBeInTheDocument()
    })

    // Check stats
    expect(screen.getByText("2")).toBeInTheDocument() // Total events
    expect(screen.getAllByText("1")).toHaveLength(2) // 1 Error, 1 Warning
  })

  it("filters logs based on search input", async () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: "Admin User", email: "admin@cristalino.co.il", isAdmin: true } },
      status: "authenticated",
    })

    render(<AdminLogsPage />)

    await waitFor(() => screen.getByText("Test Error Message"))

    const searchInput = screen.getByPlaceholderText(/חפש בהודעת השגיאה/i)
    fireEvent.change(searchInput, { target: { value: "Warning" } })

    expect(screen.getByText("Test Warning Message")).toBeInTheDocument()
    expect(screen.queryByText("Test Error Message")).not.toBeInTheDocument()
  })
})
