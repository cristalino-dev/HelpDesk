/**
 * lib/ticketMerge.ts — merging tickets (v3.92).
 *
 * The same problem often arrives twice: a ticket and then an email about it,
 * two emails, or five people reporting one outage. A merge keeps one ticket —
 * the TARGET — and folds the others, the SOURCES, into it. It follows what the
 * large helpdesks do (Zendesk, Freshdesk, Zoho Desk, Help Scout):
 *
 *   • the source's messages, internal notes and files MOVE to the target,
 *     keeping their times, so the conversation reads as one. Files stay where
 *     they are on disk — only the row's ticketId changes;
 *   • the target gets an internal note with the source's subject, opener and
 *     description, which are the one part of a source that does not move;
 *   • the source is closed (compound close — urgency נמוך), frozen, and points
 *     at the target (mergedIntoId). Its owner can still open it, and it says
 *     where the conversation went;
 *   • whoever opened or followed a source and does not own the target becomes
 *     a PARTICIPANT of the target (lib/ticketAccess.ts), so a merge never
 *     takes a ticket away from someone who reported the problem;
 *   • both sides get a history row — "merged" on the source, "mergedFrom" on
 *     the target — plus a "participant" row for everyone added;
 *   • the people of each source are mailed where it went; no closing or review
 *     mail, because nothing was resolved;
 *   • no chains: tickets already merged into a source are repointed at the
 *     target;
 *   • there is no unmerge, as in all of the systems above.
 *
 * A merge is all or nothing. planMerge() decides — pure, so the rules are
 * tested without a database — and mergeTickets() carries the plan out in one
 * transaction, which re-checks that nobody merged the same tickets meanwhile.
 * The mail is returned, not sent, for the caller's after() (rule 41).
 */

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { sendMail, mailTicketMerged, mailTicketUpdatedStaff } from "@/lib/mail"
import { subjects } from "@/lib/mailSubjects"
import { ticketLabel } from "@/lib/ticketType"

/** More tickets than this in one merge is a mistake, not a duplicate. */
export const MAX_MERGE = 10

/** What a merge needs to know about each ticket. */
export const MERGE_INCLUDE = {
  user:         { select: { id: true, name: true, email: true } },
  participants: { select: { user: { select: { id: true, name: true, email: true } } } },
  mergedInto:   { select: { ticketNumber: true, type: true } },
  _count:       { select: { messages: true, notes: true, attachments: true, equipment: true } },
} satisfies Prisma.TicketInclude

export type MergeTicket = Prisma.TicketGetPayload<{ include: typeof MERGE_INCLUDE }>

type Person = { id: string; name: string | null; email: string }
type Actor = { name: string; email: string }

export type MergeProblem = { ticketId: string; label: string; error: string }

type HistoryRow = {
  ticketId: string; field: string; oldValue?: string | null; newValue?: string | null
  actorName: string; actorEmail: string
}

export type MergePlan = {
  target: MergeTicket
  sources: MergeTicket[]
  /** People to add to the target as participants, in order, without repeats. */
  newParticipants: Person[]
  /** One internal note per source, for the target. */
  notes: { ticketId: string; content: string; authorName: string; authorEmail: string }[]
  history: HistoryRow[]
}

const date = (d: Date | string) =>
  new Date(d).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" })

const personName = (p: { name: string | null; email: string } | null | undefined) => p?.name || p?.email || "משתמש"

/**
 * Why these tickets cannot be merged, one line each — empty when they can.
 * Hebrew, because the merge dialog shows them as they are.
 */
export function mergeProblems(target: MergeTicket, sources: readonly MergeTicket[]): MergeProblem[] {
  const problems: MergeProblem[] = []
  const t = ticketLabel(target)
  if (target.mergedIntoId) {
    const where = target.mergedInto ? ticketLabel(target.mergedInto) : "פנייה אחרת"
    problems.push({ ticketId: target.id, label: t, error: `${t} כבר מוזגה ל-${where} — מזגו לתוך ${where}` })
  }
  if (sources.length === 0) {
    problems.push({ ticketId: target.id, label: t, error: "לא נבחרו פניות למיזוג" })
  }
  for (const s of sources) {
    const label = ticketLabel(s)
    if (s.id === target.id) {
      problems.push({ ticketId: s.id, label, error: "לא ניתן למזג פנייה לתוך עצמה" })
    } else if (s.mergedIntoId) {
      const where = s.mergedInto ? ticketLabel(s.mergedInto) : "פנייה אחרת"
      problems.push({ ticketId: s.id, label, error: `${label} כבר מוזגה ל-${where}` })
    } else if (s._count.equipment > 0) {
      // Equipment lines are unique per ticket and label, carry what was
      // received, and on a leaving employee's ticket guard its closing. They do
      // not fold into another list; the ticket that has them must be the one
      // that stays.
      problems.push({ ticketId: s.id, label, error: `ל-${label} יש רשימת ציוד — היא צריכה להיות הפנייה שנשארת` })
    }
  }
  return problems
}

