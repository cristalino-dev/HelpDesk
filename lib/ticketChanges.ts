/**
 * lib/ticketChanges.ts — one staff edit applied to one ticket, with every rule
 * a staff edit obeys (v3.88).
 *
 * Taken out of POST /api/tickets/bulk so the bulk route and the public API's
 * PATCH /api/v1/tickets/{ref} go through one path, not two copies:
 *
 *   • compound close — status סגור also sets urgency נמוך;
 *   • hold — בהמתנה needs a reason; leaving it clears the reason;
 *   • offboarding — a leaving-employee ticket with gear still out does not close;
 *   • assigning an open ticket to oneself moves it to בטיפול;
 *   • every change is a history row, committed together with the ticket;
 *   • the same mail a single edit sends. It is RETURNED, not sent: the caller
 *     hands it to after(), so nothing is abandoned when the response goes out
 *     (rule 41).
 */

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { sendMail, mailTicketUpdatedStaff, mailTicketStatusUser, mailTicketClosedWithReview, mailTicketClosedParticipant } from "@/lib/mail"
import { subjects } from "@/lib/mailSubjects"
import { isOffboarding, offboardingBlockers, blockerMessage } from "@/lib/offboarding"
import { normalizeType, ticketLabel, mergedError } from "@/lib/ticketType"
import { PARTICIPANTS_SELECT } from "@/lib/ticketAccess"

export type TicketChanges = {
  status?: string
  holdReason?: string
  urgency?: string
  category?: string
  platform?: string
  type?: string
  assignedTo?: string
  note?: string
  subject?: string
  description?: string
  phone?: string
  computerName?: string
}

/** What applyTicketChanges needs loaded with the ticket. */
export const TICKET_CHANGE_INCLUDE = {
  user:         { select: { name: true, email: true } },
  equipment:    { select: { label: true, quantity: true, receivedQty: true } },
  participants: PARTICIPANTS_SELECT,
  mergedInto:   { select: { ticketNumber: true, type: true } },
} satisfies Prisma.TicketInclude

export type LoadedTicket = Prisma.TicketGetPayload<{ include: typeof TICKET_CHANGE_INCLUDE }>

type HistoryRow = {
  ticketId: string; field: string; oldValue?: string | null; newValue?: string | null
  actorName: string; actorEmail: string
}

/** Content fields a staff edit may rewrite; any change among them is one "edited" row. */
const CONTENT_FIELDS = ["category", "platform", "subject", "description", "phone", "computerName"] as const

