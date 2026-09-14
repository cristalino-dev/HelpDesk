/**
 * app/api/tickets/bulk/route.ts — Bulk Ticket Mutation API
 *
 * PURPOSE:
 * ─────────
 * Allows staff and admins to update multiple tickets at once:
 *   - Status ("פתוח", "בטיפול", "בהמתנה", "סגור")
 *   - Priority / Urgency ("דחוף", "גבוה", "בינוני", "נמוך")
 *   - Category & Platform
 *   - Assigned technician ("assignedTo")
 *   - Optional internal technician note added to all selected tickets
 *   - Submitter reassignment ("ownerEmail" — Admin only)
 *
 * INVARIANTS:
 * ───────────
 * 1. Compound close: Setting status → "סגור" automatically sets urgency → "נמוך".
 * 2. Offboarding close guard: Offboarding tickets ("סגירת משתמש" / "עובד עוזב")
 *    with unreceived equipment items cannot be closed and are recorded in errors.
 * 3. Hold reason: Setting status → "בהמתנה" sets holdReason; leaving clears it.
 * 4. Auto-in-progress: Assigning to oneself while ticket is "פתוח" sets status to "בטיפול".
 * 5. Full audit history: Every field change records a TicketHistory row.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { getStaffEmails } from "@/lib/staffMembers"
import { sendMail, mailTicketUpdatedStaff, mailTicketStatusUser, mailTicketClosedWithReview } from "@/lib/mail"
import { subjects } from "@/lib/mailSubjects"
import { NextRequest, NextResponse, after } from "next/server"
import { isOffboarding, offboardingBlockers, blockerMessage } from "@/lib/offboarding"
import { findUserByEmail } from "@/lib/users"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email ?? "")
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { ids, changes } = body as {
      ids?: string[]
      changes?: {
        status?: string
        holdReason?: string
        urgency?: string
        category?: string
        platform?: string
        assignedTo?: string
        note?: string
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

    const actorName = session.user.name ?? session.user.email ?? "צוות"
    const actorEmail = session.user.email ?? ""
    const allStaffEmails = await getStaffEmails()

    const errors: { ticketId: string; ticketNumber?: number; error: string }[] = []
    let updatedCount = 0
    const pendingMails: Promise<void>[] = []

    for (const ticketId of ids) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          user: { select: { name: true, email: true } },
          equipment: { select: { label: true, quantity: true, receivedQty: true } },
        },
      })

      if (!ticket) {
        errors.push({ ticketId, error: "פנייה לא נמצאה" })
        continue
      }

      // Offboarding closure check
      if (changes.status === "סגור" && isOffboarding(ticket.category)) {
        const blockers = offboardingBlockers(ticket.equipment)
        if (blockers.length > 0) {
          errors.push({
            ticketId,
            ticketNumber: ticket.ticketNumber,
            error: blockerMessage(blockers),
          })
          continue
        }
      }

      const data: Record<string, string | null> = {}

      if (changes.status !== undefined) data.status = changes.status
      if (changes.urgency !== undefined) data.urgency = changes.urgency
      if (changes.category !== undefined) data.category = changes.category
      if (changes.platform !== undefined) data.platform = changes.platform
      // "" is "unassigned", stored as sent, as PATCH /api/tickets stores it.
      // The column is NOT NULL: turning "" into null threw inside the
      // transaction, and every bulk unassign came back 500.
      if (changes.assignedTo !== undefined) data.assignedTo = changes.assignedTo
      if (newOwner && newOwner.id !== ticket.userId) {
        data.userId = newOwner.id
      }

      // On-hold reason
      if (changes.status === "בהמתנה") {
        if (!changes.holdReason?.trim()) {
          errors.push({
            ticketId,
            ticketNumber: ticket.ticketNumber,
            error: "יש להזין סיבת המתנה",
          })
          continue
        }
        data.holdReason = changes.holdReason.trim()
      }
      // Leaving hold
      if (changes.status !== undefined && changes.status !== "בהמתנה" && ticket.status === "בהמתנה") {
        data.holdReason = null
      }
      // Compound close
      if (data.status === "סגור") {
        data.urgency = "נמוך"
      }
      // Auto-in-progress on self-assignment
      if (
        changes.assignedTo !== undefined &&
        changes.assignedTo === session.user.email &&
        ticket.status === "פתוח" &&
        changes.status === undefined
      ) {
        data.status = "בטיפול"
      }

      // Build history entries
      type HistoryRow = {
        ticketId: string
        field: string
        oldValue?: string | null
        newValue?: string | null
        actorName: string
        actorEmail: string
      }
      const historyEntries: HistoryRow[] = []

      if (data.status !== undefined && data.status !== ticket.status) {
        const newVal =
          data.status === "בהמתנה" && data.holdReason ? `בהמתנה: ${data.holdReason}` : data.status
        historyEntries.push({
          ticketId,
          field: "status",
          oldValue: ticket.status,
          newValue: newVal,
          actorName,
          actorEmail,
        })
      }

      const effectiveUrgency = data.urgency
      if (effectiveUrgency !== undefined && effectiveUrgency !== ticket.urgency) {
        historyEntries.push({
          ticketId,
          field: "urgency",
          oldValue: ticket.urgency ?? null,
          newValue: effectiveUrgency,
          actorName,
          actorEmail,
        })
      }

      if (changes.assignedTo !== undefined && (data.assignedTo ?? null) !== (ticket.assignedTo ?? null)) {
        historyEntries.push({
          ticketId,
          field: "assignedTo",
          oldValue: ticket.assignedTo,
          newValue: data.assignedTo,
          actorName,
          actorEmail,
        })
      }

      if (newOwner && newOwner.id !== ticket.userId) {
        historyEntries.push({
          ticketId,
          field: "owner",
          oldValue: ticket.user?.name ?? ticket.user?.email ?? null,
          newValue: newOwner.name ?? newOwner.email,
          actorName,
          actorEmail,
        })
      }

      if (
        (changes.category !== undefined && changes.category !== ticket.category) ||
        (changes.platform !== undefined && changes.platform !== ticket.platform)
      ) {
        historyEntries.push({
          ticketId,
          field: "edited",
          actorName,
          actorEmail,
        })
      }

      // Execute transaction for this ticket
      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.ticket.update({ where: { id: ticketId }, data })
        }
        if (historyEntries.length > 0) {
          await tx.ticketHistory.createMany({ data: historyEntries })
        }
        if (changes.note?.trim()) {
          await tx.ticketNote.create({
            data: {
              ticketId,
              content: changes.note.trim(),
              authorName: actorName,
              authorEmail: actorEmail,
            },
          })
        }
      })
      updatedCount++

      // Queue notifications
      const finalOwner = newOwner ?? ticket.user
      const finalStatus = data.status ?? ticket.status
      const finalUrgency = data.urgency ?? ticket.urgency
      const finalCategory = data.category ?? ticket.category
      const finalPlatform = data.platform ?? ticket.platform
      const finalAssignedTo = data.assignedTo !== undefined ? data.assignedTo : ticket.assignedTo

      const ticketInfo = {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        urgency: finalUrgency,
        category: finalCategory,
        platform: finalPlatform,
        phone: ticket.phone,
        computerName: ticket.computerName,
        status: finalStatus,
        submitterName: finalOwner?.name ?? finalOwner?.email ?? "משתמש",
        submitterEmail: finalOwner?.email ?? "",
      }

      const statusChanged = data.status !== undefined && data.status !== ticket.status
      const staffRecipients = (statusChanged ? [finalAssignedTo].filter(Boolean) as string[] : allStaffEmails)
        .filter(e => e !== session.user.email)

      if (staffRecipients.length > 0) {
        pendingMails.push(
          sendMail({
            to: staffRecipients,
            subject: subjects.updatedStaff(ticket.ticketNumber, ticket.subject),
            html: mailTicketUpdatedStaff(ticketInfo, actorName),
          })
        )
      }

      if (data.status === "סגור" && finalOwner?.email) {
        pendingMails.push(
          sendMail({
            to: finalOwner.email,
            subject: `פנייתך HDTC-${ticket.ticketNumber} נסגרה — ספרו לנו כיצד היה השירות`,
            html: mailTicketClosedWithReview(ticketInfo),
          })
        )
      } else if (data.status === "בטיפול" && finalOwner?.email && finalOwner.email !== session.user.email) {
        pendingMails.push(
          sendMail({
            to: finalOwner.email,
            subject: subjects.inProgressUser(ticket.ticketNumber),
            html: mailTicketStatusUser(ticketInfo),
          })
        )
      } else if (data.status === "פתוח" && ticket.status === "סגור" && finalOwner?.email && finalOwner.email !== session.user.email) {
        pendingMails.push(
          sendMail({
            to: finalOwner.email,
            subject: `פנייתך HDTC-${ticket.ticketNumber} נפתחה מחדש`,
            html: mailTicketStatusUser(ticketInfo),
          })
        )
      }
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
