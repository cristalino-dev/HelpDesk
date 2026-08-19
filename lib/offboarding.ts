/**
 * lib/offboarding.ts — Leaving-employee return checklist
 *
 * The mirror image of the onboarding kit. When someone leaves Cristalino, a
 * ticket under the "עובד עוזב" category is opened and the ticket is born with a
 * checklist of EVERY item on the equipment list — laptop, screen, docking
 * station, and the account items too (חשבון Gmail, חשבון Zoho, משתמש קומקס).
 *
 * Two deliberate choices:
 *
 *   1. The list is not a selection. Nobody is asked what the leaver has, and
 *      nothing is queried from Google or Zoho to find out. The whole gear list
 *      is put in front of the technician and each line has to be dealt with,
 *      because the failure mode being designed against is the item nobody
 *      remembered to ask about — the second screen at home, the Zoho seat still
 *      being paid for. An item the leaver never had is removed from the list by
 *      staff, which is a decision someone made rather than one nobody made.
 *
 *   2. The ticket cannot be closed until every line is ticked. Closure is the
 *      moment the offboarding is declared finished, so it is the only moment
 *      where the checklist has any leverage. Enforced server-side in
 *      PATCH /api/tickets and in the automation close endpoint — the disabled
 *      button in the UI is a courtesy, not the rule.
 *
 * The lines are ordinary `TicketEquipment` rows, so the tick-off UI, the
 * partial-quantity handling and the history all come for free. The one place
 * that must know the difference is the supplier shortage report: gear waiting
 * to come BACK from a leaver is not gear to BUY. See app/api/admin/equipment.
 *
 * Everything in this module is pure so it can be unit-tested without a DB.
 */

import { outstandingOf, type EquipmentLine, type EquipmentSelection } from "@/lib/equipment"

/**
 * The category that turns a ticket into an offboarding procedure. Seeded like
 * any other category option, but the UI and the close guard key off this exact
 * label, so the field-options endpoint refuses to delete it.
 */
export const LEAVING_EMPLOYEE_CATEGORY = "עובד עוזב"

/** True when this ticket is an offboarding procedure. */
export function isOffboarding(category?: string | null): boolean {
  return category === LEAVING_EMPLOYEE_CATEGORY
}

/**
 * Builds the return checklist: every item on the gear list, once each.
 *
 * Blank labels are dropped and duplicates collapsed, so a messy option list
 * cannot produce a line that violates the unique (ticketId, label) constraint.
 *
 * @param options  The live equipment option labels (FieldOption, "equipment").
 */
export function offboardingChecklist(options: string[]): EquipmentSelection[] {
  const seen = new Set<string>()
  const checklist: EquipmentSelection[] = []
  for (const raw of options ?? []) {
    const label = String(raw ?? "").trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    checklist.push({ label, quantity: 1 })
  }
  return checklist
}

/**
 * The labels standing between this ticket and closure — every line with
 * anything still outstanding. Empty means the ticket is free to close.
 */
export function offboardingBlockers(lines: EquipmentLine[]): string[] {
  return (lines ?? []).filter(l => outstandingOf(l) > 0).map(l => l.label)
}

/**
 * Whether a ticket may be closed.
 *
 * Only offboarding tickets are ever blocked; every other category closes as it
 * always has. An offboarding ticket with an empty checklist is closeable — the
 * technician removed every line, which is an explicit "nothing to return".
 */
export function canCloseTicket(category: string | null | undefined, lines: EquipmentLine[]): boolean {
  if (!isOffboarding(category)) return true
  return offboardingBlockers(lines).length === 0
}

/** The Hebrew refusal shown to whoever tried to close the ticket. */
export function blockerMessage(blockers: string[]): string {
  if (blockers.length === 0) return ""
  return `לא ניתן לסגור את הפנייה — נותרו פריטים שלא סומנו: ${blockers.join(", ")}`
}
