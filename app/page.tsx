/**
 * app/page.tsx — Root Route Redirect
 *
 * PURPOSE:
 * ─────────
 * The root path "/" has no meaningful content of its own. Instead, it
 * immediately redirects the user to the appropriate page based on their
 * authentication state and role.
 *
 * REDIRECT LOGIC:
 * ────────────────
 *   No session  → /login     (user must authenticate first)
 *   Admin user  → /admin     (admins start at the ticket management queue)
 *   Regular user → /dashboard (employees start at their ticket list)
 *
 * WHY SERVER COMPONENT?
 * ──────────────────────
 * This page uses `auth()` from auth.ts (a server-side function) and Next.js's
 * `redirect()`. Both require a Server Component — no "use client" directive.
 * The redirect happens on the server before any HTML is sent to the browser,
 * so users see zero flash of the wrong page.
 *
 * This is the entry point for all direct visits to the app's root URL,
 * including after login (NextAuth redirects to /dashboard via the callbackUrl,
 * but the root "/" route handles any direct navigation).
 */

import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  // auth() reads the session from the JWT cookie without any DB query.
  // Returns null if no valid session exists.
  const session = await auth()

  if (!session) redirect("/login")              // Not logged in
  if (session.user.isAdmin) redirect("/admin")  // Admin: go to ticket queue
  redirect("/dashboard")                         // Regular user: go to their tickets
}
