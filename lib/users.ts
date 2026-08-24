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
 * WHAT THIS DOES NOT FIX
 * ──────────────────────
 * The remaining hole is in the database, not here. Two addresses differing
 * only in case are still two legal values of a `String @unique` column, so a
 * row created concurrently with capitals — only `auth.ts` does that — can
 * still land beside one of ours. Closing it properly means a unique index on
 * `lower(email)`, which is a raw-SQL migration run inside the deploy swap
 * window and belongs in its own change. This removes every duplicate the
 * application can produce on its own; it does not make the column
 * case-insensitive.
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
 * @param name Display name, applied only when the row is created. An existing
 *             row is never renamed — their own profile edit outranks whatever
 *             a mail header or a typed-in form field claims they are called.
 */
export async function resolveUserByEmail(email: string, name?: string | null) {
  const existing = await findUserByEmail(email)
  if (existing) return existing

  // Genuinely new. `upsert` rather than `create` so that two requests racing
  // on the same brand-new address collide harmlessly on the unique index
  // instead of one of them throwing P2002 into the caller's face.
  const normalized = normalizeEmail(email)
  return prisma.user.upsert({
    where:  { email: normalized },
    create: { email: normalized, name: name?.trim() || null },
    update: {},
  })
}
