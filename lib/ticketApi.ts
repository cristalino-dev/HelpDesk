/**
 * lib/ticketApi.ts — Client-side helpers for mutating ticket state.
 *
 * All ticket mutations call PATCH /api/tickets. Centralising them here
 * ensures a single location to document compound side-effects and keeps
 * the call signature consistent across every page.
 *
 * KEY INVARIANT — closing a ticket:
 *   Sending { status: "סגור" } to the API triggers two writes:
 *     1. status  → "סגור"
 *     2. urgency → "נמוך"  (enforced by the server, line 181 of route.ts)
 *   No client code should duplicate this logic. Always call closeTicket()
 *   or setTicketStatus(id, "סגור") and let the server handle the rest.
 *
 * Usage:
 *   import { closeTicket, setTicketStatus, updateTicket } from "@/lib/ticketApi"
 */

async function patchTicket(payload: Record<string, unknown>): Promise<Response> {
  return fetch("/api/tickets", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

/**
 * Close a ticket.
 *
 * The server automatically downgrades urgency to "נמוך" on closure — no
 * extra payload or follow-up call is needed from the client. Callers
 * should refresh their local ticket list after this resolves.
 *
 * @returns true if the server accepted the request (HTTP 2xx)
 */
export async function closeTicket(id: string): Promise<boolean> {
  const res = await patchTicket({ id, status: "סגור" })
  return res.ok
}

/**
 * Set a ticket's status to any value.
 *
 * Prefer closeTicket() when the intent is closure — it documents the
 * compound side-effect (urgency downgrade) at the call-site.
 *
 * @returns true if the server accepted the request (HTTP 2xx)
 */
export async function setTicketStatus(id: string, status: string): Promise<boolean> {
  const res = await patchTicket({ id, status })
  return res.ok
}

/**
 * Apply arbitrary field updates to a ticket (staff-only fields accepted by
 * the server: subject, description, phone, computerName, urgency, category,
 * platform, assignedTo).
 *
 * @returns true if the server accepted the request (HTTP 2xx)
 */
export async function updateTicket(id: string, fields: Record<string, unknown>): Promise<boolean> {
  const res = await patchTicket({ id, ...fields })
  return res.ok
}
