import "@testing-library/jest-dom"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TicketForm from "@/components/TicketForm"

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

describe("TicketForm", () => {
  it("renders all required fields", () => {
    render(<TicketForm onSuccess={jest.fn()} />)

    expect(screen.getByText("נושא הפנייה *")).toBeInTheDocument()
    expect(screen.getByText("שם מחשב *")).toBeInTheDocument()
    expect(screen.getByText("טלפון *")).toBeInTheDocument()
    expect(screen.getByText("קטגוריה")).toBeInTheDocument()
    expect(screen.getByText("פלטפורמה")).toBeInTheDocument()
    expect(screen.getByText("דחיפות")).toBeInTheDocument()
    expect(screen.getByText("תיאור מפורט *")).toBeInTheDocument()
  })

  it("renders submit button", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("button", { name: "שלח פנייה" })).toBeInTheDocument()
  })

  it("has correct default urgency (בינוני)", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const urgencySelect = screen.getByDisplayValue("בינוני")
    expect(urgencySelect).toBeInTheDocument()
  })

  it("has correct default category (אחר)", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const categorySelect = screen.getByDisplayValue("אחר")
    expect(categorySelect).toBeInTheDocument()
  })

  it("has correct default platform (מחשב אישי)", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const platformSelect = screen.getByDisplayValue("מחשב אישי")
    expect(platformSelect).toBeInTheDocument()
  })

  it("renders all urgency options", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("option", { name: "נמוך" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "בינוני" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "גבוה" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "דחוף" })).toBeInTheDocument()
  })

  it("renders all category options", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("option", { name: "חומרה" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "תוכנה" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "רשת" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "מדפסת" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "אחר" })).toBeInTheDocument()
  })

  it("renders all platform options", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("option", { name: "comax" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "comax sales tracker" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "אנדרואיד" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "אייפד" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "מחשב אישי" })).toBeInTheDocument()
  })

  it("shows tooltip when hovering over ? button", async () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const tooltipButton = screen.getByRole("button", { name: "כיצד למצוא שם מחשב" })
    fireEvent.mouseEnter(tooltipButton)
    expect(screen.getByText("כיצד למצוא שם מחשב?")).toBeInTheDocument()
    fireEvent.mouseLeave(tooltipButton)
    expect(screen.queryByText("כיצד למצוא שם מחשב?")).not.toBeInTheDocument()
  })

  it("pre-populates phone and station from defaults", () => {
    render(<TicketForm onSuccess={jest.fn()} defaultPhone="050-1234567" defaultStation="PC-TEST-01" />)
    expect(screen.getByPlaceholderText("050-0000000")).toHaveValue("050-1234567")
    expect(screen.getByPlaceholderText("לדוגמה: PC-ALON-01")).toHaveValue("PC-TEST-01")
  })

  it("shows loading state while submitting", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})) // never resolves

    render(<TicketForm onSuccess={jest.fn()} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "בעיה בהדפסה")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-TEST-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-1234567")
    await user.type(screen.getByPlaceholderText("פרט את הבעיה בצורה מלאה..."), "המדפסת לא מגיבה")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    expect(screen.getByRole("button", { name: "שולח..." })).toBeDisabled()
  })

  it("calls onSuccess and resets form after successful submit", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response)
    const onSuccess = jest.fn()

    render(<TicketForm onSuccess={onSuccess} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "בעיה בהדפסה")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-TEST-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-1234567")
    await user.type(screen.getByPlaceholderText("פרט את הבעיה בצורה מלאה..."), "המדפסת לא מגיבה")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(screen.getByPlaceholderText("תאר בקצרה את הבעיה")).toHaveValue("")
  })

  it("shows error message when submit fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false } as Response)

    render(<TicketForm onSuccess={jest.fn()} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "בעיה")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-0000000")
    await user.type(screen.getByPlaceholderText("פרט את הבעיה בצורה מלאה..."), "תיאור")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    await waitFor(() => expect(screen.getByText("אירעה שגיאה. נסו שנית.")).toBeInTheDocument())
  })

  it("sends correct payload to API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response)
    const onSuccess = jest.fn()

    render(<TicketForm onSuccess={onSuccess} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "מסך שחור")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-ALON-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-9999999")
    await user.type(screen.getByPlaceholderText("פרט את הבעיה בצורה מלאה..."), "המסך נכבה פתאום")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith("/api/tickets", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"subject":"מסך שחור"'),
    })))
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toHaveProperty("platform", "מחשב אישי")
  })
})
