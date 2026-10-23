/**
 * __tests__/AssigneeBoard.test.tsx — the "לפי מטפל" tab (v3.107).
 *
 * Eyal asked to see each helpdesk member's open tickets in one place, ranked
 * by an urgency of the team's own, and to filter by who holds them and then
 * by urgency. The cards pick a person; the chips narrow by urgency and by
 * internal priority; the row classifies a ticket in place.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import AssigneeBoard from "@/components/AssigneeBoard"
import type { TicketWithUser } from "@/types/ticket"

jest.mock("@/lib/useIsMobile", () => ({ useIsMobile: () => false }))

const iso = new Date().toISOString()
const ticket = (n: number, over: Partial<TicketWithUser> = {}): TicketWithUser => ({
  id: `t${n}`, ticketNumber: n, assignedTo: "dana@cristalino.co.il", subject: `נושא ${n}`, description: "",
  phone: "", computerName: "", urgency: "בינוני", category: "תוכנה", platform: "מחשב אישי", status: "פתוח",
  type: "ticket", internalPriority: null, createdAt: iso, updatedAt: iso, userId: "u1",
  user: { name: "משה כהן", email: "moshe@cristalino.co.il" }, ...over,
})

const STAFF = [
  { email: "dana@cristalino.co.il", display: "דנה" },
  { email: "yossi@cristalino.co.il", display: "יוסי" },
  { email: "bot@cristalino.co.il", display: "🤖 בוט" },
]
const URGENCIES = ["נמוך", "בינוני", "גבוה", "דחוף"]

const TICKETS = [
  ticket(1, { subject: "השרת נפל", urgency: "דחוף", internalPriority: "P1" }),
  ticket(2, { subject: "מסך מהבהב", internalPriority: "P4" }),
  ticket(3, { subject: "חשבון חדש", assignedTo: "yossi@cristalino.co.il", urgency: "גבוה" }),
  ticket(4, { subject: "סגורה", status: "סגור" }),
]

const fetchMock = jest.fn(async (url: string) => {
  void url
  return { ok: true, json: async () => ({}) }
})

beforeEach(() => {
  fetchMock.mockClear()
  global.fetch = fetchMock as unknown as typeof fetch
})

const renderBoard = (over: Partial<Parameters<typeof AssigneeBoard>[0]> = {}) => {
  const props = {
    tickets: TICKETS, loading: false, staffMembers: STAFF, urgencies: URGENCIES,
    onPatched: jest.fn(), onReload: jest.fn(), ...over,
  }
  render(<AssigneeBoard {...props} />)
  return props
}

/** A lane card — a toggle button whose text starts with the person's name. */
const card = (name: string) => [...screen.queryAllByRole("button", { pressed: false }), ...screen.queryAllByRole("button", { pressed: true })]
  .find(b => b.textContent?.startsWith(name)) as HTMLElement

it("shows a card per person with their open tickets, and the bot only when it has some", () => {
  renderBoard()
  expect(card("דנה").textContent).toContain("2")
  expect(card("יוסי").textContent).toContain("1")
  expect(card("כולם").textContent).toContain("3")
  // Still offered as an assignee in each row — just no card of its own while idle.
  expect(card("🤖 בוט")).toBeUndefined()
})

it("groups the open tickets by assignee, ranked by internal priority, closed ones left out", () => {
  renderBoard()
  const dana = screen.getByRole("region", { name: "דנה" })
  const subjects = within(dana).getAllByRole("link").map(a => a.textContent).filter(t => !t?.startsWith("HDTC"))
  expect(subjects).toEqual(["השרת נפל", "מסך מהבהב"])
  expect(screen.queryByText("סגורה")).not.toBeInTheDocument()
})

it("marks where the unclassified tickets start", () => {
  renderBoard()
  const yossi = screen.getByRole("region", { name: "יוסי" })
  expect(within(yossi).getByRole("separator").textContent).toContain("טרם סווגו (1)")
})

it("filters to one person when their card is clicked, and back again", () => {
  renderBoard()
  fireEvent.click(card("יוסי"))
  expect(screen.queryByText("השרת נפל")).not.toBeInTheDocument()
  expect(screen.getByText("חשבון חדש")).toBeInTheDocument()
  fireEvent.click(card("יוסי"))
  expect(screen.getByText("השרת נפל")).toBeInTheDocument()
})

it("narrows by urgency and by internal priority", () => {
  renderBoard()
  fireEvent.click(screen.getByRole("button", { name: "דחוף" }))
  expect(screen.getByText("השרת נפל")).toBeInTheDocument()
  expect(screen.queryByText("מסך מהבהב")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "דחוף" }))

  fireEvent.click(screen.getByRole("button", { name: "לא סווג" }))
  expect(screen.getByText("חשבון חדש")).toBeInTheDocument()
  expect(screen.queryByText("השרת נפל")).not.toBeInTheDocument()
})

it("classifies a ticket from its row, and tells the console", async () => {
  const props = renderBoard()
  const yossi = screen.getByRole("region", { name: "יוסי" })
  fireEvent.change(within(yossi).getByLabelText("דחיפות פנימית"), { target: { value: "P2" } })
  await waitFor(() => expect(props.onPatched).toHaveBeenCalledWith("t3", { internalPriority: "P2" }))
  const patch = fetchMock.mock.calls.find(([url]) => url === "/api/tickets")
  expect(JSON.parse((patch as unknown as [string, { body: string }])[1].body)).toEqual({ id: "t3", internalPriority: "P2" })
})

it("calls a person free only when no filter is narrowing the count", () => {
  renderBoard({ staffMembers: [...STAFF, { email: "eyal@cristalino.co.il", display: "אייל" }] })
  expect(card("אייל").textContent).toContain("פנוי")
  expect(card("דנה").textContent).not.toContain("פנוי")
  // Under a filter, Dana has none of the unclassified tickets — that is not "free".
  fireEvent.click(screen.getByRole("button", { name: "לא סווג" }))
  expect(card("דנה").textContent).toContain("0")
  expect(card("דנה").textContent).not.toContain("פנוי")
})

it("says when nothing matches", () => {
  renderBoard({ tickets: [ticket(9, { status: "סגור" })] })
  expect(screen.getByText("אין פניות פתוחות שמתאימות לסינון")).toBeInTheDocument()
})
