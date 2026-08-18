/**
 * __tests__/equipment.test.ts
 *
 * Unit tests for lib/equipment.ts — the equipment request/receipt logic shared
 * by the ticket form, the ticket detail checklist and the admin shortage tab.
 *
 * The behaviours that matter:
 *   - an untrusted payload can never store junk (blank labels, invented items,
 *     absurd quantities, duplicate lines)
 *   - a technician can never mark more units received than were requested
 *   - the shortage report shows exactly what is still owed, grouped per item
 */

export {}

import {
  NEW_EMPLOYEE_CATEGORY,
  DEFAULT_EQUIPMENT,
  MAX_QUANTITY,
  normalizeSelection,
  clampReceived,
  outstandingOf,
  isFullyReceived,
  equipmentProgress,
  aggregateShortage,
  totalOutstanding,
  formatSupplierText,
  type EquipmentLineWithTicket,
} from "@/lib/equipment"

// ── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("the onboarding category is the Hebrew label the UI matches on", () => {
    expect(NEW_EMPLOYEE_CATEGORY).toBe("עובד חדש")
  })

  it("the default item list covers the core onboarding kit", () => {
    for (const item of ["מחשב", "מסך", "מסך שני", "עכבר", "מקלדת", "תחנת עגינה", "חשבון Gmail", "חשבון Zoho"]) {
      expect(DEFAULT_EQUIPMENT).toContain(item)
    }
  })

  it("default items are unique", () => {
    expect(new Set(DEFAULT_EQUIPMENT).size).toBe(DEFAULT_EQUIPMENT.length)
  })
})

// ── normalizeSelection ───────────────────────────────────────────────────────

describe("normalizeSelection", () => {
  it("keeps valid lines as-is", () => {
    expect(normalizeSelection([{ label: "מסך", quantity: 2 }]))
      .toEqual([{ label: "מסך", quantity: 2 }])
  })

  it("defaults a missing or invalid quantity to 1", () => {
    expect(normalizeSelection([{ label: "מסך" }])).toEqual([{ label: "מסך", quantity: 1 }])
    expect(normalizeSelection([{ label: "מסך", quantity: "abc" }])).toEqual([{ label: "מסך", quantity: 1 }])
  })

  it("clamps quantities into 1..MAX_QUANTITY", () => {
    expect(normalizeSelection([{ label: "מסך", quantity: 0 }])[0].quantity).toBe(1)
    expect(normalizeSelection([{ label: "מסך", quantity: -5 }])[0].quantity).toBe(1)
    expect(normalizeSelection([{ label: "מסך", quantity: 5000 }])[0].quantity).toBe(MAX_QUANTITY)
  })

  it("truncates fractional quantities", () => {
    expect(normalizeSelection([{ label: "מסך", quantity: 2.9 }])[0].quantity).toBe(2)
  })

  it("trims labels and drops blank ones", () => {
    const result = normalizeSelection([
      { label: "  מסך  ", quantity: 1 },
      { label: "   ", quantity: 1 },
      { label: "", quantity: 1 },
    ])
    expect(result).toEqual([{ label: "מסך", quantity: 1 }])
  })

  it("merges duplicate labels by summing quantities", () => {
    // The DB has a unique (ticketId, label) constraint — duplicates would throw.
    const result = normalizeSelection([
      { label: "מסך", quantity: 1 },
      { label: "מסך", quantity: 2 },
    ])
    expect(result).toEqual([{ label: "מסך", quantity: 3 }])
  })

  it("caps a merged duplicate at MAX_QUANTITY", () => {
    const result = normalizeSelection([
      { label: "מסך", quantity: MAX_QUANTITY },
      { label: "מסך", quantity: MAX_QUANTITY },
    ])
    expect(result[0].quantity).toBe(MAX_QUANTITY)
  })

  it("rejects items outside the allowed list", () => {
    const result = normalizeSelection(
      [{ label: "מסך", quantity: 1 }, { label: "מכונית", quantity: 1 }],
      ["מסך", "עכבר"],
    )
    expect(result).toEqual([{ label: "מסך", quantity: 1 }])
  })

  it("accepts anything when no allow-list is given", () => {
    expect(normalizeSelection([{ label: "פריט מותאם", quantity: 1 }]))
      .toEqual([{ label: "פריט מותאם", quantity: 1 }])
  })

  it("returns an empty list for non-array or junk input", () => {
    expect(normalizeSelection(undefined)).toEqual([])
    expect(normalizeSelection(null)).toEqual([])
    expect(normalizeSelection("מסך")).toEqual([])
    expect(normalizeSelection([null, 42, "x"])).toEqual([])
  })
})

// ── clampReceived ────────────────────────────────────────────────────────────

describe("clampReceived", () => {
  it("passes a value inside the range through", () => {
    expect(clampReceived(2, 3)).toBe(2)
  })

  it("never exceeds the requested quantity", () => {
    expect(clampReceived(99, 3)).toBe(3)
  })

  it("never goes below zero", () => {
    expect(clampReceived(-4, 3)).toBe(0)
  })

  it("treats junk as zero", () => {
    expect(clampReceived("abc", 3)).toBe(0)
    expect(clampReceived(undefined, 3)).toBe(0)
  })
})

// ── Per-line helpers ─────────────────────────────────────────────────────────

describe("outstandingOf / isFullyReceived", () => {
  it("reports the missing units", () => {
    expect(outstandingOf({ label: "מסך", quantity: 3, receivedQty: 1 })).toBe(2)
  })

  it("is zero once everything arrived", () => {
    const line = { label: "מסך", quantity: 2, receivedQty: 2 }
    expect(outstandingOf(line)).toBe(0)
    expect(isFullyReceived(line)).toBe(true)
  })

  it("never returns a negative shortfall", () => {
    expect(outstandingOf({ label: "מסך", quantity: 1, receivedQty: 5 })).toBe(0)
  })
})

