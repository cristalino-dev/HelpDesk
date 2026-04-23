/**
 * __tests__/dashboardSearch.test.ts
 *
 * Unit tests for the dashboard displayTickets filter logic (app/dashboard/page.tsx).
 *
 * The logic is pure derived state (useMemo), so we test it as a plain function
 * that mirrors the exact implementation:
 *   1. Apply statusFilter (exact status match, or null → all tickets)
 *   2. Apply free-text search across every searchable field
 */

// Make this file a module so its declarations don't collide with other test files.
export {}

// ── Types ──────────────────────────────────────────────────────────────────────

interface MinTicket {
  ticketNumber: number
  subject:      string
  description:  string
  status:       string
  urgency:      string
  category:     string
  platform:     string
  computerName: string
  phone:        string
  createdAt:    string
  updatedAt:    string
}

// ── Pure helper mirroring the useMemo in dashboard/page.tsx ───────────────────

function applyDashboardFilter(
  tickets: MinTicket[],
  statusFilter: string | null,
  search: string,
): MinTicket[] {
  let list = statusFilter ? tickets.filter(t => t.status === statusFilter) : tickets
  const q = search.trim().toLowerCase()
  if (q) {
    list = list.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q) ||
      t.urgency.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.platform.toLowerCase().includes(q) ||
      t.computerName.toLowerCase().includes(q) ||
      t.phone.toLowerCase().includes(q) ||
      String(t.ticketNumber).includes(q) ||
      new Date(t.createdAt).toLocaleDateString("he-IL").includes(q)
    )
  }
  return list
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const tickets: MinTicket[] = [
  {
    ticketNumber: 1,
    subject:      "המדפסת לא מדפיסה",
    description:  "הודעת שגיאה 0x00000709",
    status:       "פתוח",
    urgency:      "דחוף",
    category:     "מדפסת",
    platform:     "מחשב אישי",
    computerName: "PC-ALON-01",
    phone:        "050-1111111",
    createdAt:    "2026-04-01T10:00:00.000Z",
    updatedAt:    "2026-04-01T10:00:00.000Z",
  },
  {
    ticketNumber: 2,
    subject:      "שגיאה בהתחברות לרשת",
    description:  "לא מתחבר ל-VPN",
    status:       "בטיפול",
    urgency:      "גבוה",
    category:     "רשת",
    platform:     "מחשב אישי",
    computerName: "PC-SARA-02",
    phone:        "050-2222222",
    createdAt:    "2026-04-10T08:30:00.000Z",
    updatedAt:    "2026-04-15T12:00:00.000Z",
  },
  {
    ticketNumber: 3,
    subject:      "בקשת התקנת תוכנה",
    description:  "צריך Adobe Reader",
    status:       "סגור",
    urgency:      "נמוך",
    category:     "תוכנה",
    platform:     "comax",
    computerName: "PC-DAN-03",
    phone:        "050-3333333",
    createdAt:    "2026-03-15T14:00:00.000Z",
    updatedAt:    "2026-03-20T09:00:00.000Z",
  },
  {
    ticketNumber: 4,
    subject:      "בעיה בפתיחת Outlook",
    description:  "Outlook קורס בהפעלה",
    status:       "פתוח",
    urgency:      "בינוני",
    category:     "תוכנה",
    platform:     "מחשב אישי",
    computerName: "PC-MIRI-04",
    phone:        "050-4444444",
    createdAt:    "2026-04-20T09:15:00.000Z",
    updatedAt:    "2026-04-20T09:15:00.000Z",
  },
]

// ── No filter, no search ───────────────────────────────────────────────────────

describe("applyDashboardFilter — no filters", () => {
  it("null statusFilter + empty search returns all tickets", () => {
    expect(applyDashboardFilter(tickets, null, "")).toHaveLength(4)
  })

  it("whitespace-only search is treated as empty (returns all)", () => {
    expect(applyDashboardFilter(tickets, null, "   ")).toHaveLength(4)
  })
})

// ── statusFilter only ─────────────────────────────────────────────────────────

