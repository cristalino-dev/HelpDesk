/**
 * lib/reportExport.ts — what an exported workbook contains
 *
 * Pure: columns, scope resolution and the filename, with no database and no
 * request. `app/api/admin/reports/export` supplies the rows.
 *
 * WHY THE EXPORT HAS ITS OWN ENDPOINT
 * ───────────────────────────────────
 * /api/admin/reports returns a deliberately thin row — the eight fields the
 * charts need — because the whole history is fetched on every page load and
 * every byte is paid for by everyone. An export is a separate, deliberate act
 * that happens once, so it can afford a round trip and carry the fields a
 * person actually wants in a spreadsheet: the subject, who reported it, their
 * phone number, how long it took.
 *
 * ON DATES
 * ────────
 * `YYYY-MM-DD HH:mm` in Israel time. Text, not Excel serial numbers — see the
 * note in lib/xlsx.ts. That format sorts chronologically as text, which is what
 * a reader does with a date column.
 */

import { TZ, civilDay } from "@/lib/reports"
import type { Column } from "@/lib/xlsx"

/** A ticket as it appears in the workbook. */
export type ExportRow = {
  ticketNumber: number
  subject: string
  description: string
  status: string
  urgency: string
  category: string
  platform: string
  submitterName: string
  submitterEmail: string
  phone: string
  computerName: string
  assignedTo: string
  createdAt: string
  closedAt: string | null
}

export type ExportScope =
  | { kind: "all" }
  | { kind: "range"; from: string; to: string }
  | { kind: "ticket"; ticketNumber: number }

/** "2026-09-07 14:32" in Israel time, or "" when there is no date. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d)
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? ""
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`
}

/** Whole hours from open to close, or null while the ticket is still open. */
export function hoursToClose(row: ExportRow): number | null {
  if (!row.closedAt) return null
  const h = (new Date(row.closedAt).getTime() - new Date(row.createdAt).getTime()) / 3_600_000
  return h >= 0 ? Math.round(h * 10) / 10 : null
}

/**
 * The columns, in reading order for an RTL sheet.
 *
 * `ticketNumber` is a number so it sorts numerically; everything identifying is
 * text so nothing is reinterpreted. That matters most for `phone`: Excel eats
 * the leading zero of `0528287036` the moment it decides a column is numeric.
 */
export const EXPORT_COLUMNS: Column<ExportRow>[] = [
  { header: "מספר פנייה",      value: r => r.ticketNumber },
  { header: "מזהה",            value: r => `HDTC-${r.ticketNumber}` },
  { header: "נושא",            value: r => r.subject },
  { header: "תיאור",           value: r => r.description },
  { header: "סטטוס",           value: r => r.status },
  { header: "דחיפות",          value: r => r.urgency },
  { header: "קטגוריה",         value: r => r.category },
  { header: "פלטפורמה",        value: r => r.platform },
  { header: "מגיש",            value: r => r.submitterName },
  { header: "אימייל מגיש",     value: r => r.submitterEmail },
  { header: "טלפון",           value: r => r.phone },
  { header: "שם מחשב",         value: r => r.computerName },
  { header: "משויך ל",         value: r => r.assignedTo },
  { header: "נפתחה",           value: r => formatDateTime(r.createdAt) },
  { header: "נסגרה",           value: r => formatDateTime(r.closedAt) },
  { header: "שעות עד סגירה",   value: r => hoursToClose(r) },
]

/**
 * Read a scope off query parameters.
 *
 * Anything unrecognised falls back to `all` rather than erroring: an export is
 * a read, and handing back the whole table is a safer failure than a 400 the
 * user cannot act on. A malformed ticket number is the one exception — asking
 * for one ticket and silently receiving all of them would be a lie.
 */
export function parseScope(params: URLSearchParams): ExportScope | { error: string } {
  const kind = params.get("scope") ?? "all"

  if (kind === "ticket") {
    const n = Number(params.get("ticket"))
    if (!Number.isInteger(n) || n <= 0) return { error: "מספר פנייה לא תקין" }
    return { kind: "ticket", ticketNumber: n }
  }

  if (kind === "range") {
    const from = params.get("from") ?? ""
    const to = params.get("to") ?? ""
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (!iso.test(from) || !iso.test(to)) return { error: "טווח תאריכים לא תקין" }
    if (from > to) return { error: "טווח תאריכים הפוך" }
    return { kind: "range", from, to }
  }

  return { kind: "all" }
}

/** Keep only the rows this scope asks for. Scoped by when a ticket was OPENED. */
export function applyScope(rows: ExportRow[], scope: ExportScope): ExportRow[] {
  if (scope.kind === "ticket") return rows.filter(r => r.ticketNumber === scope.ticketNumber)
  if (scope.kind === "range") {
    return rows.filter(r => {
      const d = civilDay(r.createdAt)
      return d >= scope.from && d <= scope.to
    })
  }
  return rows
}

/** What the browser will call the downloaded file. */
export function exportFilename(scope: ExportScope, today = civilDay(new Date())): string {
  if (scope.kind === "ticket") return `helpdesk-HDTC-${scope.ticketNumber}.xlsx`
  if (scope.kind === "range")  return `helpdesk-tickets-${scope.from}_${scope.to}.xlsx`
  return `helpdesk-tickets-all-${today}.xlsx`
}

/** The sheet tab's name. Excel caps this at 31 characters; buildXlsx enforces it. */
export function sheetName(scope: ExportScope): string {
  if (scope.kind === "ticket") return `HDTC-${scope.ticketNumber}`
  if (scope.kind === "range")  return `${scope.from} — ${scope.to}`
  return "כל הפניות"
}
