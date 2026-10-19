/**
 * @jest-environment node
 */
/**
 * __tests__/ticketStatus.test.ts — lib/ticketStatus.ts (v3.103)
 *
 * The status list used to be typed out in seven places and two had already
 * drifted — the staff queue offered three of the four, so a ticket on hold
 * could not be filtered for there. It has one home now, and this is what
 * keeps the other halves honest: every status needs a pill colour, and the
 * stale report has to ignore the ones where somebody else is holding the
 * ticket.
 */

import { STATUSES, WAITING_EXTERNAL, ON_HOLD, CLOSED, isWaiting, pausesTheClock } from "@/lib/ticketStatus"
import { STATUS_TOKENS } from "@/lib/theme"
import { isStaleOpen } from "@/lib/staleTicket"

describe("the list", () => {
  it("is the lifecycle, in order", () => {
    expect([...STATUSES]).toEqual(["פתוח", "בטיפול", "בהמתנה", "ממתין לגורם חיצוני", "סגור"])
  })

  // A status with no pill renders as unstyled text, which is how you ship a
  // status nobody can see.
  it("gives every status a pill colour", () => {
    for (const status of STATUSES) {
      expect(Object.keys(STATUS_TOKENS)).toContain(status)
    }
  })

  it("has no colour for a status that does not exist", () => {
    expect(Object.keys(STATUS_TOKENS).sort()).toEqual([...STATUSES].sort())
  })
})

describe("parked or being worked", () => {
  it("knows which statuses are waiting", () => {
    expect(isWaiting(ON_HOLD)).toBe(true)
    expect(isWaiting(WAITING_EXTERNAL)).toBe(true)
    expect(isWaiting("פתוח")).toBe(false)
    expect(isWaiting("בטיפול")).toBe(false)
    expect(isWaiting(CLOSED)).toBe(false)
  })
})

describe("the stale clock", () => {
  const longAgo = new Date("2026-01-01T09:00:00Z").toISOString()

  it("still flags a ticket nobody has picked up", () => {
    expect(isStaleOpen({ status: "פתוח", createdAt: longAgo })).toBe(true)
    expect(isStaleOpen({ status: "בטיפול", createdAt: longAgo })).toBe(true)
  })

  // "Stale" measures OUR response time. A ticket sitting with Reline is
  // waiting on Reline, and counting it makes the queue look neglected for
  // work somebody else has not returned.
  it("stops while somebody else holds the ticket", () => {
    expect(isStaleOpen({ status: WAITING_EXTERNAL, createdAt: longAgo })).toBe(false)
    expect(isStaleOpen({ status: ON_HOLD, createdAt: longAgo })).toBe(false)
    expect(isStaleOpen({ status: CLOSED, createdAt: longAgo })).toBe(false)
    expect(pausesTheClock(WAITING_EXTERNAL)).toBe(true)
  })
})
