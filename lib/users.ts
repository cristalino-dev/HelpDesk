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
  return prisma.user.findFirst({
    where: { email: { equals: wanted, mode: "insensitive" } },
  })
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
