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
 * An admin can revoke their own admin flag (no special-casing for self-update),
 * BUT the system never allows the last admin to be demoted or deleted — staff
 * email notifications and the whole admin panel depend on at least one admin
 * existing. The guard lives in PATCH and DELETE below.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { resolveContact } from "@/lib/contactDetails"
import { resolveUserByEmail } from "@/lib/users"
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
 * QUERY PARAMETERS:
 *   withContact=1  Also resolve the best-known phone and workstation for each
 *                  user, falling back to their most recent ticket when the
 *                  profile column is empty, and say which source each came
 *                  from. Adds phone/station/phoneFrom/stationFrom — see
 *                  lib/contactDetails.ts. Off by default: the admin user table
 *                  shows the profile itself and must not show a guess.
 *
 * RESPONSES:
 *   200 — Array of user objects
 *   403 — Not an admin
 *   500 — Database error (logged)
 */
export async function GET(req: NextRequest) {
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

    // ?withContact=1 — the ticket form's "open in someone else's name" picker
    // asks for this; the admin user table does not, and pays nothing for it.
    // Two extra queries in total, not one per user: `distinct` on a descending
    // sort gives the newest row per user, and the emptiness filter is IN the
    // query so a person whose latest ticket happened to omit a field still
    // gets the last one that filled it.
    if (req.nextUrl.searchParams.get("withContact") !== "1") {
      return NextResponse.json(users)
    }

    const ids = users.map(u => u.id)
    // Spelled out twice rather than parameterised on the field name: Prisma's
    // types are what make `select` safe, and a computed key erases them.
    const [byPhone, byStation] = await Promise.all([
      prisma.ticket.findMany({
        where: { userId: { in: ids }, phone: { not: "" } },
        orderBy: { createdAt: "desc" },
        distinct: ["userId"],
        select: { userId: true, phone: true },
      }),
      prisma.ticket.findMany({
        where: { userId: { in: ids }, computerName: { not: "" } },
        orderBy: { createdAt: "desc" },
        distinct: ["userId"],
        select: { userId: true, computerName: true },
      }),
    ])
    const phoneOf = new Map(byPhone.map(t => [t.userId, t.phone]))
    const stationOf = new Map(byStation.map(t => [t.userId, t.computerName]))

    return NextResponse.json(users.map(u => ({
      ...u,
      ...resolveContact(u, { phone: phoneOf.get(u.id), computerName: stationOf.get(u.id) }),
    })))
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

    // LAST-ADMIN GUARD — never let the system reach 0 admins: staff email
    // notifications and admin-panel access are driven by the isAdmin flag.
    if (isAdmin === false) {
      const target = await prisma.user.findUnique({ where: { id }, select: { isAdmin: true } })
      if (target?.isAdmin) {
        const otherAdmins = await prisma.user.count({ where: { isAdmin: true, id: { not: id } } })
        if (otherAdmins === 0) {
          return NextResponse.json({ error: "לא ניתן להסיר את המנהל האחרון במערכת" }, { status: 400 })
        }
      }
    }

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

/**
 * DELETE /api/users
 *
 * Permanently deletes a user account. Admin-only.
 * If the user owns tickets, those tickets are first reassigned to the
 * helpdesk fallback account (helpdesk@cristalino.co.il), which is
 * created automatically if it doesn't already exist as a User record.
 * Self-deletion is blocked.
 *
 * REQUEST BODY (JSON):
 *   id  {string}  CUID of the user to delete (required)
 *
 * RESPONSES:
 *   200 — { ok: true, reassigned: <count of reassigned tickets> }
 *   400 — Attempted self-deletion
 *   403 — Not an admin
 *   500 — Database error (logged)
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await req.json()

    // Prevent self-deletion
    if (session.user.email) {
      const self = await prisma.user.findUnique({ where: { email: session.user.email } })
      if (self?.id === id) return NextResponse.json({ error: "לא ניתן למחוק את המשתמש שלך" }, { status: 400 })
    }

    // LAST-ADMIN GUARD — deleting the last admin would leave 0 admins
    const target = await prisma.user.findUnique({ where: { id }, select: { isAdmin: true } })
    if (target?.isAdmin) {
      const otherAdmins = await prisma.user.count({ where: { isAdmin: true, id: { not: id } } })
      if (otherAdmins === 0) {
        return NextResponse.json({ error: "לא ניתן למחוק את המנהל האחרון במערכת" }, { status: 400 })
      }
    }

    // Find or create the helpdesk fallback account that will inherit the
    // tickets. Case-insensitively: a second fallback account would silently
    // strand the reassigned tickets on a row nobody signs in to.
    const fallback = await resolveUserByEmail("helpdesk@cristalino.co.il", "Helpdesk")

    // Reassign all of the deleted user's tickets to the fallback account
    const { count: reassigned } = await prisma.ticket.updateMany({
      where: { userId: id },
      data:  { userId: fallback.id },
    })

    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ ok: true, reassigned })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
