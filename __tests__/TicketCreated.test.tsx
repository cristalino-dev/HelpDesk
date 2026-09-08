/**
 * __tests__/TicketCreated.test.tsx — the confirmation a person gets
 *
 * The ticket number is the only handle anyone has on a ticket: it is what the
 * support team asks for on the phone, what every email about it leads with, and
 * what someone needs when they come back three days later. Showing it and
 * moving on is not enough — it has to be takeable, and the reader has to be
 * told why they want it.
 *
 * The failure this guards hardest is the silent one. `navigator.clipboard` is
 * unavailable over plain HTTP and can be refused even over HTTPS; a copy button
 * that quietly does nothing is worse than no button, so every press has to
 * report what happened.
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { TicketCreatedCard, TicketCreatedDialog, ticketLink } from "@/components/TicketCreated"

const writeText = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText },
  })
})

describe("the number is front and centre", () => {
  it("shows it as HDTC-<n>", () => {
    render(<TicketCreatedCard ticketNumber={565} />)
    expect(screen.getByText("HDTC-565")).toBeInTheDocument()
  })

  it("tells the reader they will need it — the point of the whole dialog", () => {
    render(<TicketCreatedCard ticketNumber={565} />)
    expect(screen.getByText(/שמרו את מספר הפנייה/)).toBeInTheDocument()
  })

  it("shows the subject when there is one, and omits it when there is not", () => {
    const { rerender } = render(<TicketCreatedCard ticketNumber={565} subject="המסך לא נדלק" />)
    expect(screen.getByText("המסך לא נדלק")).toBeInTheDocument()
    rerender(<TicketCreatedCard ticketNumber={565} />)
    expect(screen.queryByText("המסך לא נדלק")).not.toBeInTheDocument()
  })

  it("lets the number be selected with one click, for people who copy by hand", () => {
    render(<TicketCreatedCard ticketNumber={565} />)
    expect(screen.getByText("HDTC-565")).toHaveStyle({ userSelect: "all" })
  })
})

describe("copying", () => {
  it("copies the bare number, not the link", async () => {
    render(<TicketCreatedCard ticketNumber={565} />)
    fireEvent.click(screen.getByLabelText("העתק מספר"))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("HDTC-565"))
  })

  it("copies the full link to the ticket", async () => {
    render(<TicketCreatedCard ticketNumber={565} />)
    await waitFor(() => expect(screen.queryByLabelText("העתק קישור")).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText("העתק קישור"))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/tickets/HDTC-565")))
  })

  it("builds the link the way the emails do", () => {
    expect(ticketLink(565)).toContain("/tickets/HDTC-565")
  })

  it("confirms the copy, so the press is not a guess", async () => {
    render(<TicketCreatedCard ticketNumber={565} />)
    fireEvent.click(screen.getByLabelText("העתק מספר"))
    expect(await screen.findByText("הועתק!")).toBeInTheDocument()
  })

  it("says so when the clipboard REFUSES, rather than looking like it worked", async () => {
    // Refused permission over HTTPS. A button that silently fails is worse
    // than no button: the reader walks away believing they have the number.
    writeText.mockRejectedValue(new Error("denied"))
    render(<TicketCreatedCard ticketNumber={565} />)
    fireEvent.click(screen.getByLabelText("העתק מספר"))
    expect(await screen.findByText("בחר והעתק")).toBeInTheDocument()
  })

  it("survives a browser with no clipboard API at all", async () => {
    // Plain HTTP: navigator.clipboard is simply absent.
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined })
    render(<TicketCreatedCard ticketNumber={565} />)
    expect(() => fireEvent.click(screen.getByLabelText("העתק מספר"))).not.toThrow()
    expect(await screen.findByText("בחר והעתק")).toBeInTheDocument()
  })
})

describe("as a dialog", () => {
  it("is a labelled modal, so a screen reader announces it", () => {
    render(<TicketCreatedDialog ticketNumber={565} onClose={jest.fn()} />)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(within(dialog).getByText("HDTC-565")).toBeInTheDocument()
  })

  it("closes on the ✕", () => {
    const onClose = jest.fn()
    render(<TicketCreatedDialog ticketNumber={565} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText("סגור"))
    expect(onClose).toHaveBeenCalled()
  })

  it("closes on Escape", () => {
    const onClose = jest.fn()
    render(<TicketCreatedDialog ticketNumber={565} onClose={onClose} />)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("closes when the backdrop is clicked, but NOT the card itself", () => {
    const onClose = jest.fn()
    const { container } = render(<TicketCreatedDialog ticketNumber={565} onClose={onClose} />)
    fireEvent.click(screen.getByRole("dialog"))
    expect(onClose).not.toHaveBeenCalled()   // clicking the card must not dismiss it
    fireEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalled()
  })

  it("stops the page behind it from scrolling, and gives that back on close", () => {
    const { unmount } = render(<TicketCreatedDialog ticketNumber={565} onClose={jest.fn()} />)
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.body.style.overflow).not.toBe("hidden")
  })

  it("renders whatever actions the page passes in", () => {
    render(
      <TicketCreatedDialog ticketNumber={565} onClose={jest.fn()}>
        <button type="button">צפה בפנייה</button>
      </TicketCreatedDialog>,
    )
    expect(screen.getByText("צפה בפנייה")).toBeInTheDocument()
  })
})
