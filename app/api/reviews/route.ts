/**
 * app/api/reviews/route.ts — Ticket Review API
 *
 * ENDPOINTS:
 * ───────────
 *   GET   /api/reviews               — Returns all reviews (admin/staff only)
 *   GET   /api/reviews?ticket={id}   — Returns ticket info + existing review if any
 *                                      (public — used to bootstrap the review page)
 *   POST  /api/reviews               — Submit a new review for a closed ticket
 *   PATCH /api/reviews               — Update an existing review (change rating/comment)
 *
 * Both POST and PATCH are public (no auth). The ticket's CUID is unguessable
 * so only the email recipient can reach the review URL.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextRequest, NextResponse } from "next/server"

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const ticketId = searchParams.get("ticket")

    // ── Public bootstrap call from the review page ──
    if (ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { ticketNumber: true, subject: true, status: true, createdAt: true },
      })
      if (!ticket) return NextResponse.json({ error: "לא נמצאה פנייה" }, { status: 404 })

      const existing = await prisma.ticketReview.findUnique({
        where: { ticketId },
        select: { id: true, rating: true, comment: true },
      })
      return NextResponse.json({ ticket, existingReview: existing ?? null })
    }

    // ── Admin list ──
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const isAdminOrStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email ?? "")
    if (!isAdminOrStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const reviews = await prisma.ticketReview.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        ticket: { select: { ticketNumber: true, subject: true } },
      },
    })
    return NextResponse.json(reviews)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/reviews GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { ticketId, rating, comment } = await req.json()

    if (!ticketId || typeof ticketId !== "string") {
      return NextResponse.json({ error: "ticketId חסר" }, { status: 400 })
    }
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "דירוג חייב להיות בין 1 ל-5" }, { status: 400 })
    }

    // Validate ticket exists and is closed
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!ticket) return NextResponse.json({ error: "לא נמצאה פנייה" }, { status: 404 })
    if (ticket.status !== "סגור") {
      return NextResponse.json({ error: "ניתן לדרג רק פניות סגורות" }, { status: 400 })
    }

    // Enforce one review per ticket (use PATCH to update)
    const existing = await prisma.ticketReview.findUnique({ where: { ticketId } })
    if (existing) {
      return NextResponse.json({ error: "ביקורת כבר קיימת — השתמשו ב-PATCH לעדכון" }, { status: 409 })
    }

    const review = await prisma.ticketReview.create({
      data: {
        ticketId,
        rating,
        comment: comment && typeof comment === "string" && comment.trim() ? comment.trim() : null,
        submitterName:  ticket.user?.name  ?? ticket.user?.email ?? "משתמש",
        submitterEmail: ticket.user?.email ?? "",
      },
    })

    return NextResponse.json(review, { status: 201 })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/reviews POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const { ticketId, rating, comment } = await req.json()

    if (!ticketId || typeof ticketId !== "string") {
      return NextResponse.json({ error: "ticketId חסר" }, { status: 400 })
    }
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "דירוג חייב להיות בין 1 ל-5" }, { status: 400 })
    }

    // Ticket must still exist and be closed
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true },
    })
    if (!ticket) return NextResponse.json({ error: "לא נמצאה פנייה" }, { status: 404 })
    if (ticket.status !== "סגור") {
      return NextResponse.json({ error: "ניתן לדרג רק פניות סגורות" }, { status: 400 })
    }

    // Review must already exist
    const existing = await prisma.ticketReview.findUnique({ where: { ticketId } })
    if (!existing) {
      return NextResponse.json({ error: "לא נמצאה ביקורת לעדכון — השתמשו ב-POST" }, { status: 404 })
    }

    const updated = await prisma.ticketReview.update({
      where: { ticketId },
      data: {
        rating,
        comment: comment && typeof comment === "string" && comment.trim() ? comment.trim() : null,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/reviews PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