describe("applyDashboardFilter — statusFilter only", () => {
  it('"פתוח" returns only open tickets', () => {
    const result = applyDashboardFilter(tickets, "פתוח", "")
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === "פתוח")).toBe(true)
  })

  it('"בטיפול" returns only in-progress tickets', () => {
    const result = applyDashboardFilter(tickets, "בטיפול", "")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("בטיפול")
  })

  it('"סגור" returns only closed tickets', () => {
    const result = applyDashboardFilter(tickets, "סגור", "")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("סגור")
  })

  it("unknown statusFilter value returns empty list", () => {
    expect(applyDashboardFilter(tickets, "לא קיים", "")).toHaveLength(0)
  })
})

// ── Free-text search only ─────────────────────────────────────────────────────

describe("applyDashboardFilter — search only", () => {
  it("searches by subject", () => {
    const result = applyDashboardFilter(tickets, null, "מדפסת")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(1)
  })

  it("searches by description", () => {
    const result = applyDashboardFilter(tickets, null, "adobe")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(3)
  })

  it("searches by status", () => {
    const result = applyDashboardFilter(tickets, null, "בטיפול")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("בטיפול")
  })

  it("searches by urgency", () => {
    const result = applyDashboardFilter(tickets, null, "דחוף")
    expect(result).toHaveLength(1)
    expect(result[0].urgency).toBe("דחוף")
  })

  it("searches by category", () => {
    const result = applyDashboardFilter(tickets, null, "רשת")
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe("רשת")
  })

  it("searches by platform", () => {
    // "comax" matches only ticket 3
    const result = applyDashboardFilter(tickets, null, "comax")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(3)
  })

  it("searches by computerName", () => {
    const result = applyDashboardFilter(tickets, null, "PC-SARA")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(2)
  })

  it("searches by phone number", () => {
    const result = applyDashboardFilter(tickets, null, "050-4444444")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(4)
  })

  it("searches by ticket number (numeric string)", () => {
    const result = applyDashboardFilter(tickets, null, "3")
    // ticketNumber 3; also ticketNumber 3 and 4's phone contains "3"?
    // ticket 3: phone "050-3333333" contains "3"; ticket 4: "050-4444444"; etc.
    // Let's just verify ticket 3 is included
    expect(result.some(t => t.ticketNumber === 3)).toBe(true)
  })

  it("search is case-insensitive (latin)", () => {
    const result = applyDashboardFilter(tickets, null, "OUTLOOK")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(4)
  })

  it("no match returns empty list", () => {
    expect(applyDashboardFilter(tickets, null, "xxxxxx")).toHaveLength(0)
  })

  it("partial match works across multiple tickets", () => {
    // "תוכנה" is the category for tickets 3 and 4
    const result = applyDashboardFilter(tickets, null, "תוכנה")
    expect(result).toHaveLength(2)
    expect(result.map(t => t.ticketNumber).sort()).toEqual([3, 4])
  })
})

// ── statusFilter + search combined ────────────────────────────────────────────

describe("applyDashboardFilter — statusFilter + search combined", () => {
  it("statusFilter applied first, then search narrows within that set", () => {
    // Open tickets: 1 (מדפסת) and 4 (Outlook)
    // Search "outlook" inside open → only ticket 4
    const result = applyDashboardFilter(tickets, "פתוח", "outlook")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(4)
  })

  it("search that matches a closed ticket is excluded when statusFilter is 'פתוח'", () => {
    // "adobe" only in ticket 3 (סגור) — should be excluded when filtering for פתוח
    const result = applyDashboardFilter(tickets, "פתוח", "adobe")
    expect(result).toHaveLength(0)
  })

  it("combined filter can return multiple results", () => {
    // מחשב אישי platform appears in tickets 1, 2, 4 — but status פתוח is only 1 and 4
    const result = applyDashboardFilter(tickets, "פתוח", "מחשב אישי")
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === "פתוח")).toBe(true)
  })

  it("statusFilter 'סגור' + search 'תוכנה' returns the one closed תוכנה ticket", () => {
    const result = applyDashboardFilter(tickets, "סגור", "תוכנה")
    expect(result).toHaveLength(1)
    expect(result[0].ticketNumber).toBe(3)
    expect(result[0].status).toBe("סגור")
  })
})
