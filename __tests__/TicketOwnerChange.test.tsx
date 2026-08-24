/**
 * __tests__/TicketOwnerChange.test.tsx
 *
 * The מגיש (submitter) picker on the ticket detail page — v3.63.
 *
 * The server tests in TicketsAPI.test.tsx cover who may move a ticket and what
 * gets written. These cover the half that only exists in the browser: the move
 * is *staged*, not applied, until the admin confirms it. A native <select> is
 * one keystroke away from a wrong answer, and this particular wrong answer
 * hands a ticket to the wrong person, so "the dialog appeared" is not the
 * guarantee worth testing — "nothing changed until אישור" is.
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import TicketDetailPage from "@/app/tickets/[id]/page"

const ADMIN = { email: "admin@cristalino.co.il", name: "אלון כרם", isAdmin: true }
const STAFF = { email: "staff@cristalino.co.il", name: "צוות", isAdmin: false }

let sessionUser: Record<string, unknown> = ADMIN

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: sessionUser }, status: "authenticated" }),
}))

const push = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: "ticket-1" }),
}))

// The picker under test lists *users*; the assignment dropdown next to it lists
// staff. Pinning the staff roster keeps the two from being confused here.
jest.mock("@/lib/staffEmails", () => ({
  STAFF_EMAILS: ["staff@cristalino.co.il"],
  ASSIGNABLE_FALLBACK: [{ email: "staff@cristalino.co.il", handle: "staff", display: "צוות" }],
}))

const USERS = [
  { id: "u1", name: "אלון כרם", email: "alon@cristalino.co.il" },
  { id: "u2", name: "דנה לוי",  email: "dana@cristalino.co.il" },
  { id: "u3", name: "יוסי כהן", email: "yossi@cristalino.co.il" },
]

const TICKET = {
  id: "ticket-1",
  ticketNumber: 441,
  subject: "החלפת טלוויזיה",
  description: "תיאור",
  phone: "0502131716",
  computerName: "CRIS-L051",
  urgency: "בינוני",
  category: "אחר",
  platform: "מחשב אישי",
  status: "פתוח",
  assignedTo: "staff@cristalino.co.il",
  createdAt: "2026-08-04T14:27:00.000Z",
  updatedAt: "2026-08-04T14:27:00.000Z",
  userId: "u1",
  user: { name: "אלון כרם", email: "alon@cristalino.co.il" },
  notes: [], messages: [], attachments: [], history: [], equipment: [],
}

/** Every PATCH body the page sends, so a test can assert on the wire. */
let patches: Record<string, unknown>[] = []
/** Every URL the page fetched, for the "did not even ask" assertions. */
let fetched: string[] = []

const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
  fetched.push(String(url))
  if (String(url).startsWith("/api/tickets/ticket-1")) {
    return { ok: true, json: async () => TICKET }
  }
  if (url === "/api/tickets" && init?.method === "PATCH") {
    patches.push(JSON.parse(String(init.body)))
    return { ok: true, json: async () => TICKET }
  }
  if (url === "/api/users") return { ok: true, json: async () => USERS }
  if (url === "/api/staff") return { ok: true, json: async () => [] }
  return { ok: false, json: async () => ({}) }
}) as unknown as typeof fetch

beforeEach(() => {
  jest.clearAllMocks()
  patches = []
  fetched = []
  sessionUser = ADMIN
  global.fetch = mockFetch
})

/** Renders the page and waits for the ticket payload to land. */
async function openTicket() {
  render(<TicketDetailPage />)
  await screen.findByText(/HDTC-441/)
}

/** Puts the page into edit mode and hands back the מגיש select. */
async function startEditing() {
  fireEvent.click(await screen.findByText("עריכה"))
  return (await screen.findByLabelText("מגיש")) as HTMLSelectElement
}

/** Waits for the admin-only user roster to populate the picker. */
async function rosterLoaded(select: HTMLSelectElement) {
  await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(USERS.length))
}

describe("מגיש picker — who gets to see it", () => {
  it("gives an admin a select listing every registered user", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    expect(within(select).getByRole("option", { name: "יוסי כהן" })).toBeInTheDocument()
    expect(select.value).toBe("alon@cristalino.co.il")
  })

  it("leaves מגיש read-only for non-admin staff, who may still edit the rest", async () => {
    sessionUser = STAFF
    await openTicket()
    fireEvent.click(await screen.findByText("עריכה"))

    expect(screen.queryByLabelText("מגיש")).not.toBeInTheDocument()
    // Still in edit mode — the subject is editable, so this is not simply
    // "staff cannot edit anything".
    expect(screen.getByDisplayValue("החלפת טלוויזיה")).toBeInTheDocument()
    // The roster is admin-only server-side; do not ask for it and eat a 403.
    expect(fetched).not.toContain("/api/users")
  })
})

