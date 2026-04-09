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
 * NOT exist in our database. The `session` callback handles this transparently:
 * it calls prisma.user.create() with the email/name/image from Google, giving
 * them a regular (non-admin) account. No manual registration step required.
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
import { prisma } from "@/lib/db"

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
        // Look up the user by their Google email address.
        let user = await prisma.user.findUnique({ where: { email: session.user.email } })

        // First-time login: the user doesn't exist in our database yet.
        // Create a minimal record with their Google profile data.
        // isAdmin defaults to false (see Prisma schema).
        if (!user) {
          user = await prisma.user.create({
            data: {
              email: session.user.email,
              name: session.user.name,     // Display name from Google
              image: session.user.image,   // Profile photo URL from Google
            },
          })
        }

        // Attach our application-specific fields to the session.
        // These are declared in types/next-auth.d.ts.
        session.user.isAdmin = user.isAdmin  // Controls /admin access
        session.user.id = user.id            // DB primary key (CUID)
      }
      return session
    },
  },
})
