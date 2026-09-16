/**
 * __tests__/MergeTicketsModal.test.tsx — the merge dialog (v3.92).
 *
 * What staff see before a merge — which ticket stays, who will follow it, why
 * a merge cannot go ahead — and what the dialog sends when they confirm.
 */

import "@testing-library/jest-dom"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import MergeTicketsModal from "@/components/MergeTicketsModal"
import BulkActionBar from "@/components/BulkActionBar"
import TicketTable from "@/components/TicketTable"
import type { MergePreviewTicket, TicketWithUser } from "@/types/ticket"

function preview(id: string, n: number, extra: Partial<MergePreviewTicket> = {}): MergePreviewTicket {
  return {
    id, ticketNumber: n, type: "ticket", label: `HDTC-${n}`, subject: `נושא ${n}`, status: "פתוח", urgency: "בינוני",
    createdAt: `2026-09-0${n}T08:00:00.000Z`,
    owner: { name: "דנה לוי", email: "dana@cristalino.co.il" }, participants: [],
    counts: { messages: 2, notes: 1, attachments: 0, equipment: 0 }, mergedInto: null, problems: [],
    ...extra,
  }
}

const json = (body: unknown, ok = true) => ({ ok, headers: { get: () => "application/json" }, json: async () => body })

let previews: MergePreviewTicket[] = []
let postBody: unknown = null
let postReply: { body: unknown; ok: boolean } = { body: null, ok: true }
const fetchMock = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
  if (init?.method === "POST") {
    postBody = JSON.parse(init.body ?? "null")
    return json(postReply.body, postReply.ok)
  }
  const refs = decodeURIComponent(url.split("refs=")[1] ?? "").split(",")
  return json({ tickets: previews.filter(p => refs.includes(p.id) || refs.includes(p.label)), notFound: [] })
})

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = fetchMock as unknown as typeof fetch
  postBody = null
  previews = [
    preview("t2", 2, { owner: { name: "רון כהן", email: "ron@cristalino.co.il" } }),
    preview("t1", 1),
  ]
  postReply = {
    ok: true,
    body: { ok: true, target: { id: "t1", label: "HDTC-1" }, merged: [{ id: "t2", label: "HDTC-2" }], participantsAdded: [] },
  }
})

const open = (props: Partial<React.ComponentProps<typeof MergeTicketsModal>> = {}) => {
  const onMerged = jest.fn()
  const onClose = jest.fn()
  render(<MergeTicketsModal isOpen initialRefs={["t2", "t1"]} onClose={onClose} onMerged={onMerged} {...props} />)
  return { onMerged, onClose }
}

