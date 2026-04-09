/**
 * app/api/profile/route.ts — User Profile API
 *
 * ENDPOINTS:
 * ───────────
 *   GET   /api/profile  — Fetch the current user's profile fields
 *   PATCH /api/profile  — Update the current user's profile fields
 *
 * PURPOSE:
 * ─────────
 * This route manages the editable portion of a user's account: their
 * display name, phone number, and workstation name. These three fields
 * exist on the User table (added in migration 20260409082813) and are
 * surfaced in two places:
 *
 *   1. /profile page — lets the user edit them directly
 *   2. /dashboard page — fetches them on load and passes as defaults
 *      to TicketForm, so the phone and computerName fields are
 *      pre-filled every time a new ticket is opened.
 *
 * AUTHORIZATION:
 * ───────────────
 * Both endpoints require an authenticated session. The user can only
 * read/write their own profile — the identity is resolved from the
 * session email, not from a user-supplied ID, preventing spoofing.
 *
 * The PATCH endpoint also updates the NextAuth JWT session via the
 * `update()` function on the client (see app/profile/page.tsx) so the
 * displayed name in the header reflects the change immediately without
 * needing to sign out and back in.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/profile
 *
 * Returns the current user's editable profile fields.
 *
 * RESPONSE BODY (JSON):
 *   name     {string | null}  Full display name (first + last, joined with space)
 *   email    {string}         Google email address (read-only, from OAuth)
 *   phone    {string | null}  Contact phone number
 *   station  {string | null}  Workstation hostname (used to pre-fill computerName)
 *
 * RESPONSES:
 *   200 — Profile object (fields may be null if not yet filled in)
 *   401 — Not authenticated
 *   500 — Database error (logged)
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      // Only return the fields the profile page and form pre-fill need.
      // image and isAdmin are NOT exposed by this endpoint.
      select: { phone: true, station: true, name: true, email: true },
    })

    // Return empty object if user somehow not found (shouldn't happen — auth
    // creates the row on first login, but defensive coding here is cheap).
    return NextResponse.json(user ?? {})
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/profile GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/profile
 *
 * Updates the current user's editable profile fields.
 * The client (profile page) also calls NextAuth's `update()` to refresh
 * the JWT so the session name updates without a full sign-out.
 *
 * REQUEST BODY (JSON):
 *   name     {string}  Full display name (first + last joined by space)
 *   phone    {string}  Contact phone number
 *   station  {string}  Workstation hostname
 *
 * RESPONSE BODY (JSON):
 *   name, phone, station — the saved values (mirrors the input)
 *
 * RESPONSES:
 *   200 — Updated profile object
 *   401 — Not authenticated
 *   500 — Database error (logged)
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { name, phone, station } = await req.json()

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { name, phone, station },
      select: { name: true, phone: true, station: true },
    })

    return NextResponse.json(user)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/profile PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