/** Decide everything a merge writes. Pure: the same tickets give the same plan. */
export function planMerge(
  target: MergeTicket,
  sourcesIn: readonly MergeTicket[],
  actor: Actor,
): { ok: true; plan: MergePlan } | { ok: false; problems: MergeProblem[] } {
  // The same source twice is one source.
  const sources = sourcesIn.filter((s, i) => sourcesIn.findIndex(x => x.id === s.id) === i)
  const problems = mergeProblems(target, sources)
  if (problems.length > 0) return { ok: false, problems }

  const targetLabel = ticketLabel(target)
  const history: HistoryRow[] = []
  const row = (ticketId: string, field: string, oldValue: string | null, newValue: string | null) =>
    history.push({ ticketId, field, oldValue, newValue, actorName: actor.name, actorEmail: actor.email })

  // Everyone who follows the target already, owner included, is not added again.
  const known = new Set<string>([target.user.id, ...target.participants.map(p => p.user.id)])
  const newParticipants: Person[] = []
  const notes: MergePlan["notes"] = []

  for (const s of sources) {
    const label = ticketLabel(s)
    for (const person of [s.user, ...s.participants.map(p => p.user)]) {
      if (known.has(person.id)) continue
      known.add(person.id)
      newParticipants.push(person)
    }

    notes.push({
      ticketId: target.id,
      authorName: actor.name,
      authorEmail: actor.email,
      content:
        `🔗 מוזגה לכאן ${label}: ${s.subject}\n` +
        `נפתחה על ידי ${personName(s.user)} · ${date(s.createdAt)}\n\n` +
        s.description,
    })

    // The source's closing is a status change like any other, with its row:
    // a closed ticket without one has no closing date (scripts/audit-close-dates.mjs).
    if (s.status !== "סגור") row(s.id, "status", s.status, "סגור")
    if (s.urgency !== "נמוך") row(s.id, "urgency", s.urgency, "נמוך")
    row(s.id, "merged", label, targetLabel)
    row(target.id, "mergedFrom", label, targetLabel)
  }
  for (const p of newParticipants) row(target.id, "participant", null, personName(p))

  return { ok: true, plan: { target, sources, newParticipants, notes, history } }
}

/** Thrown inside the transaction when a ticket changed under the merge. */
class MergeConflict extends Error {}

export async function mergeTickets(opts: {
  target: MergeTicket
  sources: MergeTicket[]
  actor: Actor
  /** false: merge, send no mail. */
  notify?: boolean
}): Promise<
  | { ok: true; target: MergeTicket; merged: MergeTicket[]; participantsAdded: Person[]; mails: Promise<void>[] }
  | { ok: false; problems: MergeProblem[] }
> {
  const { actor, notify = true } = opts
  const planned = planMerge(opts.target, opts.sources, actor)
  if (!planned.ok) return planned
  const { target, sources, newParticipants, notes, history } = planned.plan
  const sourceIds = sources.map(s => s.id)

  try {
    await prisma.$transaction(async tx => {
      // Re-checked here, not only in the plan: two people merging the same
      // tickets at once must not both succeed.
      const stillFree = await tx.ticket.count({ where: { id: { in: [target.id, ...sourceIds] }, mergedIntoId: null } })
      if (stillFree !== sourceIds.length + 1) throw new MergeConflict()

      await tx.ticketMessage.updateMany({ where: { ticketId: { in: sourceIds } }, data: { ticketId: target.id } })
      await tx.ticketNote.updateMany({ where: { ticketId: { in: sourceIds } }, data: { ticketId: target.id } })
      await tx.ticketAttachment.updateMany({ where: { ticketId: { in: sourceIds } }, data: { ticketId: target.id } })
      // No chains: what pointed at a source now points at the target.
      await tx.ticket.updateMany({ where: { mergedIntoId: { in: sourceIds } }, data: { mergedIntoId: target.id } })
      await tx.ticket.updateMany({
        where: { id: { in: sourceIds } },
        data: { status: "סגור", urgency: "נמוך", holdReason: null, mergedIntoId: target.id },
      })
      if (newParticipants.length > 0) {
        await tx.ticketParticipant.createMany({
          data: newParticipants.map(p => ({ ticketId: target.id, userId: p.id, addedBy: actor.email })),
          skipDuplicates: true,
        })
      }
      await tx.ticketNote.createMany({ data: notes })
      await tx.ticketHistory.createMany({ data: history })
    })
  } catch (err) {
    if (err instanceof MergeConflict) {
      return { ok: false, problems: [{ ticketId: target.id, label: ticketLabel(target), error: "אחת הפניות מוזגה בינתיים — רעננו ונסו שוב" }] }
    }
    throw err
  }

  const mails: Promise<void>[] = []
  if (notify) {
    const targetRef = { ticketNumber: target.ticketNumber, type: target.type, subject: target.subject }
    const told = new Set<string>([actor.email.toLowerCase()])
    for (const s of sources) {
      for (const person of [s.user, ...s.participants.map(p => p.user)]) {
        if (told.has(person.email.toLowerCase())) continue
        told.add(person.email.toLowerCase())
        mails.push(sendMail({
          to: person.email,
          subject: subjects.merged(s, target),
          html: mailTicketMerged({ ticketNumber: s.ticketNumber, type: s.type, subject: s.subject }, targetRef, personName(person)),
        }))
      }
    }
    // The technician on the target learns that it grew — unless they did it.
    if (target.assignedTo && target.assignedTo.toLowerCase() !== actor.email.toLowerCase()) {
      mails.push(sendMail({
        to: target.assignedTo,
        subject: subjects.updatedStaff(target, target.subject),
        html: mailTicketUpdatedStaff({
          id: target.id, ticketNumber: target.ticketNumber, type: target.type,
          subject: target.subject, description: target.description, urgency: target.urgency,
          category: target.category, platform: target.platform, phone: target.phone,
          computerName: target.computerName, status: target.status,
          submitterName: personName(target.user), submitterEmail: target.user.email,
        }, actor.name),
      }))
    }
  }

  return { ok: true, target, merged: sources, participantsAdded: newParticipants, mails }
}