export async function applyTicketChanges(opts: {
  ticket: LoadedTicket
  changes: TicketChanges
  actor: { name: string; email: string }
  /** Everyone who gets the staff update mail when the status did not change. */
  staffEmails: string[]
  /** An admin's owner move, already resolved to a user. */
  newOwner?: { id: string; name: string | null; email: string } | null
  /** false: change the ticket, send no mail. */
  notify?: boolean
}): Promise<{ ok: true; mails: Promise<void>[] } | { ok: false; error: string }> {
  const { ticket, changes, actor, staffEmails, newOwner = null, notify = true } = opts

  // A merged ticket is frozen (v3.92): it stays closed and points at the one
  // that carries on. Reopening it would split the conversation again.
  if (ticket.mergedInto) return { ok: false, error: mergedError(ticket.mergedInto) }

  if (changes.status === "סגור" && isOffboarding(ticket.category)) {
    const blockers = offboardingBlockers(ticket.equipment)
    if (blockers.length > 0) return { ok: false, error: blockerMessage(blockers) }
  }
  if (changes.status === "בהמתנה" && !changes.holdReason?.trim()) {
    return { ok: false, error: "יש להזין סיבת המתנה" }
  }

  const data: Record<string, string | null> = {}
  if (changes.status !== undefined) data.status = changes.status
  if (changes.urgency !== undefined) data.urgency = changes.urgency
  if (changes.type !== undefined) data.type = normalizeType(changes.type)
  for (const field of CONTENT_FIELDS) {
    if (changes[field] !== undefined) data[field] = changes[field]
  }
  // "" is "unassigned", stored as sent, as PATCH /api/tickets stores it. The
  // column is NOT NULL: turning "" into null threw inside the transaction.
  if (changes.assignedTo !== undefined) data.assignedTo = changes.assignedTo
  if (newOwner && newOwner.id !== ticket.userId) data.userId = newOwner.id

  if (changes.status === "בהמתנה") data.holdReason = changes.holdReason!.trim()
  if (changes.status !== undefined && changes.status !== "בהמתנה" && ticket.status === "בהמתנה") data.holdReason = null
  if (data.status === "סגור") data.urgency = "נמוך"
  if (changes.assignedTo !== undefined && changes.assignedTo === actor.email && ticket.status === "פתוח" && changes.status === undefined) {
    data.status = "בטיפול"
  }

  const history: HistoryRow[] = []
  const row = (field: string, oldValue?: string | null, newValue?: string | null) =>
    history.push({ ticketId: ticket.id, field, oldValue, newValue, actorName: actor.name, actorEmail: actor.email })

  if (data.status !== undefined && data.status !== ticket.status) {
    row("status", ticket.status, data.status === "בהמתנה" && data.holdReason ? `בהמתנה: ${data.holdReason}` : data.status)
  }
  if (data.urgency !== undefined && data.urgency !== ticket.urgency) row("urgency", ticket.urgency ?? null, data.urgency)
  if (changes.assignedTo !== undefined && (data.assignedTo ?? null) !== (ticket.assignedTo ?? null)) {
    row("assignedTo", ticket.assignedTo, data.assignedTo)
  }
  if (newOwner && newOwner.id !== ticket.userId) {
    row("owner", ticket.user?.name ?? ticket.user?.email ?? null, newOwner.name ?? newOwner.email)
  }
  if (data.type !== undefined && data.type !== ticket.type) row("type", ticket.type, data.type)
  if (CONTENT_FIELDS.some(f => changes[f] !== undefined && changes[f] !== ticket[f])) row("edited")

  await prisma.$transaction(async tx => {
    if (Object.keys(data).length > 0) await tx.ticket.update({ where: { id: ticket.id }, data })
    if (history.length > 0) await tx.ticketHistory.createMany({ data: history })
    if (changes.note?.trim()) {
      await tx.ticketNote.create({
        data: { ticketId: ticket.id, content: changes.note.trim(), authorName: actor.name, authorEmail: actor.email },
      })
    }
  })

  if (!notify) return { ok: true, mails: [] }

  // The same mail a single edit sends: the staff update — to the assignee
  // when the status changed, to all staff otherwise — and the owner's
  // closure, בטיפול or re-open mail. Never to the person who made the change.
  const owner = newOwner ?? ticket.user
  const status = data.status ?? ticket.status
  const assignedTo = data.assignedTo !== undefined ? data.assignedTo : ticket.assignedTo
  const label = { ticketNumber: ticket.ticketNumber, type: data.type ?? ticket.type }
  const info = {
    id: ticket.id, ticketNumber: ticket.ticketNumber, type: label.type,
    subject: data.subject ?? ticket.subject, description: data.description ?? ticket.description,
    urgency: data.urgency ?? ticket.urgency, category: data.category ?? ticket.category,
    platform: data.platform ?? ticket.platform, phone: data.phone ?? ticket.phone,
    computerName: data.computerName ?? ticket.computerName, status,
    submitterName: owner?.name ?? owner?.email ?? "משתמש",
    submitterEmail: owner?.email ?? "",
  }

  const mails: Promise<void>[] = []
  const statusChanged = data.status !== undefined && data.status !== ticket.status
  const staffRecipients = (statusChanged ? [assignedTo].filter((e): e is string => !!e) : staffEmails)
    .filter(e => e !== actor.email)
  if (staffRecipients.length > 0) {
    mails.push(sendMail({ to: staffRecipients, subject: subjects.updatedStaff(label, info.subject), html: mailTicketUpdatedStaff(info, actor.name) }))
  }
  if (data.status === "סגור") {
    if (owner?.email) {
      mails.push(sendMail({ to: owner.email, subject: `פנייתך ${ticketLabel(label)} נסגרה — ספרו לנו כיצד היה השירות`, html: mailTicketClosedWithReview(info) }))
    }
    // Participants hear that it closed, without the review — that is the owner's (v3.92).
    if (ticket.status !== "סגור") {
      for (const p of ticket.participants ?? []) {
        if (p.user.email === owner?.email || p.user.email === actor.email) continue
        mails.push(sendMail({ to: p.user.email, subject: subjects.closedParticipant(label, info.subject), html: mailTicketClosedParticipant(info, p.user.name ?? p.user.email) }))
      }
    }
  } else if (data.status === "בטיפול" && owner?.email && owner.email !== actor.email) {
    mails.push(sendMail({ to: owner.email, subject: subjects.inProgressUser(label), html: mailTicketStatusUser(info) }))
  } else if (data.status === "פתוח" && ticket.status === "סגור" && owner?.email && owner.email !== actor.email) {
    mails.push(sendMail({ to: owner.email, subject: `פנייתך ${ticketLabel(label)} נפתחה מחדש`, html: mailTicketStatusUser(info) }))
  }
  return { ok: true, mails }
}
