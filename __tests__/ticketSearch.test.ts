/**
 * __tests__/ticketSearch.test.ts
 *
 * Unit tests for lib/ticketSearch.ts — the ticket-number aware search helpers
 * shared by the admin queue, the staff "all tickets" page and the dashboard.
 *
 * The behaviour under test: typing a ticket number (494, HDTC-494, #494) must
 * surface that exact ticket as a suggestion regardless of whether it is open or
 * closed, and regardless of the status/stat filters active on the page.
 */

export {}

import {
  parseTicketNumberQuery,
  parseTicketNumberList,
  matchesTicketNumber,
  findByTicketNumber,
  withNumberSuggestion,
} from "@/lib/ticketSearch"

interface MinTicket {
  ticketNumber: number
  subject:      string
  status:       string
}

const tickets: MinTicket[] = [
  { ticketNumber: 49,  subject: "מדפסת לא מדפיסה", status: "פתוח" },
  { ticketNumber: 494, subject: "החלפת מסך",        status: "סגור" },
  { ticketNumber: 495, subject: "התקנת Office",     status: "בטיפול" },
  { ticketNumber: 133, subject: "אין רשת בקומה 2",  status: "סגור" },
]

// ── parseTicketNumberQuery ────────────────────────────────────────────────────

describe("parseTicketNumberQuery", () => {
  it("parses a bare number", () => {
    expect(parseTicketNumberQuery("494")).toBe(494)
  })

  it("parses the HDTC- prefix in any case", () => {
    expect(parseTicketNumberQuery("HDTC-494")).toBe(494)
    expect(parseTicketNumberQuery("hdtc-494")).toBe(494)
    expect(parseTicketNumberQuery("Hdtc-494")).toBe(494)
  })

  it("tolerates space, underscore or no separator after the prefix", () => {
    expect(parseTicketNumberQuery("hdtc 494")).toBe(494)
    expect(parseTicketNumberQuery("hdtc_494")).toBe(494)
    expect(parseTicketNumberQuery("hdtc494")).toBe(494)
  })

  it("tolerates a leading # and surrounding whitespace", () => {
    expect(parseTicketNumberQuery("  #494  ")).toBe(494)
    expect(parseTicketNumberQuery("# HDTC-494")).toBe(494)
  })

  it("drops leading zeros", () => {
    expect(parseTicketNumberQuery("HDTC-0494")).toBe(494)
  })

  it("returns null for free text", () => {
    expect(parseTicketNumberQuery("מדפסת")).toBeNull()
    expect(parseTicketNumberQuery("494 מדפסת")).toBeNull()
    expect(parseTicketNumberQuery("hdtc")).toBeNull()
  })

  it("returns null for empty / whitespace-only queries", () => {
    expect(parseTicketNumberQuery("")).toBeNull()
    expect(parseTicketNumberQuery("   ")).toBeNull()
  })

  it("returns null for zero and non-integer input", () => {
    expect(parseTicketNumberQuery("0")).toBeNull()
    expect(parseTicketNumberQuery("49.4")).toBeNull()
    expect(parseTicketNumberQuery("-494")).toBeNull()
  })
})

// ── parseTicketNumberList (v3.96) ─────────────────────────────────────────────

describe("parseTicketNumberList", () => {
  it("reads a comma-separated pair", () => {
    expect(parseTicketNumberList("133,245")).toEqual([133, 245])
  })

  it("reads as many as are typed", () => {
    expect(parseTicketNumberList("133,245,49,495")).toEqual([133, 245, 49, 495])
  })

  it("accepts spaces, labels, # and a semicolon between them", () => {
    expect(parseTicketNumberList("133, 245")).toEqual([133, 245])
    expect(parseTicketNumberList("HDTC-133, REQ-245")).toEqual([133, 245])
    expect(parseTicketNumberList("#133; hdtc 245")).toEqual([133, 245])
  })

  it("keeps the order typed and names a ticket once", () => {
    expect(parseTicketNumberList("245,133,245")).toEqual([245, 133])
  })

  it("ignores empty parts, so a trailing comma is harmless", () => {
    expect(parseTicketNumberList("133,245,")).toEqual([133, 245])
    expect(parseTicketNumberList("133, ,245")).toEqual([133, 245])
  })

  // One part that is not a reference means the comma belongs to the text.
  it("is not a list when any part is free text", () => {
    expect(parseTicketNumberList("מדפסת, קומה 2")).toEqual([])
    expect(parseTicketNumberList("133, מדפסת")).toEqual([])
    expect(parseTicketNumberList("133,0")).toEqual([])
  })

  it("is not a list when only one ticket is named", () => {
    expect(parseTicketNumberList("133")).toEqual([])
    expect(parseTicketNumberList("133,")).toEqual([])
  })

  it("is not a list for an empty query", () => {
    expect(parseTicketNumberList("")).toEqual([])
    expect(parseTicketNumberList("  ")).toEqual([])
  })
})

