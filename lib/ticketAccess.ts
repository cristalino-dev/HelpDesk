/**
 * lib/ticketAccess.ts — who may see a ticket, and who follows it (v3.92).
 *
 * Until v3.92 a ticket had one reader outside staff, its owner, and every route
 * asked `ticket.user.email !== session.user.email` in its own words. Merging
 * tickets gave it more: when two people report the same thing and one ticket is
 * merged into the other, the second person follows the survivor as a
 * PARTICIPANT (TicketParticipant) — they see it, read and write in its
 * conversation, and are told when staff answer or it closes.
 *
 * What stays the owner's alone: closing and reopening it from their dashboard,
 * the equipment they asked for, and the service review.
 *
 * Emails are compared exactly, as everywhere else (rule 50): the session carries
 * the address as the database stores it, and so do the rows compared with it.
 */

/** The participants' part of a ticket query — include it wherever access is checked. */
export const PARTICIPANTS_SELECT = {
  select: { user: { select: { id: true, name: true, email: true } } },
  orderBy: { createdAt: "asc" as const },
}

export type ParticipantRow = { user: { id?: string; name: string | null; email: string } }

type AccessTicket = {
  user?: { email: string | null } | null
  participants?: ReadonlyArray<ParticipantRow> | null
}

/** A participant — someone following the ticket who does not own it. */
export function isParticipant(ticket: AccessTicket, email: string | null | undefined): boolean {
  if (!email) return false
  return (ticket.participants ?? []).some(p => p.user.email === email)
}

/** Staff see every ticket; anyone else sees the tickets they own or follow. */
export function canSeeTicket(ticket: AccessTicket, email: string | null | undefined, isStaff: boolean): boolean {
  if (isStaff) return true
  if (!email) return false
  return ticket.user?.email === email || isParticipant(ticket, email)
}

/**
 * Who to tell about a ticket besides staff: the owner and the participants,
 * without the people in `exclude` (the author, someone already told) and
 * without repeats. Case-insensitive, because the exclusions may come from a
 * mail header rather than a row.
 */
export function followerEmails(
  ticket: AccessTicket,
  exclude: ReadonlyArray<string | null | undefined> = [],
): string[] {
  const skip = new Set(exclude.filter((e): e is string => !!e).map(e => e.toLowerCase()))
  const out: string[] = []
  for (const email of [ticket.user?.email, ...(ticket.participants ?? []).map(p => p.user.email)]) {
    if (!email || skip.has(email.toLowerCase())) continue
    skip.add(email.toLowerCase())
    out.push(email)
  }
  return out
}
