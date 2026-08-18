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
    expect(list.map(t => t.ticketNumber)).toEqual([49, 494, 495])
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
})
