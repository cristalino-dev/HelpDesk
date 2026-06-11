/**
 * lib/staffMembers.ts — Server-side resolver for the effective staff roster.
 *
 * The roster is DB-DRIVEN: a user appears in the ticket assignment dropdown,
 * the @mention shortcuts, and @mention email parsing if and only if they are
 * currently flagged `isAdmin = true` in the database. Promote a user → they
 * appear everywhere; revoke admin → they disappear (e.g. daniel was removed
 * from the roster this way, v3.28).
 *
 * The hardcoded STAFF_MEMBERS list in lib/staffEmails.ts only contributes
 * curated handles + Hebrew display names for emails that are still admins;
 * it no longer forces anyone into the roster.
 *
 * IMPORTANT: this file imports prisma and must only be used server-side
 * (API routes). Client components fetch the result from GET /api/staff.
 */

import { prisma } from "@/lib/db"
import { STAFF_MEMBERS } from "@/lib/staffEmails"

export type StaffMember = { email: string; handle: string; display: string }

/** Derive an @mention handle from an email local-part (e.g. aviel.bt@... → "aviel.bt"). */
function handleFromEmail(email: string): string {
  return email.split("@")[0].toLowerCase()
}

/**
 * The effective staff roster: every DB user with isAdmin = true, and ONLY
 * those users. Curated entries in STAFF_MEMBERS supply a nicer handle/display
 * when the email is still an admin; ex-admins drop out automatically.
 */
export async function getAllStaffMembers(): Promise<StaffMember[]> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true, name: true },
    orderBy: { name: "asc" },
  })

  const curated = new Map(STAFF_MEMBERS.map(m => [m.email.toLowerCase(), m]))

  const roster = admins.map(a =>
    curated.get(a.email.toLowerCase()) ?? {
      email:   a.email,
      handle:  handleFromEmail(a.email),
      display: a.name?.trim() || a.email.split("@")[0],
    }
  )

  // Safety net: if the DB has no admins at all (misconfiguration), fall back
  // to the hardcoded list so tickets can still be assigned.
  return roster.length > 0 ? roster : STAFF_MEMBERS
}

/** Extract mentioned staff emails from note content against a given roster. */
export function parseMentionsFromList(content: string, members: StaffMember[]): string[] {
  const lower = content.toLowerCase()
  const mentioned: string[] = []
  for (const m of members) {
    if (lower.includes(`@${m.handle.toLowerCase()}`)) mentioned.push(m.email)
  }
  return mentioned
}
