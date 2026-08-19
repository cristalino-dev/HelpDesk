/**
 * app/api/admin/equipment/route.ts — Equipment shortage report
 *
 * GET /api/admin/equipment?includeClosed=1
 *
 * Everything still owed to a new employee, aggregated by item, so the admin can
 * send one order to the supplier instead of reading twenty tickets.
 *
 * Leaving-employee tickets ("עובד עוזב") never appear here — their checklist is
 * gear coming back, not gear to buy.
 *
 * A line counts as outstanding when `receivedQty < quantity`. By default only
 * live tickets are scanned — once a ticket is closed the onboarding is over and
 * a leftover unticked line is bookkeeping, not a purchase. `includeClosed=1`
 * brings those back for auditing.
 *
 * Staff-gated (not admin-only): the technicians who tick the items off are the
 * ones who need to see what is still missing.
 *
 * RESPONSE 200:
 *   { items: ShortageItem[], totalOutstanding: number, ticketCount: number,
 *     supplierText: string }
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { aggregateShortage, formatSupplierText, totalOutstanding } from "@/lib/equipment"
import { LEAVING_EMPLOYEE_CATEGORY } from "@/lib/offboarding"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const includeClosed = req.nextUrl.searchParams.get("includeClosed") === "1"

    // Offboarding checklists are excluded outright: gear waiting to come BACK
    // from someone who is leaving is not gear to buy, and a fresh "עובד עוזב"
    // ticket starts with every item unticked — it would swamp the order.
    const rows = await prisma.ticketEquipment.findMany({
      where: {
        ticket: {
          category: { not: LEAVING_EMPLOYEE_CATEGORY },
          ...(includeClosed ? {} : { status: { not: "סגור" } }),
        },
      },
      select: {
        label:       true,
        quantity:    true,
        receivedQty: true,
        ticket: { select: { ticketNumber: true, subject: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    const items = aggregateShortage(rows.map(r => ({
      label:         r.label,
      quantity:      r.quantity,
      receivedQty:   r.receivedQty,
      ticketNumber:  r.ticket.ticketNumber,
      ticketSubject: r.ticket.subject,
      ticketStatus:  r.ticket.status,
    })))

    const ticketNumbers = new Set(items.flatMap(i => i.tickets.map(t => t.ticketNumber)))

    return NextResponse.json({
      items,
      totalOutstanding: totalOutstanding(items),
      ticketCount:      ticketNumbers.size,
      supplierText:     formatSupplierText(items),
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/equipment GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
