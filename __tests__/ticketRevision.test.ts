/**
 * __tests__/ticketRevision.test.ts
 *
 * Tests for lib/ticketRevision.ts — the signature used by the live ticket page
 * to decide whether a background poll actually changed anything.
 *
 * The contract under test:
 *   - identical server state  → identical signature (no re-render)
 *   - ANY meaningful change    → different signature (re-render)
 * including changes that do NOT bump ticket.updatedAt (new message / note),
 * which is the whole reason the signature folds in the child collections.
 */

import { ticketRevision } from "@/lib/ticketRevision"
import type { TicketMessage, TicketNote, TicketAttachment, TicketHistoryEntry } from "@/types/ticket"

// Minimal factories — ticketRevision only reads `id`, so cast the rest away.
const msg = (id: string) => ({ id }) as TicketMessage
const note = (id: string) => ({ id }) as TicketNote
const att = (id: string) => ({ id }) as TicketAttachment
const hist = (id: string) => ({ id }) as TicketHistoryEntry

const base = {
  updatedAt: "2026-06-24T10:00:00.000Z",
  messages: [msg("m1"), msg("m2")],
  notes: [note("n1")],
  attachments: [att("a1")],
  history: [hist("h1"), hist("h2")],
}

describe("ticketRevision", () => {
  it("returns the same signature for identical payloads", () => {
    expect(ticketRevision(base)).toBe(ticketRevision({ ...base }))
  })

  it("changes when a new message is added (even though updatedAt is unchanged)", () => {
    const next = { ...base, messages: [...base.messages, msg("m3")] }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("changes when a message is deleted", () => {
    const next = { ...base, messages: [msg("m1")] }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("changes when the last message id differs but the count is the same", () => {
    // e.g. the newest message was deleted and a different one added between polls
    const next = { ...base, messages: [msg("m1"), msg("m9")] }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("changes when a technician note is added", () => {
    const next = { ...base, notes: [...base.notes, note("n2")] }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("changes when an attachment is added", () => {
    const next = { ...base, attachments: [...base.attachments, att("a2")] }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("changes when a history entry is added (status/urgency/assignment change)", () => {
    const next = { ...base, history: [...base.history, hist("h3")] }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("changes when updatedAt changes (ticket edited in place)", () => {
    const next = { ...base, updatedAt: "2026-06-24T11:30:00.000Z" }
    expect(ticketRevision(next)).not.toBe(ticketRevision(base))
  })

  it("handles undefined collections (non-staff payload without notes)", () => {
    const userView = { updatedAt: base.updatedAt, messages: base.messages, attachments: base.attachments, history: base.history }
    expect(() => ticketRevision(userView)).not.toThrow()
    // a non-staff payload (notes undefined) must not collide with a staff one that has notes
    expect(ticketRevision(userView)).not.toBe(ticketRevision(base))
  })

  it("treats undefined and empty collections identically", () => {
    const a = { updatedAt: base.updatedAt }
    const b = { updatedAt: base.updatedAt, messages: [], notes: [], attachments: [], history: [] }
    expect(ticketRevision(a)).toBe(ticketRevision(b))
  })

  it("produces a stable, order-independent-of-object-key string", () => {
    // signature must not depend on property insertion order of the input object
    const reordered = {
      history: base.history, attachments: base.attachments,
      notes: base.notes, messages: base.messages, updatedAt: base.updatedAt,
    }
    expect(ticketRevision(reordered)).toBe(ticketRevision(base))
  })
})
