/**
 * scripts/audit-close-dates.mjs — why some closed tickets have no closing date
 *
 * The export and the reports both derive a ticket's closing date from its
 * history: the latest `TicketHistory` row with `field = "status"` and
 * `newValue = "סגור"`. `Ticket` has no `closedAt` column. So a closed ticket
 * with no such row has no closing date, anywhere, and the export leaves the
 * cell blank.
 *
 * This script finds those tickets and sorts them into the three ways it can
 * happen, so the count for each is a fact rather than a guess:
 *
 *   LEGACY      Closed before TicketHistory existed. The table arrived in
 *               migration 20260426071446_add_ticket_history; tickets have
 *               existed since 20260407073347_init. Anything closed in those 19
 *               days has no row and never can — the information was never
 *               recorded. Not fixable, only explainable.
 *
 *   LOST WRITE  The ticket has other history rows but no closure row. The
 *               status update and the history write are two separate round
 *               trips with no transaction around them (app/api/tickets PATCH,
 *               and /api/automation/close), so anything that interrupts the
 *               process between them — a deploy, a restart, a dropped
 *               connection — persists the closure and loses its record.
 *
 *   NO HISTORY  No history rows at all, closure or otherwise. Either a ticket
 *               created before the table existed, or one closed by a direct
 *               database edit or a script that bypassed the API. The urgency
 *               sweep in /api/automation/close already assumes these exist —
 *               its own comment cites "direct DB edits, legacy scripts".
 *
 * USAGE (on the server, where DATABASE_URL is set):
 *
 *   cd /home/ubuntu/helpdesk
 *   node scripts/audit-close-dates.mjs           # summary
 *   node scripts/audit-close-dates.mjs --list    # every affected ticket
 *
 * Read-only. It writes nothing and changes nothing.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const CLOSED = "סגור"
/** When 20260426071446_add_ticket_history landed. */
const HISTORY_SINCE = new Date("2026-04-26T00:00:00Z")

const list = process.argv.includes("--list")

const pad = (s, n) => String(s).padEnd(n)
const day = d => (d ? new Date(d).toISOString().slice(0, 10) : "—")

async function main() {
  const closed = await prisma.ticket.findMany({
    where: { status: CLOSED },
    select: { id: true, ticketNumber: true, subject: true, createdAt: true, updatedAt: true },
    orderBy: { ticketNumber: "asc" },
  })

  const history = await prisma.ticketHistory.findMany({
    where: { ticketId: { in: closed.map(t => t.id) } },
    select: { ticketId: true, field: true, newValue: true, changedAt: true },
  })

  const anyHistory = new Set()
  const closureAt = new Map()
  for (const h of history) {
    anyHistory.add(h.ticketId)
    if (h.field === "status" && h.newValue === CLOSED) {
      const prev = closureAt.get(h.ticketId)
      if (!prev || h.changedAt > prev) closureAt.set(h.ticketId, h.changedAt)
    }
  }

  const missing = closed.filter(t => !closureAt.has(t.id))
  const buckets = { LEGACY: [], "LOST WRITE": [], "NO HISTORY": [] }

  for (const t of missing) {
    if (t.createdAt < HISTORY_SINCE) buckets.LEGACY.push(t)
    else if (anyHistory.has(t.id)) buckets["LOST WRITE"].push(t)
    else buckets["NO HISTORY"].push(t)
  }

  console.log("")
  console.log("Closed tickets ..................... " + closed.length)
  console.log("With a recorded closing date ...... " + (closed.length - missing.length))
  console.log("WITHOUT one ....................... " + missing.length +
    (closed.length ? `  (${((missing.length / closed.length) * 100).toFixed(1)}%)` : ""))
  console.log("")

  if (missing.length === 0) {
    console.log("Nothing to explain: every closed ticket has a closing date.")
    console.log("A blank cell in an export is then a ticket that is not closed.")
    return
  }

  console.log("By cause:")
  for (const [name, rows] of Object.entries(buckets)) {
    if (!rows.length) continue
    const first = rows[0], last = rows[rows.length - 1]
    console.log(`  ${pad(name, 12)} ${pad(rows.length, 5)} ` +
      `HDTC-${first.ticketNumber}..HDTC-${last.ticketNumber}  ` +
      `opened ${day(first.createdAt)} .. ${day(last.createdAt)}`)
  }
  console.log("")

  // LOST WRITE is the only bucket that says something is still wrong today.
  const lost = buckets["LOST WRITE"]
  if (lost.length) {
    console.log(`${lost.length} ticket(s) have other history but no closure row.`)
    console.log("That is the non-atomic write, and it is ONGOING — see the header.")
    const recent = lost.filter(t => t.updatedAt > new Date(Date.now() - 30 * 864e5))
    console.log(`${recent.length} of them were touched in the last 30 days.`)
    console.log("")
  }

  if (list) {
    console.log("Affected tickets:")
    for (const [name, rows] of Object.entries(buckets)) {
      for (const t of rows) {
        console.log(`  ${pad(name, 12)} HDTC-${pad(t.ticketNumber, 6)} ` +
          `opened ${day(t.createdAt)}  updated ${day(t.updatedAt)}  ${t.subject.slice(0, 48)}`)
      }
    }
  } else if (missing.length) {
    console.log("Run with --list to see them individually.")
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