// ── matchesTicketNumber ───────────────────────────────────────────────────────

describe("matchesTicketNumber", () => {
  it("matches the exact number", () => {
    expect(matchesTicketNumber(494, "494")).toBe(true)
  })

  it("matches a partial number (substring)", () => {
    expect(matchesTicketNumber(494, "49")).toBe(true)
    expect(matchesTicketNumber(494, "94")).toBe(true)
  })

  it("matches the HDTC- label, case-insensitively", () => {
    expect(matchesTicketNumber(494, "HDTC-494")).toBe(true)
    expect(matchesTicketNumber(494, "hdtc-49")).toBe(true)
    expect(matchesTicketNumber(494, "hdtc")).toBe(true)
  })

  it("normalizes # and separator variants", () => {
    expect(matchesTicketNumber(494, "#hdtc 494")).toBe(true)
    expect(matchesTicketNumber(494, "hdtc_494")).toBe(true)
  })

  it("does not match an unrelated number", () => {
    expect(matchesTicketNumber(494, "777")).toBe(false)
  })

  it("does not match free text", () => {
    expect(matchesTicketNumber(494, "מדפסת")).toBe(false)
  })

  it("empty query never matches", () => {
    expect(matchesTicketNumber(494, "")).toBe(false)
    expect(matchesTicketNumber(494, "   ")).toBe(false)
  })

  // v3.96 — a list names its tickets exactly: substring matching there would
  // drag HDTC-4940 in beside HDTC-494.
  describe("a list query matches the tickets it names, and only those", () => {
    it("matches each ticket named", () => {
      expect(matchesTicketNumber(133, "133,494")).toBe(true)
      expect(matchesTicketNumber(494, "133,494")).toBe(true)
      expect(matchesTicketNumber(494, "HDTC-133, REQ-494")).toBe(true)
    })

    it("does not match a ticket the list does not name", () => {
      expect(matchesTicketNumber(495, "133,494")).toBe(false)
    })

    it("does not match by substring", () => {
      expect(matchesTicketNumber(4940, "133,494")).toBe(false)
      expect(matchesTicketNumber(13, "133,494")).toBe(false)
    })
  })
})

// ── findByTicketNumber ────────────────────────────────────────────────────────

describe("findByTicketNumber", () => {
  it("finds a closed ticket by bare number", () => {
    expect(findByTicketNumber(tickets, "494")?.subject).toBe("החלפת מסך")
  })

  it("finds a ticket by its HDTC- label", () => {
    expect(findByTicketNumber(tickets, "HDTC-49")?.ticketNumber).toBe(49)
  })

  it("requires an exact number — 49 does not resolve to 494", () => {
    expect(findByTicketNumber(tickets, "49")?.ticketNumber).toBe(49)
  })

  it("returns null when no ticket carries that number", () => {
    expect(findByTicketNumber(tickets, "9999")).toBeNull()
  })

  it("returns null for free-text queries", () => {
    expect(findByTicketNumber(tickets, "מסך")).toBeNull()
  })
})

// ── withNumberSuggestion ──────────────────────────────────────────────────────