describe("MergeTicketsModal", () => {
  it("keeps the oldest ticket by default and says what happens to the other", async () => {
    open()
    expect(await screen.findByRole("button", { name: "מזג לתוך HDTC-1" })).toBeEnabled()
    const radios = screen.getAllByRole("radio")
    // t2 is listed first, but t1 is older.
    expect(radios[1]).toBeChecked()
    expect(screen.getByText("נשארת")).toBeInTheDocument()
    expect(screen.getByText("תיסגר ותמוזג", { selector: "span" })).toBeInTheDocument()
    expect(screen.getByText("לא ניתן לבטל מיזוג.", { exact: false })).toBeInTheDocument()
  })

  it("names who will follow the ticket that stays", async () => {
    open()
    expect(await screen.findByText("רון כהן", { selector: "strong" })).toBeInTheDocument()
  })

  it("sends the chosen ticket as the one that stays, and the rest as sources", async () => {
    const { onMerged } = open()
    const radios = await screen.findAllByRole("radio")
    fireEvent.click(radios[0]) // keep HDTC-2 instead
    postReply = {
      ok: true,
      body: { ok: true, target: { id: "t2", label: "HDTC-2" }, merged: [{ id: "t1", label: "HDTC-1" }], participantsAdded: [] },
    }
    fireEvent.click(screen.getByRole("button", { name: "מזג לתוך HDTC-2" }))
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith({ target: { id: "t2", label: "HDTC-2" }, merged: [{ id: "t1", label: "HDTC-1" }] }))
    expect(postBody).toEqual({ targetId: "t2", sourceIds: ["t1"] })
  })

  it("shows why a merge cannot go ahead, and will not send it", async () => {
    previews = [
      preview("t1", 1, { problems: ["ל-HDTC-2 יש רשימת ציוד — היא צריכה להיות הפנייה שנשארת"] }),
      preview("t2", 2, { problems: ["ל-HDTC-2 יש רשימת ציוד — היא צריכה להיות הפנייה שנשארת"] }),
    ]
    open()
    expect(await screen.findByText(/יש רשימת ציוד/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "מזג לתוך HDTC-1" })).toBeDisabled()
  })

  it("shows the server's refusal and stays open", async () => {
    postReply = { ok: false, body: { error: "אחת הפניות מוזגה בינתיים — רעננו ונסו שוב" } }
    const { onMerged } = open()
    fireEvent.click(await screen.findByRole("button", { name: "מזג לתוך HDTC-1" }))
    expect(await screen.findByText("אחת הפניות מוזגה בינתיים — רעננו ונסו שוב")).toBeInTheDocument()
    expect(onMerged).not.toHaveBeenCalled()
  })

  // From a ticket's page: that ticket, and the number staff type in.
  it("adds a ticket by its number", async () => {
    open({ initialRefs: ["t1"], allowAdd: true })
    expect(await screen.findByText("הוסיפו את מספר הפנייה שתמוזג.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("מספר פנייה למיזוג"), { target: { value: "HDTC-2" } })
    fireEvent.click(screen.getByRole("button", { name: "הוסף" }))
    expect(await screen.findByRole("button", { name: "מזג לתוך HDTC-1" })).toBeEnabled()
    expect(decodeURIComponent(fetchMock.mock.calls.at(-1)![0] as string)).toContain("refs=t1,HDTC-2")
  })

  it("renders nothing while closed", () => {
    const { container } = render(<MergeTicketsModal isOpen={false} initialRefs={["t1"]} onClose={jest.fn()} onMerged={jest.fn()} />)
    expect(container.firstChild).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("BulkActionBar — merge", () => {
  const bar = (count: number, onMerge = jest.fn()) =>
    render(<BulkActionBar selectedCount={count} onClearSelection={jest.fn()} onOpenBulkEdit={jest.fn()} onMerge={onMerge} />)

  it("offers merging once two tickets are selected", () => {
    const onMerge = jest.fn()
    bar(2, onMerge)
    fireEvent.click(screen.getByRole("button", { name: /מיזוג/ }))
    expect(onMerge).toHaveBeenCalled()
  })

  it("does not offer it for a single ticket", () => {
    bar(1)
    expect(screen.queryByRole("button", { name: /מיזוג/ })).not.toBeInTheDocument()
  })
})

describe("TicketTable — merged and followed tickets", () => {
  const base: TicketWithUser = {
    id: "1", ticketNumber: 12, subject: "אין רשת", description: "", phone: "", computerName: "PC-1",
    urgency: "נמוך", category: "רשת", platform: "מחשב אישי", status: "סגור",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), userId: "u1", assignedTo: "",
  }

  it("says where a merged ticket went, and offers no reopen", () => {
    render(<TicketTable tickets={[{ ...base, mergedIntoId: "x", mergedInto: { ticketNumber: 15, type: "ticket" } }]} onReopen={jest.fn()} />)
    expect(screen.getAllByText("🔗 מוזגה ל-HDTC-15").length).toBeGreaterThan(0)
    expect(screen.queryByTitle("פתח מחדש")).not.toBeInTheDocument()
  })

  it("still offers reopen on an ordinary closed ticket", () => {
    render(<TicketTable tickets={[base]} onReopen={jest.fn()} />)
    expect(screen.getByTitle("פתח מחדש")).toBeInTheDocument()
  })

  it("tags a ticket the user follows, and leaves closing it to its owner", () => {
    render(<TicketTable tickets={[{ ...base, status: "פתוח", role: "participant" } as TicketWithUser]} onClose={jest.fn()} />)
    expect(screen.getAllByText("👥 משתתף").length).toBeGreaterThan(0)
    expect(screen.queryByTitle("סגור פנייה")).not.toBeInTheDocument()
  })
})
