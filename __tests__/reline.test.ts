/**
 * @jest-environment node
 */
/**
 * __tests__/reline.test.ts — lib/reline.ts (v3.102)
 *
 * Reline answer an escalation with their own case number in the subject:
 *
 *   פנייתך התקבלה בהצלחה: תקלה בשליחת זימונים [#269311]
 *
 * Everything here is string work, and all of it is load-bearing: get the
 * parsing wrong and the number silently never appears, which is the one thing
 * this feature exists to show.
 */

import {
  RELINE_EMAIL, isRelineSender, relineSubject, parseRelineRef, relineLabel, relineContact,
} from "@/lib/reline"

describe("whose mail is it", () => {
  it("recognises Reline, whatever the case or subdomain", () => {
    expect(isRelineSender("support@reline.co.il")).toBe(true)
    expect(isRelineSender("Support@Reline.co.IL")).toBe(true)
    expect(isRelineSender(" noreply@mail.reline.co.il ")).toBe(true)
  })

  // A domain that merely ENDS in the same letters is somebody else, and this
  // branch writes to a ticket, so it must not be generous.
  it("is not fooled by a lookalike domain", () => {
    expect(isRelineSender("support@notreline.co.il")).toBe(false)
    expect(isRelineSender("support@reline.co.il.evil.com")).toBe(false)
    expect(isRelineSender("reline.co.il")).toBe(false)
    expect(isRelineSender("")).toBe(false)
  })
})

describe("the subject we send", () => {
  // Their reply echoes our subject, and our label in it is the ONLY reason
  // their case number can be matched back to a ticket.
  it("carries our own label", () => {
    expect(relineSubject("HDTC-862", "המדפסת לא עובדת")).toBe("[HDTC-862] המדפסת לא עובדת")
    expect(relineSubject("REQ-12", "x")).toBe("[REQ-12] x")
  })
})

describe("reading their case number", () => {
  it("takes it from the acknowledgement as it actually arrives", () => {
    expect(parseRelineRef("פנייתך התקבלה בהצלחה: תקלה בשליחת זימונים [#269311]")).toBe("269311")
  })

  it("survives a mail system reformatting the brackets or spacing", () => {
    expect(parseRelineRef("[ #269311 ]")).toBe("269311")
    expect(parseRelineRef("Re: something #269311")).toBe("269311")
    expect(parseRelineRef("[# 269311]")).toBe("269311")
  })

  // Their acknowledgement quotes our subject first, and a forwarded chain can
  // pick up more; theirs is the one they appended.
  it("takes the last number when a subject carries several", () => {
    expect(parseRelineRef("Re: [HDTC-862] bug #111 [#269311]")).toBe("269311")
  })

  it("is null when there is nothing to read", () => {
    expect(parseRelineRef("פנייתך התקבלה בהצלחה")).toBeNull()
    expect(parseRelineRef("")).toBeNull()
    expect(parseRelineRef("#12")).toBeNull() // too short to be a case number
  })

  it("keeps the number a string, leading zeros and all", () => {
    expect(parseRelineRef("[#000412]")).toBe("000412")
    expect(relineLabel("000412")).toBe("Reline #000412")
  })
})

describe("who Reline should call", () => {
  const owner = { name: "דנה לוי", email: "dana@cristalino.co.il", phone: "050-1111111" }

  it("prefers the phone typed on this ticket over the profile's", () => {
    expect(relineContact({ phone: "052-2222222", user: owner }))
      .toEqual({ name: "דנה לוי", email: "dana@cristalino.co.il", phone: "052-2222222" })
  })

  it("falls back to the profile phone when the ticket has none", () => {
    expect(relineContact({ phone: "", user: owner }).phone).toBe("050-1111111")
  })

  // "Call 050-…" with no name is not a contact.
  it("always produces a name, even with nothing but an address", () => {
    expect(relineContact({ phone: "", user: { name: null, email: "ron@cristalino.co.il" } }).name).toBe("ron")
    expect(relineContact({ phone: "", user: null }).name).toBe("משתמש")
  })
})

describe("the destination", () => {
  // Taken from a payload, this would be a relay. It is a constant.
  it("is a constant", () => {
    expect(RELINE_EMAIL).toBe("support@reline.co.il")
  })
})
