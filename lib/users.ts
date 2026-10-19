/**
 * lib/users.ts — Resolving a User row from an email address.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `auth.ts` creates the User row with `session.user.email` exactly as Google
 * handed it over, so a row can carry capitals. Every *other* entry point
 * normalises the address it was given before using it — a value picked in the
 * on-behalf dropdown, an inbound `From:` header — and then matched the row
 * exactly. When those two disagree the lookup misses a row that plainly
 * exists, and an `upsert` built on that miss does not update anything: it
 * INSERTS A SECOND ROW for the same person. Their tickets then split across
 * two accounts, and only one of them is the one they sign in to.
 *
 * So: match case-insensitively, create normalised.
 *
 * WHAT GUARANTEES IT (v3.66)
 * ─────────────────────────
 * Care in the application is not a constraint. Until v3.66 two addresses
 * differing only in case were still two legal values of a `String @unique`
 * column, so a row created concurrently with capitals could land beside one of
 * ours no matter how carefully this module matched. The database now refuses
 * it: `UNIQUE (lower(email))`, added by the migration
 * `20260824000000_user_email_case_insensitive`.
 *
 * That makes this module the happy path rather than the only guard. Every
 * caller — `auth.ts` included, since v3.66 — goes through it, so the index
 * should never actually fire; if it does, it fires as a P2002 on
 * `User_email_lower_key` and something wrote an email without coming here.
 *
 * `normalizeEmail` is the definition of the stored form, and the index is the
 * enforcement of it. Keep them saying the same thing.
 */

import { prisma } from "@/lib/db"

/** The stored form of an address: trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Finds a User by email, ignoring case.
 *
 * `findFirst` rather than `findUnique` because only `findFirst` accepts
 * `mode: "insensitive"`. The email column is unique, so "first" is "the one".
 *
 * @returns the row, or null when nobody is registered under that address.
 */
export async function findUserByEmail(email: string) {
  const wanted = normalizeEmail(email)
  if (wanted === "") return null

  const direct = await prisma.user.findFirst({
    where: { email: { equals: wanted, mode: "insensitive" } },
  })
  if (direct) return direct

  // A secondary address (v3.101). Checked only after the primary, so a row
  // whose own email is this address always wins — an alias can never shadow a
  // real account, whatever an admin typed.
  const alias = await prisma.userEmail.findFirst({
    where: { email: { equals: wanted, mode: "insensitive" } },
    include: { user: true },
  })
  return alias?.user ?? null
}

/**
 * Finds a User by email, creating one if the address is genuinely new.
 *
 * Use this wherever the caller may legitimately be naming somebody who has
 * never signed in — an admin filing a ticket for a new hire, an email arriving
 * from an address we have not seen. Where the person must already exist (the
 * מגיש picker, which offers the roster), use `findUserByEmail` and treat null
 * as the error it is.
 *
 * @param name  Display name, applied only when the row is created. An existing
 *              row is never renamed — their own profile edit outranks whatever
 *              a mail header or a typed-in form field claims they are called.
 * @param image Profile photo URL, same rule: set on create, never overwritten.
 *              Only `auth.ts` has one to pass (Google supplies it).
 */
export async function resolveUserByEmail(email: string, name?: string | null, image?: string | null) {
  const existing = await findUserByEmail(email)
  if (existing) return existing

  // Genuinely new. `upsert` rather than `create` so that two requests racing
  // on the same brand-new address collide harmlessly on the unique index
  // instead of one of them throwing P2002 into the caller's face.
  //
  // Both racers insert the SAME normalised string, so they collide on the
  // plain `User_email_key` — the constraint `upsert` knows how to absorb. The
  // case-insensitive index cannot be reached from here for exactly that
  // reason: normalising first is what keeps this an absorbed conflict rather
  // than a P2002 thrown at the caller.
  const normalized = normalizeEmail(email)
  return prisma.user.upsert({
    where:  { email: normalized },
    create: { email: normalized, name: name?.trim() || null, image: image ?? null },
    update: {},
  })
}

// ── Two rows, one person (v3.101) ────────────────────────────────────────────

/** What a merge would move, or did. */
export interface MergePlan {
  tickets: number
  following: number
  aliases: number
}

/**
 * Counts what `mergeUserInto` would move, without moving it.
 *
 * The caller shows this before asking for confirmation: merging deletes a row
 * and there is no undo, so "24 tickets will move" has to be visible first.
 */
export async function mergePreview(fromId: string): Promise<MergePlan> {
  const [tickets, following, aliases] = await Promise.all([
    prisma.ticket.count({ where: { userId: fromId } }),
    prisma.ticketParticipant.count({ where: { userId: fromId } }),
    prisma.userEmail.count({ where: { userId: fromId } }),
  ])
  return { tickets, following, aliases }
}

/**
 * Folds one User row into another and keeps the loser's address as an alias.
 *
 * The case this exists for: somebody writes to the helpdesk from a sister
 * company's mailbox, so the mail ingest creates a row for that address, and
 * later signs in with their Google account, which is a different row. Their
 * history is then on an account they cannot reach. This moves it, and the old
 * address becomes a secondary address of the surviving row — so the next mail
 * from it files under the right person instead of starting the split again.
 *
 * What is NOT rewritten: `authorEmail` on messages and notes, `actorEmail` on
 * history. Those record who did something at the time, under the address they
 * did it from, and that remains true.
 */
export async function mergeUserInto(
  fromId: string,
  intoId: string,
  addedBy: string,
): Promise<MergePlan> {
  if (fromId === intoId) throw new Error("A user cannot be merged into itself")

  return prisma.$transaction(async tx => {
    const from = await tx.user.findUnique({ where: { id: fromId } })
    const into = await tx.user.findUnique({ where: { id: intoId } })
    if (!from || !into) throw new Error("Both users must exist")

    const plan = {
      tickets:   await tx.ticket.count({ where: { userId: fromId } }),
      following: await tx.ticketParticipant.count({ where: { userId: fromId } }),
      aliases:   await tx.userEmail.count({ where: { userId: fromId } }),
    }

    // TicketParticipant is unique on (ticketId, userId), so a ticket both rows
    // follow would collide on the way across; and a ticket the survivor will
    // now OWN has no business also listing them as a follower. Drop both
    // before moving anything.
    const survivorFollows = await tx.ticketParticipant.findMany({
      where: { userId: intoId }, select: { ticketId: true },
    })
    const ownedByLoser = await tx.ticket.findMany({
      where: { userId: fromId }, select: { id: true },
    })
    await tx.ticketParticipant.deleteMany({
      where: {
        userId: fromId,
        ticketId: { in: survivorFollows.map(p => p.ticketId) },
      },
    })
    await tx.ticketParticipant.deleteMany({
      where: {
        userId: intoId,
        ticketId: { in: ownedByLoser.map(t => t.id) },
      },
    })

    await tx.ticket.updateMany({ where: { userId: fromId }, data: { userId: intoId } })
    await tx.ticketParticipant.updateMany({ where: { userId: fromId }, data: { userId: intoId } })
    await tx.userEmail.updateMany({ where: { userId: fromId }, data: { userId: intoId } })

    // The loser's own address becomes an alias of the survivor. Created before
    // the delete would violate nothing, but after it is simpler to read: the
    // row is gone, so the address is free.
    await tx.user.delete({ where: { id: fromId } })
    await tx.userEmail.create({
      data: { email: normalizeEmail(from.email), userId: intoId, addedBy },
    })

    return plan
  })
}
