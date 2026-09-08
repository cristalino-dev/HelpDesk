/**
 * __tests__/contactDetails.test.ts — whose phone number ends up in the form
 *
 * The bug this locks down: an admin filing a ticket for someone else got two
 * blank required fields, because the fallback stopped at the User row and
 * almost nobody fills their profile in. Resolution is per-field, and the one
 * case that must never be silent is "we do not know".
 */

import { resolveContact, contactSummary } from "@/lib/contactDetails"

describe("resolveContact", () => {
  it("prefers the profile — what the person deliberately saved", () => {
    const c = resolveContact(
      { phone: "050-1111111", station: "PC-DANA" },
      { phone: "050-9999999", computerName: "PC-OLD" },
    )
    expect(c).toMatchObject({ phone: "050-1111111", station: "PC-DANA", phoneFrom: "profile", stationFrom: "profile" })
  })

  it("falls back to the last ticket when the profile is empty", () => {
    const c = resolveContact({ phone: null, station: null }, { phone: "050-9999999", computerName: "PC-OLD" })
    expect(c).toMatchObject({ phone: "050-9999999", station: "PC-OLD", phoneFrom: "ticket", stationFrom: "ticket" })
  })

  it("resolves the two fields INDEPENDENTLY", () => {
    // A saved phone number and a never-saved machine is the ordinary case, and
    // pairing them would throw away the machine we do know.
    const c = resolveContact({ phone: "050-1111111", station: "" }, { phone: "050-9999999", computerName: "PC-OLD" })
    expect(c).toMatchObject({ phone: "050-1111111", phoneFrom: "profile", station: "PC-OLD", stationFrom: "ticket" })
  })

  it("says none rather than inventing a value", () => {
    expect(resolveContact(null, null)).toEqual({ phone: "", station: "", phoneFrom: "none", stationFrom: "none" })
  })

  it("treats whitespace as absent — a space is not a phone number", () => {
    const c = resolveContact({ phone: "   ", station: "  " }, { phone: "050-9999999", computerName: null })
    expect(c).toMatchObject({ phone: "050-9999999", phoneFrom: "ticket", station: "", stationFrom: "none" })
  })

  it("trims what it does return", () => {
    expect(resolveContact({ phone: " 050-1111111 " }, null).phone).toBe("050-1111111")
  })
})

describe("contactSummary", () => {
  it("says nothing is known, so the admin knows to type it", () => {
    const s = contactSummary(resolveContact(null, null))
    expect(s).toMatch(/אין פרטי טלפון ומחשב שמורים/)
  })

  it("names each source", () => {
    const s = contactSummary(resolveContact({ phone: "050-1", station: null }, { computerName: "PC-1" }))
    expect(s).toContain("טלפון מהפרופיל")
    expect(s).toContain("שם מחשב מפנייה קודמת")
  })

  it("points out the half it could not fill", () => {
    const s = contactSummary(resolveContact({ phone: "050-1" }, null))
    expect(s).toContain("טלפון מהפרופיל")
    expect(s).toMatch(/להשלים את שם המחשב/)
    expect(s).not.toContain("שם מחשב מ")
  })
})