describe("מגיש picker — what it costs to look at a ticket", () => {
  it("does not pull the user roster until the edit form is actually opened", async () => {
    await openTicket()

    // Most visits to a ticket never open עריכה, and the roster is only
    // reachable from inside it. Reading the whole user table on every view
    // paid for a dropdown nobody opened.
    expect(fetched).not.toContain("/api/users")

    const select = await startEditing()
    await rosterLoaded(select)
    expect(fetched).toContain("/api/users")
  })

  it("fetches the roster once, not on every trip through the edit form", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.click(screen.getByText("ביטול"))
    fireEvent.click(await screen.findByText("עריכה"))
    await screen.findByLabelText("מגיש")

    expect(fetched.filter(u => u === "/api/users")).toHaveLength(1)
  })
})

describe("cancelling an edit", () => {
  // The form state outlives edit mode. A cancel that left it dirty handed the
  // next עריכה the values the user had just discarded — and שמור wrote them.
  it("discards every field, not only the staged owner move", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.change(screen.getByDisplayValue("החלפת טלוויזיה"), { target: { value: "נושא שנזרק" } })
    fireEvent.change(select, { target: { value: "yossi@cristalino.co.il" } })
    fireEvent.click(within(await screen.findByRole("dialog", { name: "אישור העברת פנייה" })).getByText("אישור"))
    await waitFor(() => expect(select.value).toBe("yossi@cristalino.co.il"))

    fireEvent.click(screen.getByText("ביטול"))
    fireEvent.click(await screen.findByText("עריכה"))

    const reopened = await screen.findByLabelText("מגיש") as HTMLSelectElement
    expect(reopened.value).toBe("alon@cristalino.co.il")
    expect(screen.getByDisplayValue("החלפת טלוויזיה")).toBeInTheDocument()
    expect(screen.queryByDisplayValue("נושא שנזרק")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("שמור"))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ subject: "החלפת טלוויזיה" })
    expect(patches[0]).not.toHaveProperty("ownerEmail")
  })
})

describe("מגיש picker — the confirmation gate", () => {
  it("asks before moving the ticket, naming both people", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.change(select, { target: { value: "yossi@cristalino.co.il" } })

    const dialog = await screen.findByRole("dialog", { name: "אישור העברת פנייה" })
    expect(within(dialog).getByText("אלון כרם")).toBeInTheDocument()
    expect(within(dialog).getAllByText(/יוסי כהן/).length).toBeGreaterThan(0)
  })

  it("does not touch the field while the dialog is open", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.change(select, { target: { value: "yossi@cristalino.co.il" } })
    await screen.findByRole("dialog", { name: "אישור העברת פנייה" })

    // The select is controlled by editForm, which the pick deliberately did
    // not write to — so it still shows the current owner.
    expect(select.value).toBe("alon@cristalino.co.il")
  })

  it("ביטול leaves the owner alone, and the save carries no ownerEmail", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.change(select, { target: { value: "yossi@cristalino.co.il" } })
    const dialog = await screen.findByRole("dialog", { name: "אישור העברת פנייה" })
    fireEvent.click(within(dialog).getByText("ביטול"))

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "אישור העברת פנייה" })).not.toBeInTheDocument()
    )
    expect(select.value).toBe("alon@cristalino.co.il")

    fireEvent.click(screen.getByText("שמור"))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).not.toHaveProperty("ownerEmail")
  })

  it("אישור stages the move, and שמור sends it", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.change(select, { target: { value: "yossi@cristalino.co.il" } })
    const dialog = await screen.findByRole("dialog", { name: "אישור העברת פנייה" })
    fireEvent.click(within(dialog).getByText("אישור"))

    await waitFor(() => expect(select.value).toBe("yossi@cristalino.co.il"))
    // Confirming is not saving — nothing has gone to the server yet.
    expect(patches).toHaveLength(0)

    fireEvent.click(screen.getByText("שמור"))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ id: "ticket-1", ownerEmail: "yossi@cristalino.co.il" })
  })

  it("an edit that never touches מגיש sends no ownerEmail at all", async () => {
    await openTicket()
    const select = await startEditing()
    await rosterLoaded(select)

    fireEvent.change(screen.getByDisplayValue("החלפת טלוויזיה"), { target: { value: "נושא חדש" } })
    fireEvent.click(screen.getByText("שמור"))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ subject: "נושא חדש" })
    expect(patches[0]).not.toHaveProperty("ownerEmail")
  })
})
