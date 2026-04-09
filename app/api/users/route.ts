/**
 * app/api/users/route.ts — Admin User Management API
 *
 * ENDPOINTS:
 * ───────────
 *   GET   /api/users  — Fetch all users (admins only)
 *   PATCH /api/users  — Update any user's profile or admin flag (admins only)
 *
 * PURPOSE:
 * ─────────
 * This route powers the "ניהול משתמשים" tab in the admin panel. Admins can:
 *   - View all registered users (anyone who has ever signed in)
 *   - Edit a user's name, phone, and workstation
 *   - Toggle the isAdmin flag to grant or revoke admin privileges
 *
 * IMPORTANT: The isAdmin toggle takes effect on the target user's NEXT login.
 * The session callback in auth.ts reads isAdmin from the DB fresh each time,
 * so there is at most a one-session delay before the change is visible.
 *
 * AUTHORIZATION:
 * ───────────────
 * Both endpoints are admin-only. The check uses session.user.isAdmin which
 * was set by the auth.ts session callback from the database value.
 *
 * SECURITY NOTE:
 * ───────────────
 * An admin can theoretically revoke their own admin flag. This is intentional
 * (no special-casing for the self-update case) — it's an internal tool.
 * Restoring access is done via direct SQL if needed.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/users
 *
 * Returns all users registered in the system, sorted alphabetically by name.
 * Excludes sensitive fields (image URL is not returned; passwords don't exist
 * since we use OAuth-only auth).
 *
 * RESPONSE BODY (JSON array of UserRow objects):
 *   id       {string}         CUID primary key
 *   name     {string | null}  Display name (null if never set)
 *   email    {string}         Google email address (unique, used as login identity)
 *   phone    {string | null}  Contact phone (null if never set)
 *   station  {string | null}  Workstation hostname (null if never set)
 *   isAdmin  {boolean}        Whether the user has admin privileges
 *
 * RESPONSES:
 *   200 — Array of user objects
 *   403 — Not an admin
 *   500 — Database error (logged)
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        station: true,
        isAdmin: true,
        // image is intentionally excluded — not needed in admin table
      },
      orderBy: { name: "asc" }, // Alphabetical; nulls sort first in PostgreSQL
    })

    return NextResponse.json(users)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/users
 *
 * Updates any user's editable fields. Used by the admin edit modal.
 * Unlike /api/profile (which only allows self-edit), this endpoint allows
 * an admin to edit any user by their database ID.
 *
 * REQUEST BODY (JSON):
 *   id       {string}   CUID of the user to update (required)
 *   name     {string}   New display name
 *   phone    {string}   New phone number
 *   station  {string}   New workstation hostname
 *   isAdmin  {boolean}  New admin flag value
 *
 * RESPONSE BODY (JSON): The updated user object (same shape as GET response)
 *
 * RESPONSES:
 *   200 — Updated user object
 *   403 — Not an admin
 *   500 — Database error (logged)
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id, name, phone, station, isAdmin } = await req.json()

    const user = await prisma.user.update({
      where: { id },
      data: { name, phone, station, isAdmin },
      select: { id: true, name: true, email: true, phone: true, station: true, isAdmin: true },
    })

    return NextResponse.json(user)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
