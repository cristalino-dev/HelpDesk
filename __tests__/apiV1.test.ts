/**
 * __tests__/apiV1.test.ts — the public API's ticket, and the checks on what
 * programs send (v3.88).
 */

import { toApiTicket, toApiTicketDetail, parseCreate, parseUpdate, parseEntry } from "@/lib/apiV1"

const OPTIONS = { urgency: ["נמוך", "בינוני", "גבוה", "דחוף"], category: ["חומרה", "אחר"], platform: ["מחשב אישי", "comax"] }
const t0 = new Date("2026-09-14T08:00:00Z")
const ROW = {
  id: "c1", ticketNumber: 601, type: "request", subject: "מסך", description: "צריך מסך שני",
  status: "פתוח", holdReason: null, urgency: "בינוני", category: "אחר", platform: "מחשב אישי",
  assignedTo: "", phone: "", computerName: "PC-1", createdAt: t0, updatedAt: t0,
  user: { name: "דנה", email: "dana@cristalino.co.il" },
  userId: "u1", sourceMessageId: "<m@x>",
}

describe("toApiTicket", () => {
  it("labels, links and trims the row to the contract", () => {
    const t = toApiTicket(ROW)
    expect(t).toMatchObject({ id: "c1", number: 601, label: "REQ-601", type: "request", assignedTo: null, phone: null, computerName: "PC-1" })
    expect(t.owner).toEqual({ name: "דנה", email: "dana@cristalino.co.il" })
    expect(t.url.endsWith("/tickets/REQ-601")).toBe(true)
    expect(t.createdAt).toBe("2026-09-14T08:00:00.000Z")
    expect(t).not.toHaveProperty("userId")
    expect(t).not.toHaveProperty("sourceMessageId")
    expect(t.mergedInto).toBeNull()
  })

  // v3.92 — a merged ticket names the one it went into, by label.
  it("names the ticket a merged one went into", () => {
    expect(toApiTicket({ ...ROW, mergedInto: { ticketNumber: 590, type: "ticket" } }).mergedInto).toBe("HDTC-590")
  })
})

describe("toApiTicketDetail", () => {
  it("adds the conversation, notes, history, attachments and equipment", () => {
    const d = toApiTicketDetail({
      ...ROW,
      messages: [{ id: "m1", content: "שלום", authorName: "דנה", authorEmail: "dana@cristalino.co.il", authorRole: "user", createdAt: t0 }],
      notes: [{ id: "n1", content: "פנימי", authorName: "אלון", authorEmail: "alon@cristalino.co.il", createdAt: t0 }],
      history: [{ field: "status", oldValue: "פתוח", newValue: "בטיפול", actorName: "אלון", actorEmail: "alon@cristalino.co.il", changedAt: t0 }],
      attachments: [{ id: "a1", filename: "x.pdf", mimeType: "application/pdf", size: 10, createdAt: t0 }],
      equipment: [{ label: "מסך", quantity: 2, receivedQty: 1 }],
    })
    expect(d.messages[0].author).toEqual({ name: "דנה", email: "dana@cristalino.co.il", role: "user" })
    expect(d.history[0]).toMatchObject({ field: "status", from: "פתוח", to: "בטיפול" })
    expect(d.attachments[0].url.endsWith("/api/v1/attachments/a1")).toBe(true)
    expect(d.equipment).toEqual([{ label: "מסך", quantity: 2, received: 1 }])
    expect(d.participants).toEqual([])
  })

  it("lists the people who follow the ticket (v3.92)", () => {
    const d = toApiTicketDetail({
      ...ROW, messages: [], notes: [], history: [], attachments: [], equipment: [],
      participants: [{ user: { name: "רון", email: "ron@cristalino.co.il" } }, { user: { name: null, email: "x@cristalino.co.il" } }],
    })
    expect(d.participants).toEqual([{ name: "רון", email: "ron@cristalino.co.il" }, { name: null, email: "x@cristalino.co.il" }])
  })
})

describe("parseCreate", () => {
  const valid = { subject: "מדפסת", description: "לא מדפיסה", ownerEmail: "Dana@Cristalino.co.il" }

  it("fills the web form's defaults", () => {
    const r = parseCreate(valid, OPTIONS)
    expect("input" in r && r.input).toMatchObject({
      type: "ticket", ownerEmail: "dana@cristalino.co.il", urgency: "בינוני", category: "אחר",
      platform: "מחשב אישי", assignedTo: null, notify: true,
    })
  })

  it("names every missing required field", () => {
    const r = parseCreate({}, OPTIONS)
    expect("errors" in r && r.errors).toEqual(expect.arrayContaining([
      "subject is required", "description is required", "ownerEmail is required",
    ]))
  })

  it("refuses values outside the configured lists, naming what is allowed", () => {
    const r = parseCreate({ ...valid, urgency: "קריטי", type: "incident" }, OPTIONS)
    const errors = "errors" in r ? r.errors.join(" | ") : ""
    expect(errors).toContain("urgency must be one of: נמוך, בינוני, גבוה, דחוף")
    expect(errors).toContain("type must be one of: ticket, request")
  })

  it("refuses an unknown field and a bad address", () => {
    const r = parseCreate({ ...valid, priority: 1, ownerEmail: "not-an-address" }, OPTIONS)
    const errors = "errors" in r ? r.errors.join(" | ") : ""
    expect(errors).toContain("unknown field: priority")
    expect(errors).toContain("ownerEmail is not an email address")
  })

  it("keeps notify: false", () => {
    const r = parseCreate({ ...valid, notify: false, type: "request" }, OPTIONS)
    expect("input" in r && r.input.notify).toBe(false)
    expect("input" in r && r.input.type).toBe("request")
  })
})

describe("parseUpdate", () => {
  it("passes on only what was sent", () => {
    const r = parseUpdate({ status: "בטיפול", urgency: "גבוה" }, OPTIONS)
    expect(r).toEqual({ changes: { status: "בטיפול", urgency: "גבוה" }, notify: true })
  })

  it("lets \"\" unassign", () => {
    const r = parseUpdate({ assignedTo: "" }, OPTIONS)
    expect("changes" in r && r.changes).toEqual({ assignedTo: "" })
  })

  it("wants a reason for בהמתנה", () => {
    expect(parseUpdate({ status: "בהמתנה" }, OPTIONS)).toEqual({ errors: ["holdReason is required when status is בהמתנה"] })
  })

  it("refuses an empty change, an unknown field, and an empty subject", () => {
    expect(parseUpdate({}, OPTIONS)).toEqual({ errors: ["nothing to change"] })
    const r = parseUpdate({ owner: "x", subject: " " }, OPTIONS)
    const errors = "errors" in r ? r.errors.join(" | ") : ""
    expect(errors).toContain("unknown field: owner")
    expect(errors).toContain("subject must not be empty")
  })
})

describe("parseEntry", () => {
  it("wants content", () => {
    expect(parseEntry({ content: "  " })).toEqual({ errors: ["content must not be empty"] })
    expect(parseEntry({ content: "טופל", authorName: "ERP" })).toEqual({ content: "טופל", authorName: "ERP", notify: true })
    expect(parseEntry("x")).toEqual({ errors: ["the body must be a JSON object"] })
  })
})