describe("withNumberSuggestion", () => {
  it("surfaces a closed ticket that the open-only filter had excluded", () => {
    const openOnly = tickets.filter(t => t.status !== "סגור")
    const { list, suggestion } = withNumberSuggestion(openOnly, tickets, "494")
    expect(suggestion?.ticketNumber).toBe(494)
    expect(list[0].ticketNumber).toBe(494)
    expect(list).toHaveLength(openOnly.length + 1)
  })

  it("surfaces a ticket the stat-card filter had excluded", () => {
    const onlyInProgress = tickets.filter(t => t.status === "בטיפול")
    const { list, suggestion } = withNumberSuggestion(onlyInProgress, tickets, "HDTC-49")
    expect(suggestion?.ticketNumber).toBe(49)
    expect(list.map(t => t.ticketNumber)).toEqual([49, 495])
  })

  it("does not duplicate a ticket already in the list", () => {
    const { list, suggestion } = withNumberSuggestion(tickets, tickets, "494")
    expect(suggestion?.ticketNumber).toBe(494)
    expect(list).toHaveLength(tickets.length)
    expect(list.filter(t => t.ticketNumber === 494)).toHaveLength(1)
  })

  it("keeps the list order untouched when the suggestion is already present", () => {
    const { list } = withNumberSuggestion(tickets, tickets, "494")
    expect(list.map(t => t.ticketNumber)).toEqual(tickets.map(t => t.ticketNumber))
  })

  it("returns the list unchanged for a free-text query", () => {
    const openOnly = tickets.filter(t => t.status !== "סגור")
    const { list, suggestion } = withNumberSuggestion(openOnly, tickets, "מסך")
    expect(suggestion).toBeNull()
    expect(list).toBe(openOnly)
  })

  it("returns the list unchanged for an empty query", () => {
    const { list, suggestion } = withNumberSuggestion(tickets, tickets, "")
    expect(suggestion).toBeNull()
    expect(list).toBe(tickets)
  })

  it("returns the list unchanged when the number matches no ticket", () => {
    const { list, suggestion } = withNumberSuggestion(tickets, tickets, "9999")
    expect(suggestion).toBeNull()
    expect(list).toBe(tickets)
  })

  // v3.96 — naming several tickets answers with exactly those.
  describe("a list query", () => {
    it("answers with the tickets named, in the order typed", () => {
      const { list, suggestion } = withNumberSuggestion(tickets, tickets, "494,133")
      expect(list.map(t => t.ticketNumber)).toEqual([494, 133])
      expect(suggestion).toBeNull()
    })

    it("reaches tickets the open-only view had dropped", () => {
      const openOnly = tickets.filter(t => t.status !== "סגור")
      const { list } = withNumberSuggestion(openOnly, tickets, "133,494")
      expect(list.map(t => t.ticketNumber)).toEqual([133, 494])
    })

    it("leaves out a number that matches no ticket, and keeps the rest", () => {
      const { list } = withNumberSuggestion(tickets, tickets, "133,9999,495")
      expect(list.map(t => t.ticketNumber)).toEqual([133, 495])
    })

    it("answers with nothing when none of the numbers exist", () => {
      const { list } = withNumberSuggestion(tickets, tickets, "9998,9999")
      expect(list).toEqual([])
    })
  })
})

// ── Page-level integration: mirrors the admin/tickets useMemo pipeline ────────

describe("search pipeline — number query beats the status scope", () => {
  /** Mirrors the filter step used on the admin + staff ticket pages. */
  function pageFilter(showAll: boolean, query: string) {
    let list = showAll ? tickets : tickets.filter(t => t.status !== "סגור")
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(t =>
        matchesTicketNumber(t.ticketNumber, q) ||
        t.subject.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      )
    }
    return withNumberSuggestion(list, tickets, query)
  }

  it("finds a closed ticket by number while the view shows open tickets only", () => {
    const { list, suggestion } = pageFilter(false, "494")
    expect(suggestion?.status).toBe("סגור")
    expect(list.map(t => t.ticketNumber)).toContain(494)
  })

  it("finds the same closed ticket in the 'all' view without duplicating it", () => {
    const { list, suggestion } = pageFilter(true, "494")
    expect(suggestion?.ticketNumber).toBe(494)
    expect(list.filter(t => t.ticketNumber === 494)).toHaveLength(1)
  })

  it("a partial number still filters normally alongside the suggestion", () => {
    const { list, suggestion } = pageFilter(true, "49")
    // "49" is an exact match for ticket 49, so it is also the suggestion
    expect(suggestion?.ticketNumber).toBe(49)
    // substring matching keeps 494 and 495 in the list too
    expect(list.map(t => t.ticketNumber).sort((a, b) => a - b)).toEqual([49, 494, 495])
  })

  it("free-text search is unaffected by the number logic", () => {
    const { list, suggestion } = pageFilter(true, "מסך")
    expect(suggestion).toBeNull()
    expect(list.map(t => t.ticketNumber)).toEqual([494])
  })

  // v3.96 — the case the user asked for: two closed tickets, named together,
  // while the page is showing open tickets only.
  it("shows every ticket a list names, whatever the view is scoped to", () => {
    const { list, suggestion } = pageFilter(false, "133,494")
    expect(list.map(t => t.ticketNumber)).toEqual([133, 494])
    expect(suggestion).toBeNull()
  })

  it("a comma inside free text is still free text", () => {
    const { list } = pageFilter(true, "מסך, החלפת")
    expect(list).toEqual([])
  })
})
