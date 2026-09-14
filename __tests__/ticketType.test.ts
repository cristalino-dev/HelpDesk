/**
 * __tests__/ticketType.test.ts — a ticket is a fault or a request (v3.87).
 *
 * The label (HDTC-N or REQ-N), the way a URL finds either, the queue's two
 * sections and the SLA per type all come from lib/ticketType.ts.
 */

import {
  normalizeType, isRequest, ticketLabel, ticketRefWhere, splitByType,
  withRequestsDivider, isRequestsDivider, REQUESTS_DIVIDER_ID,
  slaFor, parseSlaWorkdays, DEFAULT_SLA,
} from "@/lib/ticketType"

describe("normalizeType", () => {
  it("is a request only when it says so, in any case", () => {
    expect(normalizeType("request")).toBe("request")
    expect(normalizeType(" Request ")).toBe("request")
  })

  it("is a ticket otherwise — every row from before v3.87 among them", () => {
    for (const v of ["ticket", "", "foo", undefined, null, 7]) expect(normalizeType(v)).toBe("ticket")
    expect(isRequest({})).toBe(false)
    expect(isRequest({ type: "request" })).toBe(true)
  })
})

describe("ticketLabel", () => {
  it("labels a ticket HDTC-N and a request REQ-N", () => {
    expect(ticketLabel({ ticketNumber: 597 })).toBe("HDTC-597")
    expect(ticketLabel({ ticketNumber: 597, type: "ticket" })).toBe("HDTC-597")
    expect(ticketLabel({ ticketNumber: 601, type: "request" })).toBe("REQ-601")
  })
})

describe("ticketRefWhere", () => {
  it("finds either label by its number — one sequence for both", () => {
    expect(ticketRefWhere("HDTC-597")).toEqual({ ticketNumber: 597 })
    expect(ticketRefWhere("REQ-601")).toEqual({ ticketNumber: 601 })
    expect(ticketRefWhere("req-601")).toEqual({ ticketNumber: 601 })
  })

  it("treats anything else as a raw id", () => {
    expect(ticketRefWhere("cmsoeiaek00nocwn37bbmpffj")).toEqual({ id: "cmsoeiaek00nocwn37bbmpffj" })
    expect(ticketRefWhere("HDTC-")).toEqual({ id: "HDTC-" })
  })
})

describe("a queue's two sections", () => {
  const list = [
    { id: "a", type: "request" }, { id: "b" }, { id: "c", type: "ticket" }, { id: "d", type: "request" },
  ]

  it("splits tickets from requests, keeping each in order", () => {
    const { tickets, requests } = splitByType(list)
    expect(tickets.map(t => t.id)).toEqual(["b", "c"])
    expect(requests.map(t => t.id)).toEqual(["a", "d"])
  })

  it("puts the requests below the tickets, with a divider between", () => {
    const shown = withRequestsDivider(list)
    expect(shown.map(t => t.id)).toEqual(["b", "c", REQUESTS_DIVIDER_ID, "a", "d"])
    expect(shown.filter(isRequestsDivider)).toHaveLength(1)
  })

  it("adds no divider when there are no requests", () => {
    expect(withRequestsDivider([{ id: "b" }]).map(t => t.id)).toEqual(["b"])
  })
})

describe("SLA", () => {
  it("defaults to 4 workdays for a ticket and 10 for a request", () => {
    expect(DEFAULT_SLA).toEqual({ ticket: 4, request: 10 })
    expect(slaFor("request")).toBe(10)
    expect(slaFor(undefined)).toBe(4)
    expect(slaFor("request", { ticket: 2, request: 7 })).toBe(7)
  })

  it("accepts only whole workdays between 1 and 60", () => {
    expect(parseSlaWorkdays(5)).toBe(5)
    expect(parseSlaWorkdays("7")).toBe(7)
    for (const bad of [0, 61, 2.5, "x", "", null, undefined]) expect(parseSlaWorkdays(bad)).toBeNull()
  })
})
