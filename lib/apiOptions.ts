/**
 * lib/apiOptions.ts — the values a ticket's fields may take, as admins
 * configured them (v3.88). Server only.
 *
 * The public API checks what a program sends against these, and
 * GET /api/v1/options hands them out, so an integration can build its own
 * dropdowns from the same lists the web form uses. A field with no configured
 * values falls back to the defaults the form falls back to.
 */

import { prisma } from "@/lib/db"
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS, DEFAULT_URGENCIES } from "@/lib/fieldOptions"
import { STATUSES } from "@/lib/apiV1"
import { TICKET_TYPES } from "@/lib/ticketType"

export async function getTicketOptions() {
  const rows = await prisma.fieldOption.findMany({
    where: { field: { in: ["urgency", "category", "platform"] } },
    orderBy: [{ field: "asc" }, { order: "asc" }],
    select: { field: true, label: true },
  })
  const pick = (field: string, fallback: string[]) => {
    const found = rows.filter(r => r.field === field).map(r => r.label)
    return found.length ? found : fallback
  }
  return {
    status:   [...STATUSES],
    type:     [...TICKET_TYPES],
    urgency:  pick("urgency", DEFAULT_URGENCIES),
    category: pick("category", DEFAULT_CATEGORIES),
    platform: pick("platform", DEFAULT_PLATFORMS),
  }
}
