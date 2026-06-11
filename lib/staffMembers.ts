/**
 * lib/staffMembers.ts — Server-side resolver for the effective staff roster.
 *
 * The hardcoded STAFF_MEMBERS list in lib/staffEmails.ts is the curated base
 * (nice handles + Hebrew display names). But any user flagged `isAdmin = true`
 * in the database is ALSO a staff member for the purposes of:
 *   - the ticket assignment dropdown
 *   - the @mention shortcuts above technician notes
 *   - @mention email parsing
 *
 * This module merges the two sources (hardcoded first, then DB admins not
 * already present), so newly-promoted admins appear everywhere automatically.
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
 * The effective staff roster: hardcoded STAFF_MEMBERS plus every DB user with
 * isAdmin = true, deduplicated by email (hardcoded entries win — they keep
 * their curated handle/display).
 */
export async function getAllStaffMembers(): Promise<StaffMember[]> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { email: true, name: true },
  })

  const byEmail = new Map<string, StaffMember>()
  for (const m of STAFF_MEMBERS) byEmail.set(m.email.toLowerCase(), m)

  for (const a of admins) {
    const key = a.email.toLowerCase()
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email:   a.email,
        handle:  handleFromEmail(a.email),
        display: a.name?.trim() || a.email.split("@")[0],
      })
    }
  }

  return Array.from(byEmail.values())
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
