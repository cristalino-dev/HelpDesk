/**
 * lib/ticketRevision.ts — Ticket change-detection signature
 *
 * PURPOSE:
 * ─────────
 * The ticket detail page (app/tickets/[id]/page.tsx) polls the server to stay
 * live without a manual refresh. To avoid re-rendering on every poll (which
 * causes flicker and can interrupt text selection), we compare a compact
 * "revision" string before applying an update — state is only replaced when
 * the signature actually changed.
 *
 * WHY NOT JUST `updatedAt`?
 * ──────────────────────────
 * Adding a message or a technician note does NOT bump `ticket.updatedAt`
 * (the POST routes create the child row without touching the parent ticket).
 * So a signature based on `updatedAt` alone would miss new chat messages —
 * exactly the change users most want to see live. We therefore fold in the
 * length and last-id of every child collection (messages, notes, attachments,
 * history). Length catches deletions; last-id catches additions.
 *
 * This is a pure function so it can be unit-tested without a running app.
 */

import type { TicketDetail } from "@/types/ticket"

/** Shape we need for a signature — every field is optional except updatedAt,
 *  because regular (non-staff) users receive the ticket without `notes`. */
type RevisionInput = Pick<TicketDetail, "updatedAt"> &
  Partial<Pick<TicketDetail, "messages" | "notes" | "attachments" | "history">>

function lastId(arr: ReadonlyArray<{ id: string }> | undefined | null): string {
  if (!arr || arr.length === 0) return "-"
  return arr[arr.length - 1].id
}

function part(prefix: string, arr: ReadonlyArray<{ id: string }> | undefined | null): string {
  const len = arr?.length ?? 0
  return `${prefix}:${len}:${lastId(arr)}`
}

/**
 * Returns a compact, stable signature for a ticket. Two payloads representing
 * the same server state produce identical strings; any meaningful change
 * (edit, status/urgency/assignment change, or an added/removed message, note,
 * attachment or history entry) produces a different string.
 */
export function ticketRevision(t: RevisionInput): string {
  return [
    `u:${t.updatedAt}`,
    part("m", t.messages),
    part("n", t.notes),
    part("a", t.attachments),
    part("h", t.history),
  ].join("|")
}
