/**
 * lib/equipment.ts — New-employee equipment checklist
 *
 * When a ticket is opened under the "עובד חדש" category, the person filing it
 * picks the equipment the new hire needs (computer, screen, Gmail account, …)
 * with a quantity for each. The technician who then handles the ticket records
 * how many of each line actually arrived or were installed.
 *
 * Whatever is still missing across all live tickets becomes the shortage list
 * in the admin console — the order to send to the supplier.
 *
 * The item list itself is admin-managed in "שדות מערכת" (FieldOption, field =
 * "equipment"), exactly like category and platform. The constants here are the
 * seed/fallback values only.
 *
 * Everything in this module is pure so it can be unit-tested without a DB.
 */

/**
 * The category that turns a ticket into a new-employee onboarding request and
 * reveals the equipment checklist. It is seeded as a normal, renameable-in-
 * theory category option, but the UI keys off this exact label — so the
 * field-options endpoint refuses to delete it.
 */
export const NEW_EMPLOYEE_CATEGORY = "עובד חדש"

/** Seed values for the "equipment" field option list. */
export const DEFAULT_EQUIPMENT = [
  "מחשב",
  "מחשב נייד",
  "מסך",
  "מסך שני",
  "עכבר",
  "מקלדת",
  "תחנת עגינה",
  "אוזניות",
  "טלפון נייד",
  "חשבון Gmail",
  "חשבון Zoho",
  "משתמש קומקס",
]

/** Hard ceiling on a single line's quantity — guards against typos and abuse. */
export const MAX_QUANTITY = 99

// ── Types ────────────────────────────────────────────────────────────────────

/** What the client sends when opening or amending a ticket. */
export interface EquipmentSelection {
  label:    string
  quantity: number
}

/** A stored line, as returned by the API. */
export interface EquipmentLine {
  label:       string
  quantity:    number
  receivedQty: number
}

/** A stored line joined to its ticket — the input to the shortage report. */
export interface EquipmentLineWithTicket extends EquipmentLine {
  ticketNumber:  number
  ticketSubject: string
  ticketStatus:  string
}

/** One row of the supplier order list. */
export interface ShortageItem {
  label:       string
  outstanding: number
  requested:   number
  received:    number
  tickets: {
    ticketNumber: number
    subject:      string
    status:       string
    outstanding:  number
  }[]
}

// ── Normalisation ────────────────────────────────────────────────────────────

/** Clamp a value to a whole number inside [min, max]; non-numbers → min. */
function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Turns an untrusted `equipment` payload into storable selections.
 *
 * Drops blank labels, trims whitespace, clamps quantities to 1..MAX_QUANTITY,
 * and merges duplicate labels by summing their quantities (the DB has a unique
 * constraint on (ticketId, label), so duplicates would otherwise throw).
 *
 * @param raw      Whatever arrived in the request body.
 * @param allowed  Optional whitelist of labels — anything else is discarded.
 *                 Pass the live FieldOption list to reject invented items.
 */
export function normalizeSelection(raw: unknown, allowed?: string[]): EquipmentSelection[] {
  if (!Array.isArray(raw)) return []
  const allowedSet = allowed ? new Set(allowed.map(a => a.trim())) : null

  const merged = new Map<string, number>()
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const label = String((entry as EquipmentSelection).label ?? "").trim()
    if (!label) continue
    if (allowedSet && !allowedSet.has(label)) continue
    const quantity = clampInt((entry as EquipmentSelection).quantity, 1, MAX_QUANTITY)
    merged.set(label, Math.min(MAX_QUANTITY, (merged.get(label) ?? 0) + quantity))
  }
  return [...merged].map(([label, quantity]) => ({ label, quantity }))
}

/**
 * Clamps a received count to the line's quantity. A technician can never mark
 * more units received than were requested, and never fewer than zero.
 */
export function clampReceived(receivedQty: unknown, quantity: number): number {
  return clampInt(receivedQty, 0, Math.max(0, Math.trunc(quantity)))
}

// ── Per-line / per-ticket state ──────────────────────────────────────────────

/** Units still missing on a line. Never negative. */
export function outstandingOf(line: EquipmentLine): number {
  return Math.max(0, line.quantity - line.receivedQty)
}

/** True when every requested unit of the line has arrived. */
export function isFullyReceived(line: EquipmentLine): boolean {
  return outstandingOf(line) === 0
}

/**
 * Rolls a ticket's lines into a progress summary for the checklist header
 * ("4 מתוך 7 התקבלו").
 */
export function equipmentProgress(lines: EquipmentLine[]): {
  requested:   number
  received:    number
  outstanding: number
  linesTotal:  number
  linesDone:   number
  complete:    boolean
} {
  const requested = lines.reduce((sum, l) => sum + l.quantity, 0)
  const received  = lines.reduce((sum, l) => sum + Math.min(l.receivedQty, l.quantity), 0)
  const linesDone = lines.filter(isFullyReceived).length
  return {
    requested,
    received,
    outstanding: Math.max(0, requested - received),
    linesTotal:  lines.length,
    linesDone,
    complete:    lines.length > 0 && linesDone === lines.length,
  }
}

// ── Shortage report (the supplier order) ─────────────────────────────────────

/**
 * Groups outstanding units by equipment item across tickets.
 *
 * Lines that are fully received drop out entirely; items are returned
 * most-missing first, then alphabetically so the order is stable. Each item
 * keeps the tickets it came from, so the admin can see who is waiting.
 *
 * @param rows  Equipment lines joined to their ticket.
 */
export function aggregateShortage(rows: EquipmentLineWithTicket[]): ShortageItem[] {
  const byLabel = new Map<string, ShortageItem>()

  for (const row of rows) {
    const outstanding = outstandingOf(row)
    if (outstanding === 0) continue

    let item = byLabel.get(row.label)
    if (!item) {
      item = { label: row.label, outstanding: 0, requested: 0, received: 0, tickets: [] }
      byLabel.set(row.label, item)
    }
    item.outstanding += outstanding
    item.requested   += row.quantity
    item.received    += Math.min(row.receivedQty, row.quantity)
    item.tickets.push({
      ticketNumber: row.ticketNumber,
      subject:      row.ticketSubject,
      status:       row.ticketStatus,
      outstanding,
    })
  }

  const items = [...byLabel.values()]
  for (const item of items) {
    item.tickets.sort((a, b) => a.ticketNumber - b.ticketNumber)
  }
  return items.sort((a, b) =>
    b.outstanding - a.outstanding || a.label.localeCompare(b.label, "he"))
}

/** Total units missing across every item — the badge on the admin tab. */
export function totalOutstanding(items: ShortageItem[]): number {
  return items.reduce((sum, i) => sum + i.outstanding, 0)
}

/**
 * Renders the shortage list as plain text to paste into an email to the
 * supplier. Deliberately plain: no markdown, no table drawing — it has to
 * survive a paste into Gmail's Hebrew RTL composer.
 *
 * @param items  Output of aggregateShortage().
 */
export function formatSupplierText(items: ShortageItem[]): string {
  if (items.length === 0) return "אין ציוד חסר."
  const lines = items.map(i => `${i.label} — ${i.outstanding}`)
  return [
    "רשימת ציוד חסר:",
    "",
    ...lines,
    "",
    `סה"כ פריטים: ${totalOutstanding(items)}`,
  ].join("\n")
}
