import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import TicketForm from "@/components/TicketForm"
import { SessionProvider } from "next-auth/react"

// Mock fetch
const mockFetch = jest.fn()
window.fetch = mockFetch

// Mock Session
const mockSession = {
  user: {
    id: "user-123",
    email: "test@cristalino.co.il",
    name: "Test User",
    isAdmin: false,
  },
  expires: "2026-04-13T23:59:59.000Z",
}

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSession: () => ({ data: mockSession, status: "authenticated" }),
}))

describe("v2.0 Inclusion/Integration Test", () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-ticket-123" }),
    })
  })

  it("handles a full ticket submission lifecycle successfully", async () => {
    render(<TicketForm onSuccess={jest.fn()} />)

    // Fill the form
    fireEvent.change(screen.getByPlaceholderText(/תאר בקצרה/), { target: { value: "בעיה דחופה בקומה" } })
    fireEvent.change(screen.getByPlaceholderText(/PC-ALON-01/), { target: { value: "PC-TECH-01" } })
    fireEvent.change(screen.getByPlaceholderText(/050-0000000/), { target: { value: "052-1234567" } })
    
    // Select Platform (v2.0 focal point)
    const platformSelect = screen.getByLabelText(/פלטפורמה/)
    fireEvent.change(platformSelect, { target: { value: "comax" } })

    const categorySelect = screen.getByLabelText(/קטגוריה/)
    fireEvent.change(categorySelect, { target: { value: "תוכנה" } })

    const urgencySelect = screen.getByLabelText(/דחיפות/)
    fireEvent.change(urgencySelect, { target: { value: "גבוה" } })

    fireEvent.change(screen.getByLabelText(/תיאור מפורט/), { target: { value: "לא מצליח להתחבר למערכת קומקס מהמחשב האישי שלי" } })

    // Submit
    const submitBtn = screen.getByRole("button", { name: /שלח פנייה/ })
    fireEvent.click(submitBtn)

    // Verify API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/tickets", expect.objectContaining({
        method: "POST",
      }))
    })

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody).toEqual(expect.objectContaining({
      subject: "בעיה דחופה בקומה",
      computerName: "PC-TECH-01",
      phone: "052-1234567",
      platform: "comax",
      category: "תוכנה",
      urgency: "גבוה",
      description: "לא מצליח להתחבר למערכת קומקס מהמחשב האישי שלי"
    }))
  })
})
