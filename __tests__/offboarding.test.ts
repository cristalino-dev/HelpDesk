/**
 * __tests__/offboarding.test.ts
 *
 * Unit tests for lib/offboarding.ts — the leaving-employee return checklist.
 *
 * The behaviours that matter:
 *   - the checklist is the WHOLE gear list, not a selection, and never contains
 *     a duplicate that would violate the unique (ticketId, label) constraint
 *   - a ticket with anything still outstanding cannot be closed
 *   - only offboarding tickets are ever blocked; nothing else changes
 */

export {}

import {
  LEAVING_EMPLOYEE_CATEGORY,
  isOffboarding,
  offboardingChecklist,
  offboardingBlockers,
  canCloseTicket,
  blockerMessage,
} from "@/lib/offboarding"
import { NEW_EMPLOYEE_CATEGORY, DEFAULT_EQUIPMENT } from "@/lib/equipment"

const line = (label: string, quantity: number, receivedQty: number) => ({ label, quantity, receivedQty })

// ── Category ─────────────────────────────────────────────────────────────────

describe("the offboarding category", () => {
  it("is the Hebrew label the UI and the close guard match on", () => {
    expect(LEAVING_EMPLOYEE_CATEGORY).toBe("עובד עוזב")
  })

  it("is not the onboarding category", () => {
    expect(LEAVING_EMPLOYEE_CATEGORY).not.toBe(NEW_EMPLOYEE_CATEGORY)
    expect(isOffboarding(NEW_EMPLOYEE_CATEGORY)).toBe(false)
  })

  it("recognises an offboarding ticket", () => {
    expect(isOffboarding(LEAVING_EMPLOYEE_CATEGORY)).toBe(true)
  })

  it("treats a missing category as an ordinary ticket", () => {
    expect(isOffboarding(undefined)).toBe(false)
    expect(isOffboarding(null)).toBe(false)
    expect(isOffboarding("")).toBe(false)
  })
})

// ── offboardingChecklist ─────────────────────────────────────────────────────

describe("offboardingChecklist", () => {
  it("lists every item on the gear list, once each", () => {
    // Nobody is asked what the leaver has — the whole list is put in front of
    // the technician, accounts included.
    const checklist = offboardingChecklist(DEFAULT_EQUIPMENT)
    expect(checklist.map(l => l.label)).toEqual(DEFAULT_EQUIPMENT)
  })

  it("includes the account items, which are never queried from anywhere", () => {
    const labels = offboardingChecklist(DEFAULT_EQUIPMENT).map(l => l.label)
    expect(labels).toContain("חשבון Gmail")
    expect(labels).toContain("חשבון Zoho")
    expect(labels).toContain("משתמש קומקס")
  })

  it("asks for one of each", () => {
    expect(offboardingChecklist(["מסך", "עכבר"]))
      .toEqual([{ label: "מסך", quantity: 1 }, { label: "עכבר", quantity: 1 }])
  })

  it("collapses duplicates — the DB is unique on (ticketId, label)", () => {
    expect(offboardingChecklist(["מסך", "מסך", " מסך "]))
      .toEqual([{ label: "מסך", quantity: 1 }])
  })

  it("trims labels and drops blank ones", () => {
    expect(offboardingChecklist(["  מסך  ", "", "   "]))
      .toEqual([{ label: "מסך", quantity: 1 }])
  })

  it("survives an empty or junk option list", () => {
    expect(offboardingChecklist([])).toEqual([])
    expect(offboardingChecklist(undefined as unknown as string[])).toEqual([])
  })
})

// ── offboardingBlockers ──────────────────────────────────────────────────────

describe("offboardingBlockers", () => {
  const lines = [
    line("מחשב נייד", 1, 1),
    line("מסך", 2, 1),
    line("חשבון Gmail", 1, 0),
  ]

  it("names every line that is not fully accounted for", () => {
    expect(offboardingBlockers(lines)).toEqual(["מסך", "חשבון Gmail"])
  })

  it("is empty once everything is ticked", () => {
    expect(offboardingBlockers([line("מחשב נייד", 1, 1), line("מסך", 2, 2)])).toEqual([])
  })

  it("is empty for a ticket with no lines at all", () => {
    expect(offboardingBlockers([])).toEqual([])
  })

  it("does not count an over-ticked line as a blocker", () => {
    expect(offboardingBlockers([line("מסך", 1, 5)])).toEqual([])
  })
})

// ── canCloseTicket ───────────────────────────────────────────────────────────

describe("canCloseTicket", () => {
  const outstanding = [line("מחשב נייד", 1, 0)]
  const settled     = [line("מחשב נייד", 1, 1)]

  it("blocks an offboarding ticket with an unticked item", () => {
    expect(canCloseTicket(LEAVING_EMPLOYEE_CATEGORY, outstanding)).toBe(false)
  })

  it("releases it once every line is ticked", () => {
    expect(canCloseTicket(LEAVING_EMPLOYEE_CATEGORY, settled)).toBe(true)
  })

  it("allows closing an offboarding ticket whose checklist was emptied", () => {
    // Removing every line is an explicit "there is nothing to return".
    expect(canCloseTicket(LEAVING_EMPLOYEE_CATEGORY, [])).toBe(true)
  })

  it("never blocks an ordinary ticket, however much equipment is outstanding", () => {
    expect(canCloseTicket("אחר", outstanding)).toBe(true)
  })

  it("never blocks an onboarding ticket — a kit can arrive after closure", () => {
    expect(canCloseTicket(NEW_EMPLOYEE_CATEGORY, outstanding)).toBe(true)
  })
})

// ── blockerMessage ───────────────────────────────────────────────────────────

describe("blockerMessage", () => {
  it("names what is still missing", () => {
    const message = blockerMessage(["מסך", "חשבון Gmail"])
    expect(message).toContain("מסך")
    expect(message).toContain("חשבון Gmail")
    expect(message).toContain("לא ניתן לסגור")
  })

  it("is empty when nothing blocks the closure", () => {
    expect(blockerMessage([])).toBe("")
  })
})
