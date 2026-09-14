/**
 * app/api/tickets/bulk/route.ts — Bulk Ticket Mutation API
 *
 * PURPOSE:
 * ─────────
 * Allows staff and admins to update multiple tickets at once:
 *   - Status ("פתוח", "בטיפול", "בהמתנה", "סגור")
 *   - Priority / Urgency ("דחוף", "גבוה", "בינוני", "נמוך")
 *   - Category & Platform
 *   - Type (ticket / request, v3.87)
 *   - Assigned technician ("assignedTo")
 *   - Optional internal technician note added to all selected tickets
 *   - Submitter reassignment ("ownerEmail" — Admin only)
 *
 * The rules each ticket's change obeys — compound close, hold reason,
 * offboarding guard, self-assign → בטיפול, a history row per change, the
 * mail — live in lib/ticketChanges.ts since v3.88, shared with the public
 * API's PATCH. A ticket that cannot take the change is reported in `errors`;
 * the rest go ahead.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { getStaffEmails } from "@/lib/staffMembers"
import { NextRequest, NextResponse, after } from "next/server"
import { findUserByEmail } from "@/lib/users"
import { applyTicketChanges, TICKET_CHANGE_INCLUDE, type TicketChanges } from "@/lib/ticketChanges"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email ?? "")
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { ids, changes } = body as {
      ids?: string[]
      changes?: Pick<TicketChanges, "status" | "holdReason" | "urgency" | "category" | "platform" | "type" | "assignedTo" | "note"> & {
        ownerEmail?: string
      }
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No ticket IDs provided" }, { status: 400 })
    }
    if (!changes || typeof changes !== "object") {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 })
    }

    // Owner reassignment is admin-only
    let newOwner: { id: string; name: string | null; email: string } | null = null
    const wantedOwner = typeof changes.ownerEmail === "string" ? changes.ownerEmail.trim().toLowerCase() : ""
    if (wantedOwner !== "") {
      if (!session.user.isAdmin) {
        return NextResponse.json({ error: "Forbidden: Owner reassignment requires admin" }, { status: 403 })
      }
      newOwner = await findUserByEmail(wantedOwner)
      if (!newOwner) {
        return NextResponse.json({ error: "המשתמש המבוקש אינו רשום במערכת" }, { status: 400 })
      }
    }

    const actor = { name: session.user.name ?? session.user.email ?? "צוות", email: session.user.email ?? "" }
    const staffEmails = await getStaffEmails()
    // Only the fields a bulk edit may touch are passed on, whatever else was sent.
    const edit: TicketChanges = {
      status: changes.status, holdReason: changes.holdReason, urgency: changes.urgency,
      category: changes.category, platform: changes.platform, type: changes.type,
      assignedTo: changes.assignedTo, note: changes.note,
    }
    for (const k of Object.keys(edit) as (keyof TicketChanges)[]) if (edit[k] === undefined) delete edit[k]

    const errors: { ticketId: string; ticketNumber?: number; type?: string; error: string }[] = []
    let updatedCount = 0
    const pendingMails: Promise<void>[] = []

    for (const ticketId of ids) {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: TICKET_CHANGE_INCLUDE })
      if (!ticket) {
        errors.push({ ticketId, error: "פנייה לא נמצאה" })
        continue
      }
      const result = await applyTicketChanges({ ticket, changes: edit, actor, staffEmails, newOwner })
      if (!result.ok) {
        errors.push({ ticketId, ticketNumber: ticket.ticketNumber, type: ticket.type, error: result.error })
        continue
      }
      updatedCount++
      pendingMails.push(...result.mails)
    }

    // The response reports the rows, written above; it says nothing about the
    // mail. after() keeps the invocation alive until the sends finish, where a
    // bare `void` abandoned them at request teardown (rule 41).
    if (pendingMails.length > 0) {
      after(async () => { await Promise.all(pendingMails) })
    }

    return NextResponse.json({
      ok: true,
      total: ids.length,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/bulk POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
