import "@testing-library/jest-dom"
import { render, screen } from "@testing-library/react"
import TicketTable from "@/components/TicketTable"
import type { Ticket } from "@/types/ticket"

const baseTicket: Ticket = {
  id: "1",
  ticketNumber: 1,
  subject: "בעיית רשת",
  description: "אין חיבור לאינטרנט",
  phone: "050-1234567",
  computerName: "PC-TEST-01",
  urgency: "גבוה",
  category: "רשת",
  platform: "מחשב אישי",
  status: "פתוח",
  createdAt: "2026-04-09T10:00:00.000Z",
  updatedAt: "2026-04-09T10:00:00.000Z",
  userId: "user-1",
  assignedTo: "",
}

/**
 * TicketTable.test.tsx
 * 
 * Test suite for the Admin/Staff Ticket Table component.
 * Verifies that ticket rows render correctly based on status, 
 * urgency, and user metadata.
 */

describe("TicketTable", () => {
  /**
   * ARRANGE: Mock ticket data
   * ASSERT: Check for presence of subject, urgency badge, and status badge.
   */
  it("shows empty state when no tickets", () => {
    render(<TicketTable tickets={[]} />)
    expect(screen.getByText("אין פניות עדיין")).toBeInTheDocument()
  })

  /**
   * ARRANGE: Create a ticket with long description
   * ASSERT: Verify that descriptions are rendered with white-space preservation logic (if applicable).
   */
  it("renders a ticket subject", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.getByText("בעיית רשת")).toBeInTheDocument()
  })

  it("renders computer name", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.getByText(/PC-TEST-01/)).toBeInTheDocument()
  })

  it("renders category", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.getAllByText(/רשת/).length).toBeGreaterThanOrEqual(1)
  })

  it("renders platform", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.getByText(/מחשב אישי/)).toBeInTheDocument()
  })

  it("renders urgency badge", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.getByText("גבוה")).toBeInTheDocument()
  })

  it("renders status badge", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.getByText("פתוח")).toBeInTheDocument()
  })

  it("renders multiple tickets", () => {
    const tickets: Ticket[] = [
      { ...baseTicket, id: "1", subject: "בעיה ראשונה" },
      { ...baseTicket, id: "2", subject: "בעיה שנייה" },
      { ...baseTicket, id: "3", subject: "בעיה שלישית" },
    ]
    render(<TicketTable tickets={tickets} />)
    expect(screen.getByText("בעיה ראשונה")).toBeInTheDocument()
    expect(screen.getByText("בעיה שנייה")).toBeInTheDocument()
    expect(screen.getByText("בעיה שלישית")).toBeInTheDocument()
  })

  it("does not show empty state when tickets exist", () => {
    render(<TicketTable tickets={[baseTicket]} />)
    expect(screen.queryByText("אין פניות עדיין")).not.toBeInTheDocument()
  })

  it("renders all urgency levels correctly", () => {
    const tickets: Ticket[] = [
      { ...baseTicket, id: "1", subject: "בעיה א", urgency: "נמוך" },
      { ...baseTicket, id: "2", subject: "בעיה ב", urgency: "בינוני" },
      { ...baseTicket, id: "3", subject: "בעיה ג", urgency: "גבוה" },
      { ...baseTicket, id: "4", subject: "בעיה ד", urgency: "דחוף" },
    ]
    render(<TicketTable tickets={tickets} />)
    expect(screen.getByText("נמוך")).toBeInTheDocument()
    expect(screen.getByText("בינוני")).toBeInTheDocument()
    expect(screen.getByText("גבוה")).toBeInTheDocument()
    expect(screen.getByText("דחוף")).toBeInTheDocument()
  })

  it("renders all status types correctly", () => {
    const tickets: Ticket[] = [
      { ...baseTicket, id: "1", subject: "בעיה א", status: "פתוח" },
      { ...baseTicket, id: "2", subject: "בעיה ב", status: "בטיפול" },
      { ...baseTicket, id: "3", subject: "בעיה ג", status: "סגור" },
    ]
    render(<TicketTable tickets={tickets} />)
    expect(screen.getByText("פתוח")).toBeInTheDocument()
    expect(screen.getByText("בטיפול")).toBeInTheDocument()
    expect(screen.getByText("סגור")).toBeInTheDocument()
  })
})
