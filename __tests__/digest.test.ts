/**
 * __tests__/digest.test.ts
 *
 * Tests for mailDailyDigest() — verifies that the HTML output contains the
 * right ticket data, urgency badges, stale indicators, and summary cards.
 * Does NOT call any database or send any email.
 */

import { mailDailyDigest } from "@/lib/mail"

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date("2026-04-21T09:00:00.000Z")

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW.getTime())
})

afterEach(() => {
  jest.useRealTimers()
})

const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const makeTicket = (overrides: Partial<{
  ticketNumber: number
  subject: string
  urgency: string
  status: string
  createdAt: string
  user: { name: string | null; email: string | null }
}> = {}) => ({
  ticketNumber: 1,
  subject: "בעיית רשת",
  urgency: "בינוני",
  status: "פתוח",
  createdAt: daysAgo(1),
  user: { name: "אלון כרם", email: "alon@cristalino.co.il" },
  ...overrides,
})

// ── basic rendering ───────────────────────────────────────────────────────────

describe("mailDailyDigest", () => {
  it("returns a non-empty HTML string", () => {
    const html = mailDailyDigest([makeTicket()])
    expect(typeof html).toBe("string")
    expect(html.length).toBeGreaterThan(100)
  })

  it("includes the ticket number and subject", () => {
    const html = mailDailyDigest([makeTicket({ ticketNumber: 42, subject: "נושא ייחודי לבדיקה" })])
    expect(html).toContain("HDTC-42")
    expect(html).toContain("נושא ייחודי לבדיקה")
  })

  it("includes the submitter name", () => {
    const html = mailDailyDigest([makeTicket({ user: { name: "דניאל לוי", email: "d@c.co.il" } })])
    expect(html).toContain("דניאל לוי")
  })

  it("falls back to email when name is null", () => {
    const html = mailDailyDigest([makeTicket({ user: { name: null, email: "user@c.co.il" } })])
    expect(html).toContain("user@c.co.il")
  })

  it("shows a dash when user is null", () => {
    const html = mailDailyDigest([makeTicket({ user: undefined })])
    expect(html).toContain("—")
  })

  it("contains the urgency badge text", () => {
    const html = mailDailyDigest([makeTicket({ urgency: "דחוף" })])
    expect(html).toContain("דחוף")
  })

  // ── summary cards ───────────────────────────────────────────────────────────

  it("shows the total open-ticket count in the summary", () => {
    const tickets = [makeTicket({ ticketNumber: 1 }), makeTicket({ ticketNumber: 2 })]
    const html = mailDailyDigest(tickets)
    expect(html).toContain("2")          // total count somewhere in HTML
    expect(html).toContain("סה״כ פתוחות")
  })

  it("shows the urgent card when there are urgent tickets", () => {
    const html = mailDailyDigest([makeTicket({ urgency: "דחוף" })])
    expect(html).toContain("🔴")
  })

  it("does not show the urgent card when no urgent tickets", () => {
    const html = mailDailyDigest([makeTicket({ urgency: "נמוך" })])
    expect(html).not.toContain("🔴")
  })

  it("shows the stale card when a ticket is older than 4 days", () => {
    const html = mailDailyDigest([makeTicket({ createdAt: daysAgo(5) })])
    expect(html).toContain("4+ ימים")
  })

  it("does not show the stale card when no ticket is stale", () => {
    const html = mailDailyDigest([makeTicket({ createdAt: daysAgo(1) })])
    expect(html).not.toContain("4+ ימים")
  })

  // ── stale row indicator ─────────────────────────────────────────────────────

  it("marks a stale ticket row with ⏰ and an orange background", () => {
    const html = mailDailyDigest([makeTicket({ createdAt: daysAgo(5) })])
    expect(html).toContain("⏰")
    expect(html).toContain("#fff8f0")   // stale row background colour
  })

  it("does not add ⏰ for a recent ticket", () => {
    const html = mailDailyDigest([makeTicket({ createdAt: daysAgo(2) })])
    expect(html).not.toContain("⏰")
  })

  // ── priority ordering ───────────────────────────────────────────────────────

  it("renders דחוף tickets before נמוך tickets in the table", () => {
    const tickets = [
      makeTicket({ ticketNumber: 10, urgency: "נמוך",  subject: "נמוך ראשון" }),
      makeTicket({ ticketNumber: 11, urgency: "דחוף", subject: "דחוף ראשון" }),
    ]
    const html = mailDailyDigest(tickets)
    const posUrgent = html.indexOf("HDTC-11")
    const posLow    = html.indexOf("HDTC-10")
    expect(posUrgent).toBeLessThan(posLow)
  })

  // ── empty list ──────────────────────────────────────────────────────────────

  it("handles an empty ticket array without throwing", () => {
    expect(() => mailDailyDigest([])).not.toThrow()
    const html = mailDailyDigest([])
    expect(html).toContain("0")
  })
})
