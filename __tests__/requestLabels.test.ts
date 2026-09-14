/**
 * __tests__/requestLabels.test.ts — REQ-N wherever HDTC-N goes (v3.87).
 *
 * A request carries REQ-N in its mail subjects, and a reply to one must still
 * find its ticket; search accepts REQ-N; the digest judges each ticket against
 * its own type's SLA, in workdays, as the queues do.
 */

import { subjects } from "@/lib/mailSubjects"
import { ticketNumberFromSubject } from "@/lib/mailIngest"
import { parseTicketNumberQuery, matchesTicketNumber } from "@/lib/ticketSearch"
import { mailDailyDigest, ticketUrl } from "@/lib/mail"

jest.mock("@/lib/logError", () => ({ logError: jest.fn() }))

describe("mail subjects", () => {
  it("label a request REQ-N and a ticket HDTC-N", () => {
    expect(subjects.updatedStaff({ ticketNumber: 601, type: "request" }, "מסך")).toContain("REQ-601")
    expect(subjects.inProgressUser({ ticketNumber: 597, type: "ticket" })).toContain("HDTC-597")
    expect(subjects.inProgressUser(597)).toContain("HDTC-597")
  })

  it("carry a label a reply can be threaded by, either way", () => {
    expect(ticketNumberFromSubject(`Re: ${subjects.newMessageUser({ ticketNumber: 601, type: "request" }, "מסך")}`)).toBe(601)
    expect(ticketNumberFromSubject("RE: עדכון פנייה HDTC-12: מדפסת")).toBe(12)
  })

  it("do not mistake a word that merely ends in REQ for a label", () => {
    expect(ticketNumberFromSubject("FREQ-12 report")).toBeNull()
  })
})

describe("links and search", () => {
  it("link a request by its REQ label", () => {
    expect(ticketUrl(601, "request").endsWith("/tickets/REQ-601")).toBe(true)
    expect(ticketUrl(597).endsWith("/tickets/HDTC-597")).toBe(true)
  })

  it("accept REQ-N in the search box", () => {
    expect(parseTicketNumberQuery("REQ-45")).toBe(45)
    expect(parseTicketNumberQuery("req 45")).toBe(45)
    expect(matchesTicketNumber(45, "req-4")).toBe(true)
    expect(matchesTicketNumber(45, "hdtc-4")).toBe(true)
  })
})

describe("the daily digest", () => {
  afterEach(() => { jest.useRealTimers() })

  // Thursday 17 September; both opened on Sunday the 6th — 9 workdays ago.
  // A ticket (4) is overdue by then; a request (10) is not.
  it("judges each ticket against its own type's SLA", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-17T10:00:00+03:00").getTime())
    const opened = "2026-09-06T09:00:00+03:00"
    const html = mailDailyDigest([
      { ticketNumber: 597, type: "ticket",  subject: "מדפסת", urgency: "בינוני", status: "פתוח", createdAt: opened },
      { ticketNumber: 601, type: "request", subject: "מסך",   urgency: "בינוני", status: "פתוח", createdAt: opened },
    ])
    // One row marked (" ⏰" ends the age cell), and the summary card counts one.
    expect((html.match(/ ⏰<\/td>/g) ?? []).length).toBe(1)
    expect(html).toContain('color:#c2410c">1</div>')
    expect(html).toContain("REQ-601")
    expect(html).toContain("HDTC-597")
  })
})
