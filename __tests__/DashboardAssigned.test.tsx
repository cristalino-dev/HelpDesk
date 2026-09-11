/**
 * __tests__/DashboardAssigned.test.tsx — "משויכות אליי" on /dashboard
 *
 * Reported from production: an admin could not see the open tickets assigned
 * to him on his dashboard. There were 22 of them and none were shown — v3.72
 * scoped the page to tickets you OPENED, and the only reason assigned ones had
 * ever appeared was that admins used to be handed every ticket.
 *
 * The section is drawn from GET /api/tickets/assigned and is deliberately a
 * separate list: its cards must not carry the owner's close/reopen buttons,
 * and nobody who is not staff should even ask for it. And, in the user's own
 * words, the two lists "should be separated with something visual in between
 * them" — so the divider, and where it sits, are asserted too.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import DashboardPage from "@/app/dashboard/page"
import { useSession } from "next-auth/react"

jest.mock("next-auth/react", () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock("@/lib/useIsMobile", () => ({ useIsMobile: () => false }))

const iso = "2026-09-08T09:00:00.000Z"
const ticket = (n: number, over: Record<string, unknown> = {}) => ({
  id: `t${n}`, ticketNumber: n, assignedTo: "helpdesk@cristalino.co.il",
  subject: `נושא ${n}`, description: "", phone: "", computerName: "PC-1",
  urgency: "בינוני", category: "תוכנה", platform: "מחשב אישי", status: "פתוח",
  holdReason: null, createdAt: iso, updatedAt: iso, userId: "u-self", ...over,
})

const OWN = [ticket(101, { subject: "המחשב שלי איטי" })]
const ASSIGNED = [
  ticket(501, {
    subject: "מדפסת בקומה 2", status: "בטיפול", assignedTo: "alon@cristalino.co.il",
    userId: "u-dana", user: { name: "דנה לוי", email: "dana@cristalino.co.il" },
  }),
  ticket(502, {
    subject: "אין גישה לזוהו", status: "בהמתנה", holdReason: "ממתין לספק",
    assignedTo: "alon@cristalino.co.il",
    userId: "u-moshe", user: { name: "משה כהן", email: "moshe@cristalino.co.il" },
  }),
]

type Route = { ok: boolean; body: unknown }
function respond(routes: Record<string, Route>) {
  global.fetch = jest.fn((url: string) => {
    const r = routes[url] ?? { ok: false, body: {} }
    return Promise.resolve({ ok: r.ok, json: async () => r.body })
  }) as unknown as typeof fetch
}
const defaults = (assigned: Route = { ok: true, body: ASSIGNED }) => respond({
  "/api/tickets":          { ok: true, body: OWN },
  "/api/tickets/assigned": assigned,
  "/api/profile":          { ok: true, body: {} },
})
const fetched = () => (global.fetch as jest.Mock).mock.calls.map(c => c[0])

const signedInAs = (email: string, isAdmin: boolean) =>
  (useSession as jest.Mock).mockReturnValue({
    data: { user: { name: "x", email, isAdmin } }, status: "authenticated",
  })

const assignedSection = () => screen.findByRole("region", { name: "משויכות אליי" })
const DIVIDER = { name: "סוף הפניות המשויכות" }
const ownListReady = () =>
  waitFor(() => expect(screen.getByText("המחשב שלי איטי")).toBeInTheDocument())

beforeEach(() => {
  jest.clearAllMocks()
  defaults()
})

describe("for staff", () => {
  beforeEach(() => signedInAs("alon@cristalino.co.il", true))

  it("shows the tickets assigned to them — the reported bug", async () => {
    render(<DashboardPage />)
    const section = await assignedSection()
    expect(within(section).getByText("מדפסת בקומה 2")).toBeInTheDocument()
    // On-hold is still theirs to deal with — six of the 22 in the report.
    expect(within(section).getByText("אין גישה לזוהו")).toBeInTheDocument()
    expect(fetched()).toContain("/api/tickets/assigned")
  })

  // A divider that exists but sits in the wrong place — inside the assigned
  // list, or below the user's own heading — would not separate anything.
  it("separates the two lists with a divider, in order: assigned, divider, your own", async () => {
    render(<DashboardPage />)
    const section = await assignedSection()
    await ownListReady()
    const divider = screen.getByRole("separator", DIVIDER)
    const ownHeading = screen.getByRole("heading", { name: /הפניות שלי/ })
    expect(section.contains(divider)).toBe(false)
    expect(section.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(divider.compareDocumentPosition(ownHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("says whose ticket each one is", async () => {
    render(<DashboardPage />)
    const section = await assignedSection()
    expect(within(section).getByText(/דנה לוי/)).toBeInTheDocument()
    expect(within(section).getByText(/משה כהן/)).toBeInTheDocument()
  })

  // On this page close and reopen are the OWNER's actions. A technician
  // closes from the ticket page, where it assigns and compound-closes.
  it("gives the assigned cards no close button, while their own ticket keeps its one", async () => {
    render(<DashboardPage />)
    const section = await assignedSection()
    await ownListReady()
    expect(within(section).queryByText("✓ סגור")).toBeNull()
    // The button is in the DOM on desktop too — it fades in on hover — so this
    // counts exactly what the own list rendered: one open ticket, one button.
    expect(screen.getAllByText("✓ סגור")).toHaveLength(1)
  })

  it("links through to the full queue", async () => {
    render(<DashboardPage />)
    const section = await assignedSection()
    expect(within(section).getByRole("link", { name: /לכל הפניות/ })).toHaveAttribute("href", "/tickets")
  })

  it("draws no section when nothing is assigned", async () => {
    defaults({ ok: true, body: [] })
    render(<DashboardPage />)
    await ownListReady()
    await waitFor(() => expect(fetched()).toContain("/api/tickets/assigned"))
    expect(screen.queryByRole("region", { name: "משויכות אליי" })).toBeNull()
    // Nothing above it to separate from.
    expect(screen.queryByRole("separator", DIVIDER)).toBeNull()
  })

  // Rule 18: mid-deploy the endpoint answers with the maintenance page, which
  // is not JSON. The rest of the dashboard has to survive that.
  it("survives a failed request — no section, and their own tickets still shown", async () => {
    defaults({ ok: false, body: "<html>maintenance</html>" })
    render(<DashboardPage />)
    await ownListReady()
    expect(screen.queryByRole("region", { name: "משויכות אליי" })).toBeNull()
  })

  it("admits a STAFF_EMAILS member who is not an admin (rule 26)", async () => {
    signedInAs("dev@cristalino.co.il", false)
    render(<DashboardPage />)
    expect(await assignedSection()).toBeInTheDocument()
  })
})

describe("for an employee", () => {
  // The endpoint would refuse them anyway. Not asking is the point: a 403 in
  // every employee's network panel on every dashboard load is only noise.
  it("never asks for assigned tickets, and sees their own exactly as before", async () => {
    signedInAs("worker@cristalino.co.il", false)
    render(<DashboardPage />)
    await ownListReady()
    expect(fetched()).not.toContain("/api/tickets/assigned")
    expect(screen.queryByRole("region", { name: "משויכות אליי" })).toBeNull()
    expect(screen.queryByRole("separator", DIVIDER)).toBeNull()
    expect(screen.getByText("הפניות שלי")).toBeInTheDocument()
  })
})
