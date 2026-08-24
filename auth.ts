/**
 * auth.ts — NextAuth v5 Configuration
 *
 * PURPOSE:
 * ─────────
 * This file is the single configuration point for authentication. It exports
 * four named exports used throughout the application:
 *
 *   handlers — Next.js Route Handler for GET/POST /api/auth/[...nextauth]
 *              (wired up in app/api/auth/[...nextauth]/route.ts)
 *   signIn   — Server action to start a sign-in flow (used in login page)
 *   signOut  — Server action to end a session (used in header buttons)
 *   auth     — Server-side session accessor. Call `await auth()` in any
 *              Server Component or API Route to get the current session.
 *
 * AUTHENTICATION FLOW:
 * ─────────────────────
 *   1. User clicks "התחברות עם Google" on /login.
 *   2. signIn("google") redirects to Google's OAuth consent screen.
 *   3. Google redirects back to /api/auth/callback/google.
 *   4. NextAuth calls the `session` callback below with the Google profile.
 *   5. We look up (or create) the user in our PostgreSQL database.
 *   6. We attach isAdmin and id to the session object.
 *   7. The session is stored in a JWT cookie (AUTH_SECRET signs it).
 *   8. Every subsequent request can call `await auth()` to read the session.
 *
 * AUTO-PROVISIONING:
 * ───────────────────
 * When a Cristalino employee signs in for the first time, their account does
 * NOT exist in our database. The `session` callback handles this transparently
 * via `resolveUserByEmail()`, giving them a regular (non-admin) account. No
 * manual registration step required.
 *
 * EMAIL CASE (v3.66):
 * ──────────────────
 * This file used to be the one place that wrote an email exactly as Google
 * handed it over, capitals and all, while every other entry point normalised
 * first — which is how one person could end up with two rows (v3.65, rule 45).
 * It now goes through lib/users.ts like everybody else: matched
 * case-insensitively, created lowercased.
 *
 * It also writes the stored address back onto the session. That is the part
 * the rest of the app depends on: some thirty places match
 * `session.user.email` against a stored email exactly — by `===`, by
 * `.includes()`, or as a `where: { email }` — for ticket ownership, message
 * authorship, the self-notification filter, STAFF_EMAILS membership.
 * Normalising the row but leaving the session holding Google's casing would
 * break every one of them. The invariant to preserve is simply:
 *
 *   session.user.email is the address as the database stores it.
 *
 * ADMIN ASSIGNMENT:
 * ──────────────────
 * There are two ways to grant admin access:
 *   A) Environment variable ADMIN_EMAILS — applied on first login only
 *      (see auth.ts if you want to re-add that logic; it was considered and
 *      kept simple for now — just use the DB method).
 *   B) Direct database update:
 *        UPDATE "User" SET "isAdmin" = true WHERE email = 'user@cristalino.co.il';
 *      On the next login, the session callback will pick up the change.
 *
 * ENVIRONMENT VARIABLES REQUIRED:
 * ─────────────────────────────────
 *   AUTH_SECRET          — Random string for signing JWT cookies.
 *                          Generate: openssl rand -base64 32
 *   AUTH_GOOGLE_ID       — Google OAuth client ID
 *   AUTH_GOOGLE_SECRET   — Google OAuth client secret
 *   NEXTAUTH_URL         — Public URL of the app (must match Google OAuth redirect URI)
 *   AUTH_TRUST_HOST=true — Required when running behind a reverse proxy or on non-localhost
 */

import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { resolveUserByEmail } from "@/lib/users"

export const { handlers, signIn, signOut, auth } = NextAuth({
  /**
   * providers — list of OAuth providers enabled for this app.
   * Only Google is used; employees must sign in with their @cristalino account.
   */
  providers: [Google],

  callbacks: {
    /**
     * session callback — called every time a session is accessed.
     *
     * NextAuth passes us the session built from the JWT cookie. We enrich it
     * with data from our own database (isAdmin, id) before returning it to
     * the caller. This is the bridge between Google's identity and our app's
     * authorization model.
     *
     * @param session - The session object as built by NextAuth from the JWT.
     * @returns The same session object, augmented with isAdmin and id.
     */
    async session({ session }) {
      if (session.user?.email) {
        // Find the row for this address ignoring case, or create it lowercased
        // on a first-ever sign-in. isAdmin defaults to false (Prisma schema);
        // name and image are applied on create only, so a later profile edit
        // is never overwritten by whatever Google currently says.
        const user = await resolveUserByEmail(
          session.user.email,
          session.user.name,
          session.user.image,
        )

        // The address as the database stores it — see EMAIL CASE above. Every
        // `session.user.email === someStoredEmail` in the app rides on this.
        session.user.email = user.email

        // Attach our application-specific fields to the session.
        // These are declared in types/next-auth.d.ts.
        session.user.isAdmin = user.isAdmin  // Controls /admin access
        session.user.id = user.id            // DB primary key (CUID)
      }
      return session
    },
  },
})
