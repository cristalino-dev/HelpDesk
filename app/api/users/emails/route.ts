/**
 * app/api/users/emails/route.ts — secondary addresses for a user (v3.101)
 *
 * WHY
 * ───
 * One person can reach the helpdesk from more than one mailbox: they sign in
 * to the web app with their Google account, and write to helpdesk@ from a
 * sister company's address. The ingest resolves a sender by address, finds
 * nothing, and creates a row — so their history ends up on an account they
 * cannot sign in to, and their dashboard shows one ticket out of twenty-five.
 *
 * Listing the second address here makes `lib/users.ts` resolve both to the
 * same row, and every entry point goes through that (rule 45).
 *
 * ENDPOINTS
 *   POST   { userId, email, merge? }  add an address
 *   DELETE { id }                     remove one
 *
 * Both are **admin only**: an address is an identity claim. Saying that
 * `x@elsewhere.com` is this employee hands whoever controls that mailbox the
 * right to read and reply to their tickets, so it is not a self-service field
 * and `addedBy` records who said so.
 *
 * THE INTERESTING CASE — the address is already a User
 * ────────────────────────────────────────────────────
 * Which is the normal case, because the ingest will have created that row the
 * first time they wrote in. The address cannot be both a `User.email` and a
 * `UserEmail.email`, so POST answers **409 with a count of what a merge would
 * move**, and the caller repeats the request with `merge: true` to go ahead.
 * Merging deletes a row and cannot be undone, so it never happens on the
 * first ask.
 *
 * RESPONSES
 *   200 — { ok, alias } or { ok, merged: { tickets, following, aliases } }
 *   400 — missing or malformed, or the address is already the user's own
 *   403 — not an admin
 *   409 — { needsMerge: true, owner, plan } — repeat with merge: true
 *   500 — logged
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { normalizeEmail, mergePreview, mergeUserInto } from "@/lib/users"

/** Deliberately loose: we reject shapes that are not an address, not domains. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { userId, email, merge } = await req.json()
    if (typeof userId !== "string" || typeof email !== "string") {
      return NextResponse.json({ error: "userId ו-email נדרשים" }, { status: 400 })
    }
    const wanted = normalizeEmail(email)
    if (!LOOKS_LIKE_EMAIL.test(wanted)) {
      return NextResponse.json({ error: "כתובת מייל לא תקינה" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: "המשתמש לא נמצא" }, { status: 404 })

    if (normalizeEmail(user.email) === wanted) {
      return NextResponse.json({ error: "זו כבר הכתובת הראשית של המשתמש" }, { status: 400 })
    }

    const existingAlias = await prisma.userEmail.findFirst({
      where: { email: { equals: wanted, mode: "insensitive" } },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (existingAlias) {
      return existingAlias.userId === userId
        ? NextResponse.json({ error: "הכתובת כבר רשומה למשתמש הזה" }, { status: 400 })
        : NextResponse.json({
            error: `הכתובת כבר רשומה ל${existingAlias.user.name ?? existingAlias.user.email}`,
          }, { status: 400 })
    }

    // The address belongs to a User of its own — the ordinary case, because
    // the mail ingest created that row. Folding it in is what the admin
    // actually wants, but not without being told what moves.
    const owner = await prisma.user.findFirst({
      where: { email: { equals: wanted, mode: "insensitive" } },
      select: { id: true, name: true, email: true, isAdmin: true },
    })
    if (owner) {
      if (owner.isAdmin) {
        return NextResponse.json({ error: "לא ניתן למזג חשבון מנהל" }, { status: 400 })
      }
      const plan = await mergePreview(owner.id)
      if (merge !== true) {
        return NextResponse.json({ needsMerge: true, owner, plan }, { status: 409 })
      }
      const merged = await mergeUserInto(owner.id, userId, session.user.email ?? "admin")
      return NextResponse.json({ ok: true, merged })
    }

    const alias = await prisma.userEmail.create({
      data: { email: wanted, userId, addedBy: session.user.email ?? "admin" },
    })
    return NextResponse.json({ ok: true, alias })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users/emails POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id } = await req.json()
    if (typeof id !== "string") return NextResponse.json({ error: "id נדרש" }, { status: 400 })

    // Removing an alias does not move anything back: tickets that arrived
    // under it stay where they are. It only stops FUTURE mail from that
    // address resolving to this person.
    await prisma.userEmail.delete({ where: { id } }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users/emails DELETE", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
