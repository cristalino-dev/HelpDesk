/**
 * __tests__/mailIngest.test.ts
 *
 * Unit tests for lib/mailIngest.ts — the email-to-ticket logic.
 *
 * Covers:
 *   - hasTicketKeyword: case-insensitive subject matching, default + custom keyword
 *   - stripTicketKeyword: keyword removal + whitespace/separator tidy-up
 *   - buildIngestedTicket: urgent default, description from body, reporter
 *     resolution, and all the fallback paths
 */

import {
  hasTicketKeyword,
  stripTicketKeyword,
  buildIngestedTicket,
  DEFAULT_TICKET_KEYWORD,
  INGEST_DEFAULTS,
  INGEST_FALLBACK_EMAIL,
} from "@/lib/mailIngest"

describe("hasTicketKeyword", () => {
  it("matches the keyword case-insensitively anywhere in the subject", () => {
    expect(hasTicketKeyword("New Ticket: printer down")).toBe(true)
    expect(hasTicketKeyword("URGENT TICKET")).toBe(true)
    expect(hasTicketKeyword("please open a ticket for me")).toBe(true)
  })

  it("returns false when the keyword is absent", () => {
    expect(hasTicketKeyword("printer is broken")).toBe(false)
    expect(hasTicketKeyword("בעיה במחשב")).toBe(false)
  })

  it("returns false for empty/nullish subjects", () => {
    expect(hasTicketKeyword("")).toBe(false)
    expect(hasTicketKeyword(null)).toBe(false)
    expect(hasTicketKeyword(undefined)).toBe(false)
  })

  it("supports a custom keyword", () => {
    expect(hasTicketKeyword("נא לפתוח כרטיס תקלה", "כרטיס")).toBe(true)
    expect(hasTicketKeyword("hello world", "כרטיס")).toBe(false)
  })
})

describe("stripTicketKeyword", () => {
  it("removes the keyword and tidies leading/trailing separators", () => {
    expect(stripTicketKeyword("Ticket: printer down")).toBe("printer down")
    expect(stripTicketKeyword("printer down - ticket")).toBe("printer down")
    expect(stripTicketKeyword("[ticket] keyboard broken")).toBe("[ ] keyboard broken") // brackets are preserved
  })

  it("removes multiple occurrences and collapses whitespace", () => {
    expect(stripTicketKeyword("ticket ticket printer ticket")).toBe("printer")
  })

  it("is case-insensitive", () => {
    expect(stripTicketKeyword("TICKET network issue")).toBe("network issue")
  })

  it("returns empty string when only the keyword was present", () => {
    expect(stripTicketKeyword("ticket")).toBe("")
    expect(stripTicketKeyword(":: ticket ::")).toBe("")
  })

  it("preserves Hebrew subject text around the keyword", () => {
    expect(stripTicketKeyword("ticket בעיה במדפסת")).toBe("בעיה במדפסת")
  })

  it("returns '' for nullish input", () => {
    expect(stripTicketKeyword(null)).toBe("")
    expect(stripTicketKeyword(undefined)).toBe("")
  })
})

describe("buildIngestedTicket", () => {
  it("creates an URGENT ticket with default category/platform and empty phone/computer", () => {
    const t = buildIngestedTicket({
      subject: "Ticket: VPN not connecting",
      text: "I cannot connect to the VPN since this morning.",
      fromName: "Hana Dan",
      fromEmail: "hana@cristalino.co.il",
    })
    expect(t.subject).toBe("VPN not connecting")
    expect(t.description).toBe("I cannot connect to the VPN since this morning.")
    expect(t.urgency).toBe("דחוף")
    expect(t.urgency).toBe(INGEST_DEFAULTS.urgency)
    expect(t.category).toBe("אחר")
    expect(t.platform).toBe("מחשב אישי")
    expect(t.phone).toBe("")
    expect(t.computerName).toBe("")
    expect(t.reporterEmail).toBe("hana@cristalino.co.il")
    expect(t.reporterName).toBe("Hana Dan")
  })

  it("lowercases the reporter email and falls back to the address for the name", () => {
    const t = buildIngestedTicket({
      subject: "ticket help",
      text: "body",
      fromName: "",
      fromEmail: "USER@Cristalino.co.il",
    })
    expect(t.reporterEmail).toBe("user@cristalino.co.il")
    expect(t.reporterName).toBe("USER@Cristalino.co.il")
  })

  it("uses fallbacks when subject, body and sender are missing", () => {
    const t = buildIngestedTicket({ subject: "ticket", text: "", fromName: "", fromEmail: "" })
    expect(t.subject).toBe("פנייה מהמייל")
    expect(t.description).toBe("(לא צורף תוכן להודעה)")
    expect(t.reporterEmail).toBe(INGEST_FALLBACK_EMAIL)
    expect(t.reporterName).toBe("שולח לא ידוע")
  })

  it("honours a custom keyword when stripping the subject", () => {
    const t = buildIngestedTicket(
      { subject: "כרטיס: מסך שחור", text: "המסך לא נדלק", fromEmail: "a@b.co" },
      "כרטיס",
    )
    expect(t.subject).toBe("מסך שחור")
    expect(t.description).toBe("המסך לא נדלק")
  })

  it("DEFAULT_TICKET_KEYWORD is 'ticket'", () => {
    expect(DEFAULT_TICKET_KEYWORD).toBe("ticket")
  })
})