// ── equipmentProgress ────────────────────────────────────────────────────────

describe("equipmentProgress", () => {
  const lines = [
    { label: "מחשב", quantity: 1, receivedQty: 1 },
    { label: "מסך",  quantity: 2, receivedQty: 1 },
    { label: "עכבר", quantity: 1, receivedQty: 0 },
  ]

  it("totals requested and received units", () => {
    const p = equipmentProgress(lines)
    expect(p.requested).toBe(4)
    expect(p.received).toBe(2)
    expect(p.outstanding).toBe(2)
  })

  it("counts fully-received lines", () => {
    const p = equipmentProgress(lines)
    expect(p.linesTotal).toBe(3)
    expect(p.linesDone).toBe(1)
    expect(p.complete).toBe(false)
  })

  it("is complete only when every line is done", () => {
    const p = equipmentProgress([
      { label: "מחשב", quantity: 1, receivedQty: 1 },
      { label: "מסך",  quantity: 2, receivedQty: 2 },
    ])
    expect(p.complete).toBe(true)
    expect(p.outstanding).toBe(0)
  })

  it("an empty checklist is not 'complete'", () => {
    const p = equipmentProgress([])
    expect(p.complete).toBe(false)
    expect(p.requested).toBe(0)
  })

  it("ignores an over-received line when totalling", () => {
    const p = equipmentProgress([{ label: "מסך", quantity: 1, receivedQty: 9 }])
    expect(p.received).toBe(1)
    expect(p.outstanding).toBe(0)
  })
})

// ── aggregateShortage ────────────────────────────────────────────────────────

const rows: EquipmentLineWithTicket[] = [
  // HDTC-501 — onboarding, nothing arrived
  { label: "מסך",  quantity: 2, receivedQty: 0, ticketNumber: 501, ticketSubject: "עובד חדש דני", ticketStatus: "פתוח" },
  { label: "מחשב", quantity: 1, receivedQty: 0, ticketNumber: 501, ticketSubject: "עובד חדש דני", ticketStatus: "פתוח" },
  // HDTC-506 — existing employee wants a screen; partially delivered
  { label: "מסך",  quantity: 3, receivedQty: 1, ticketNumber: 506, ticketSubject: "מסך למוניטור", ticketStatus: "בטיפול" },
  // HDTC-510 — fully supplied, must not appear at all
  { label: "עכבר", quantity: 1, receivedQty: 1, ticketNumber: 510, ticketSubject: "עכבר חדש", ticketStatus: "בטיפול" },
]

describe("aggregateShortage", () => {
  it("groups outstanding units by item", () => {
    const items = aggregateShortage(rows)
    const screens = items.find(i => i.label === "מסך")
    expect(screens?.outstanding).toBe(4) // 2 from HDTC-501 + 2 from HDTC-506
    expect(screens?.requested).toBe(5)
    expect(screens?.received).toBe(1)
  })

  it("drops items that are fully received", () => {
    expect(aggregateShortage(rows).some(i => i.label === "עכבר")).toBe(false)
  })

  it("sorts most-missing first", () => {
    expect(aggregateShortage(rows).map(i => i.label)).toEqual(["מסך", "מחשב"])
  })

  it("keeps the tickets waiting for each item, ordered by number", () => {
    const screens = aggregateShortage(rows).find(i => i.label === "מסך")!
    expect(screens.tickets.map(t => t.ticketNumber)).toEqual([501, 506])
    expect(screens.tickets[1]).toMatchObject({ subject: "מסך למוניטור", status: "בטיפול", outstanding: 2 })
  })

  it("covers equipment on ordinary tickets, not just onboarding ones", () => {
    // HDTC-506 is category אחר in real life — the report must still see it.
    const screens = aggregateShortage(rows).find(i => i.label === "מסך")!
    expect(screens.tickets.some(t => t.ticketNumber === 506)).toBe(true)
  })

  it("returns an empty report when nothing is outstanding", () => {
    expect(aggregateShortage([rows[3]])).toEqual([])
  })

  it("handles an empty input", () => {
    expect(aggregateShortage([])).toEqual([])
  })
})

// ── totalOutstanding / formatSupplierText ────────────────────────────────────

describe("totalOutstanding", () => {
  it("sums every item's shortfall", () => {
    expect(totalOutstanding(aggregateShortage(rows))).toBe(5) // 4 screens + 1 computer
  })

  it("is zero for an empty report", () => {
    expect(totalOutstanding([])).toBe(0)
  })
})

describe("formatSupplierText", () => {
  it("lists each item with its missing count", () => {
    const text = formatSupplierText(aggregateShortage(rows))
    expect(text).toContain("מסך — 4")
    expect(text).toContain("מחשב — 1")
  })

  it("includes the grand total", () => {
    expect(formatSupplierText(aggregateShortage(rows))).toContain('סה"כ פריטים: 5')
  })

  it("never mentions a fully-supplied item", () => {
    expect(formatSupplierText(aggregateShortage(rows))).not.toContain("עכבר")
  })

  it("says so plainly when nothing is missing", () => {
    expect(formatSupplierText([])).toBe("אין ציוד חסר.")
  })

  it("produces plain text with no markdown decoration", () => {
    const text = formatSupplierText(aggregateShortage(rows))
    expect(text).not.toMatch(/[|*_#]/)
  })
})
