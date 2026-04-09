/**
 * types/next-auth.d.ts — NextAuth Session Type Augmentation
 *
 * PURPOSE:
 * ─────────
 * NextAuth's default Session type only includes the user fields that come
 * from Google OAuth: name, email, image. Our application needs two extra
 * fields on every session:
 *
 *   isAdmin — controls access to /admin and admin-only API endpoints.
 *             Set from the database User.isAdmin column inside the
 *             `session` callback in auth.ts.
 *
 *   id      — the database primary key of the User row (CUID string).
 *             Needed whenever a server action must look up the current
 *             user without an extra database query by email.
 *
 * HOW IT WORKS:
 * ──────────────
 * TypeScript's "declaration merging" allows us to extend an interface
 * declared in an external package (next-auth) inside our own codebase.
 * We re-open the `Session` interface and intersect our extra fields with
 * `DefaultSession["user"]` (which already has name, email, image).
 *
 * Without this file, accessing `session.user.isAdmin` would produce a
 * TypeScript error "Property 'isAdmin' does not exist on type '...'",
 * and developers would be tempted to use unsafe `(session.user as any).isAdmin`.
 *
 * WHERE THE VALUES ARE SET:
 * ──────────────────────────
 * See auth.ts → callbacks.session:
 *   session.user.isAdmin = user.isAdmin  // from DB
 *   session.user.id      = user.id       // from DB
 */

import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      /** Whether the user has admin privileges. Sourced from User.isAdmin in the DB. */
      isAdmin: boolean
      /** The CUID primary key of the user's row in the User table. */
      id: string
    } & DefaultSession["user"]
  }
}
