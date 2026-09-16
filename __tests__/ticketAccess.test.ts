/**
 * __tests__/ticketAccess.test.ts — who sees a ticket, and who hears about it (v3.92).
 *
 * Merging gave a ticket readers besides staff and its owner: the people whose
 * tickets were merged into it, its participants. One helper answers "may this
 * person see it" for every route, and one answers "who is told" for every mail.
 */

import { canSeeTicket, followerEmails, isParticipant } from "@/lib/ticketAccess"

const OWNER = "dana@cristalino.co.il"
const RON   = "ron@cristalino.co.il"
const MAYA  = "maya@cristalino.co.il"

const ticket = {
  user: { email: OWNER },
  participants: [
    { user: { id: "u-ron", name: "רון", email: RON } },
    { user: { id: "u-maya", name: "מאיה", email: MAYA } },
  ],
}

describe("canSeeTicket", () => {
  it("lets staff see any ticket", () => {
    expect(canSeeTicket({ user: { email: OWNER } }, "helpdesk@cristalino.co.il", true)).toBe(true)
  })

  it("lets the owner see their ticket", () => {
    expect(canSeeTicket(ticket, OWNER, false)).toBe(true)
  })

  it("lets a participant see the ticket they follow", () => {
    expect(canSeeTicket(ticket, RON, false)).toBe(true)
  })

  it("refuses anyone else", () => {
    expect(canSeeTicket(ticket, "stranger@cristalino.co.il", false)).toBe(false)
  })

  it("refuses a session without an email", () => {
    expect(canSeeTicket(ticket, undefined, false)).toBe(false)
    expect(canSeeTicket(ticket, "", false)).toBe(false)
  })

  // Routes that select only the owner — and every test mock written before
  // v3.92 — hand over no participants at all.
  it("works on a ticket loaded without participants", () => {
    expect(canSeeTicket({ user: { email: OWNER } }, OWNER, false)).toBe(true)
    expect(canSeeTicket({ user: { email: OWNER } }, RON, false)).toBe(false)
  })

  // Rule 50: the session carries the address as the database stores it.
  it("compares addresses exactly, as every ownership check does", () => {
    expect(canSeeTicket(ticket, "Dana@Cristalino.co.il", false)).toBe(false)
  })
})

describe("isParticipant", () => {
  it("is true for a participant, false for the owner and strangers", () => {
    expect(isParticipant(ticket, MAYA)).toBe(true)
    expect(isParticipant(ticket, OWNER)).toBe(false)
    expect(isParticipant(ticket, "x@cristalino.co.il")).toBe(false)
  })
})

describe("followerEmails", () => {
  it("names the owner first, then the participants", () => {
    expect(followerEmails(ticket)).toEqual([OWNER, RON, MAYA])
  })

  it("leaves out whoever is excluded, whatever the case of the address", () => {
    expect(followerEmails(ticket, ["RON@cristalino.co.il", null, undefined])).toEqual([OWNER, MAYA])
  })

  it("names nobody twice", () => {
    const twice = { user: { email: OWNER }, participants: [{ user: { name: null, email: OWNER } }, { user: { name: null, email: RON } }] }
    expect(followerEmails(twice)).toEqual([OWNER, RON])
  })

  it("names nobody when the ticket has no owner row and no participants", () => {
    expect(followerEmails({ user: null })).toEqual([])
  })
})
