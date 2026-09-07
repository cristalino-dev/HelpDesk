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
  suggestsOffboarding,
  OFFBOARDING_PHRASES,
} from "@/lib/offboarding"
import { NEW_EMPLOYEE_CATEGORY, DEFAULT_EQUIPMENT } from "@/lib/equipment"

const line = (label: string, quantity: number, receivedQty: number) => ({ label, quantity, receivedQty })

// ── Category ─────────────────────────────────────────────────────────────────

describe("the offboarding category", () => {
  it("is the Hebrew label the UI and the close guard match on", () => {
    // Pinned deliberately. This string is stored on every offboarding ticket
    // and as the dropdown option, so changing it is a data migration, not a
    // rename — see 20260906120000_rename_leaving_employee_category, which moved
    // it here from "עובד עוזב". A silent edit must fail loudly.
    expect(LEAVING_EMPLOYEE_CATEGORY).toBe("סגירת משתמש")
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


describe("spotting an offboarding in what the person typed", () => {
  /**
   * The category is a dropdown nobody reads. Tickets that are plainly an
   * offboarding get filed as אחר, and the checklist that would have caught the
   * Zoho seat is never built. This is what lets the form offer the right
   * category while they are still describing the job.
   */
  it("matches the two phrasings people actually use", () => {
    expect(suggestsOffboarding("סגירת משתמש ליוסי")).toBe(true)
    expect(suggestsOffboarding("סגירת יוזר של דנה")).toBe(true)
  })

  it("still matches the name this category had until v3.74", () => {
    // People will type "עובד עוזב" for a long time yet.
    expect(suggestsOffboarding("עובד עוזב - צריך לאסוף ציוד")).toBe(true)
  })

  it("reads the description too, not only the subject", () => {
    expect(suggestsOffboarding("תקלה", "העובד מסיים עבודה ביום חמישי")).toBe(true)
  })

  it("ignores case and stray whitespace", () => {
    expect(suggestsOffboarding("  Close   User  ")).toBe(true)
    expect(suggestsOffboarding("סגירת\n משתמש")).toBe(true)
  })

  it("does NOT fire on the word סגירה alone — the whole point of phrase matching", () => {
    // A hint that fires on noise is one people dismiss without reading.
    expect(suggestsOffboarding("סגירת הפנייה")).toBe(false)
    expect(suggestsOffboarding("סגירת חלון בדפדפן")).toBe(false)
    expect(suggestsOffboarding("המסך נשרט")).toBe(false)
  })

  it("does not fire on empty or missing text", () => {
    expect(suggestsOffboarding("")).toBe(false)
    expect(suggestsOffboarding("   ")).toBe(false)
    expect(suggestsOffboarding(null, undefined)).toBe(false)
    expect(suggestsOffboarding()).toBe(false)
  })

  it("every configured phrase actually matches itself", () => {
    for (const phrase of OFFBOARDING_PHRASES) {
      expect(suggestsOffboarding(`בבקשה ${phrase} בהקדם`)).toBe(true)
    }
  })
})
