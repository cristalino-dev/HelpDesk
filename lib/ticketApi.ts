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

import type { PendingImage } from "@/components/ImageAttachments"
import { describeUploadFailure } from "@/lib/attachmentTypes"

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
 * Set a ticket's status and surface the server's refusal if it will not.
 *
 * Same request as setTicketStatus(), different failure handling: the boolean
 * helpers above swallow the reason, which is fine while every refusal is a
 * permission error the UI already prevents. Closing is no longer like that —
 * a "סגירת משתמש" ticket refuses to close while its return checklist has an
 * unticked line, and the caller has something worth showing the user.
 *
 * @returns null on success, or the server's Hebrew message on refusal.
 */
export async function setTicketStatusOrError(id: string, status: string): Promise<string | null> {
  const res = await patchTicket({ id, status })
  if (res.ok) return null
  try {
    const body = await res.json()
    return typeof body?.error === "string" ? body.error : "הפעולה נכשלה. נסו שנית."
  } catch {
    return "הפעולה נכשלה. נסו שנית."
  }
}

/**
 * Apply arbitrary field updates to a ticket (staff-only fields accepted by
 * the server: subject, description, phone, computerName, urgency, category,
 * platform, assignedTo).
 *
 * `ownerEmail` is also accepted and is admin-only: it moves the ticket into
 * another registered user's name. Send it only when it actually differs from
 * the current owner — the server answers 403 to a non-admin who sends a
 * different one, so a client that always includes the field would break
 * ordinary staff edits.
 *
 * @returns true if the server accepted the request (HTTP 2xx)
 */
export async function updateTicket(id: string, fields: Record<string, unknown>): Promise<boolean> {
  const res = await patchTicket({ id, ...fields })
  return res.ok
}

export interface BulkChanges {
  status?: string
  holdReason?: string
  urgency?: string
  category?: string
  platform?: string
  assignedTo?: string
  note?: string
  ownerEmail?: string
  type?: string
}

export interface BulkUpdateResult {
  ok: boolean
  total?: number
  updatedCount?: number
  errors?: { ticketId: string; ticketNumber?: number; type?: string; error: string }[]
  error?: string
}

/**
 * Apply bulk updates to multiple tickets at once.
 */
export async function bulkUpdateTickets(ids: string[], changes: BulkChanges): Promise<BulkUpdateResult> {
  const res = await fetch("/api/tickets/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, changes }),
  })
  if (!res.ok) {
    try {
      const err = await res.json()
      return { ok: false, error: err.error || "שגיאה בביצוע עדכון מרוכז" }
    } catch {
      return { ok: false, error: "שגיאה בביצוע עדכון מרוכז" }
    }
  }
  return res.json()
}

export interface UploadFailure {
  /** The item that did not make it — a page keeps it so the person can retry. */
  item: PendingImage
  name: string
  reason: string
}

/**
 * Upload pending attachments to a ticket, one at a time, and report which did
 * not make it and why (v3.84). Until then all five callers fired the POSTs and
 * never looked at the answer, so a rejected upload was reported as a success.
 * A failed response is not assumed to be JSON: nginx answers 413 with HTML.
 *
 * @returns the failures — empty when everything was attached.
 */
export async function uploadAttachments(ticketId: string, items: PendingImage[]): Promise<UploadFailure[]> {
  const failures: UploadFailure[] = []
  for (const item of items) {
    const name = item.filename || "קובץ"
    let res: Response
    try {
      res = await fetch(`/api/tickets/${ticketId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: item.dataUrl, filename: item.filename }),
      })
    } catch {
      failures.push({ item, name, reason: describeUploadFailure(null) })
      continue
    }
    if (res.ok) continue
    let serverMessage: string | null = null
    try {
      const body = await res.json()
      if (typeof body?.error === "string") serverMessage = body.error
    } catch { /* not JSON — nginx's own error page */ }
    failures.push({ item, name, reason: describeUploadFailure(res.status, serverMessage) })
  }
  return failures
}

/** One line for a page to show: "הקובץ לא צורף: a.pdf — סוג הקובץ אינו נתמך". */
export function uploadFailureMessage(failures: { name: string; reason: string }[]): string {
  if (failures.length === 0) return ""
  const list = failures.map(f => `${f.name} — ${f.reason}`).join("; ")
  return failures.length === 1 ? `הקובץ לא צורף: ${list}` : `${failures.length} קבצים לא צורפו: ${list}`
}

