/**
 * __tests__/ReportsPage.test.tsx — the /admin/reports screen
 *
 * The page's contract is that ONE fetch backs every control: presets, custom
 * dates, day/week/month and the chart brush all recompute in the browser. If a
 * control ever starts refetching, the "instant" feel is gone and the loading
 * states this page doesn't have would start mattering — so that is asserted
 * directly, not assumed.
 *
 * Also covers the two things a reader would be misled by: a non-admin reaching
 * the page at all, and the filter row failing to scope the numbers below it.
 */

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import ReportsPage from "@/app/admin/reports/page"
import { useSession } from "next-auth/react"
import { axisMax } from "@/app/admin/reports/TimelineChart"

const push = jest.fn()

jest.mock("next-auth/react", () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
jest.mock("@/lib/useIsMobile", () => ({ useIsMobile: () => false }))

// jsdom has no ResizeObserver; the chart measures its container with one.
class RO { observe() {} unobserve() {} disconnect() {} }
;(global as unknown as { ResizeObserver: unknown }).ResizeObserver = RO

global.fetch = jest.fn()

/** ISO instant at midday Israel time on a given civil day — never near a
 *  midnight boundary, so the test can't drift with the offset. */
const at = (day: string) => `${day}T09:00:00.000Z`

const tickets = [
  { ticketNumber: 1, createdAt: at("2026-09-01"), closedAt: at("2026-09-02"), category: "תוכנה", urgency: "דחוף",   platform: "מחשב אישי", status: "סגור", assignedTo: "a@b.c" },
  { ticketNumber: 2, createdAt: at("2026-09-01"), closedAt: null,             category: "תוכנה", urgency: "בינוני", platform: "מחשב אישי", status: "פתוח", assignedTo: "a@b.c" },
  { ticketNumber: 3, createdAt: at("2026-09-02"), closedAt: null,             category: "חומרה", urgency: "נמוך",   platform: "נייד",      status: "פתוח", assignedTo: "d@e.f" },
  // Well outside the default 30-day window, to prove the range actually scopes.
  { ticketNumber: 4, createdAt: at("2020-01-01"), closedAt: null,             category: "אחר",   urgency: "נמוך",   platform: "נייד",      status: "פתוח", assignedTo: "d@e.f" },
]

const admin = { data: { user: { name: "אלון", email: "alon@cristalino.co.il", isAdmin: true } }, status: "authenticated" }

beforeEach(() => {
  jest.clearAllMocks()
  ;(useSession as jest.Mock).mockReturnValue(admin)
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ tickets, generatedAt: at("2026-09-03") }) })
})

const ready = async () => { await waitFor(() => expect(screen.getByText("ציר זמן")).toBeInTheDocument()) }

describe("access", () => {
  it("sends a non-admin to their dashboard", async () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: "x", email: "x@y.z", isAdmin: false } }, status: "authenticated",
    })
    render(<ReportsPage />)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"))
  })

  it("sends a signed-out visitor to the login page", async () => {
    ;(useSession as jest.Mock).mockReturnValue({ data: null, status: "unauthenticated" })
    render(<ReportsPage />)
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"))
  })

  it("does not request the data for a non-admin", async () => {
    ;(useSession as jest.Mock).mockReturnValue({
      data: { user: { name: "x", email: "x@y.z", isAdmin: false } }, status: "authenticated",
    })
    render(<ReportsPage />)
    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe("one fetch backs every control", () => {
  it("loads the tickets exactly once", async () => {
    render(<ReportsPage />)
    await ready()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/reports")
  })

  it("changes granularity without going back to the server", async () => {
    render(<ReportsPage />)
    await ready()
    fireEvent.click(screen.getByText("חודשי"))
    fireEvent.click(screen.getByText("שבועי"))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("changes the range without going back to the server", async () => {
    render(<ReportsPage />)
    await ready()
    fireEvent.click(screen.getByText("90 יום"))
    fireEvent.click(screen.getByText("הכל"))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})

describe("the filter row scopes the numbers", () => {
  it("excludes a ticket outside the range from the breakdown", async () => {
    render(<ReportsPage />)
    await ready()
    // Default window is the last 30 days, so the 2020 ticket's category is out.
    const panel = screen.getByText("פילוח הפניות").closest("section") as HTMLElement
    expect(within(panel).queryByText("אחר")).not.toBeInTheDocument()
  })

  it("brings it back in when the range is widened to everything", async () => {
    render(<ReportsPage />)
    await ready()
    fireEvent.click(screen.getByText("הכל"))
    const panel = screen.getByText("פילוח הפניות").closest("section") as HTMLElement
    await waitFor(() => expect(within(panel).getByText("אחר")).toBeInTheDocument())
  })

  it("re-slices the breakdown when the dimension changes", async () => {
    render(<ReportsPage />)
    await ready()
    const panel = screen.getByText("פילוח הפניות").closest("section") as HTMLElement
    fireEvent.click(within(panel).getByText("דחיפות"))
    await waitFor(() => expect(within(panel).getByText("דחוף")).toBeInTheDocument())
    // Categories are gone — the panel shows one dimension at a time.
    expect(within(panel).queryByText("תוכנה")).not.toBeInTheDocument()
  })
})

describe("the timeline", () => {
  it("offers the numbers as a table, so nothing is gated behind hovering", async () => {
    render(<ReportsPage />)
    await ready()
    expect(screen.queryByText("תקופה")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("הצג כטבלה"))
    await waitFor(() => expect(screen.getByText("תקופה")).toBeInTheDocument())
    expect(screen.getByText("פתוחות במצטבר", { selector: "th" })).toBeInTheDocument()
  })

  it("names both series in the legend, so identity is never color-alone", async () => {
    render(<ReportsPage />)
    await ready()
    expect(screen.getByText("נפתחו")).toBeInTheDocument()
    expect(screen.getByText("נסגרו")).toBeInTheDocument()
  })
})

describe("insights", () => {
  it("states plainly when nothing was opened in the window", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ tickets: [], generatedAt: at("2026-09-03") }) })
    render(<ReportsPage />)
    await ready()
    expect(screen.getByText(/לא נפתחו פניות/)).toBeInTheDocument()
  })
})

describe("failure", () => {
  it("says the load failed rather than rendering an empty report as if it were real", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 })
    render(<ReportsPage />)
    await waitFor(() => expect(screen.getByText("טעינת הנתונים נכשלה")).toBeInTheDocument())
  })
})

describe("the y-axis", () => {
  it("rounds up to a clean top rather than ending on the raw maximum", () => {
    expect(axisMax(7)).toBe(10)
    expect(axisMax(23)).toBe(25)
    expect(axisMax(41)).toBe(50)
    expect(axisMax(140)).toBe(200)
  })

  it("keeps a floor of 5, so a one-ticket day is not a full-height spike", () => {
    expect(axisMax(0)).toBe(5)
    expect(axisMax(1)).toBe(5)
  })

  it("never lands below the value it has to contain", () => {
    for (const v of [1, 6, 9, 26, 99, 101, 249, 1001]) expect(axisMax(v)).toBeGreaterThanOrEqual(v)
  })
})
