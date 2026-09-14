/**
 * __tests__/mailSubjects.test.ts — every ticket notification names its ticket.
 *
 * Since v3.83 a reply to a notification is added to the ticket it is about,
 * and the only way intake knows which ticket that is is the HDTC-N in the
 * subject the reply kept. Notifications are sent from noreply_helpdesk@, an
 * alias of the intake mailbox, so a subject without the number does not just
 * look worse: every reply to it opens a duplicate ticket.
 *
 * Eight subjects shipped without it until v3.83. This reads the source of
 * app/ and lib/ and refuses any subject about a ticket that lacks "HDTC-", so
 * the next one cannot be added without noticing.
 */

import { readFileSync, readdirSync } from "fs"
import { join, relative } from "path"

const ROOT = process.cwd()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(e.name) ? [full] : []
  })
}

/** `subject: \`…\`` or `subject: "…"` — a literal subject handed to sendMail. */
const SUBJECT = /subject:\s*(`[^`]*`|"[^"]*")/g

/** About a ticket: the Hebrew root of "ticket" (פנייה / פנייתך / פניות). */
const ABOUT_A_TICKET = /פני/

/** Mail about many tickets, or none, has no single number to carry. */
const NOT_ONE_TICKET = [/סיכום/, /HelpDesk Issues/]

const found = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib"))].flatMap(file =>
  [...readFileSync(file, "utf8").matchAll(SUBJECT)].map(m => ({ file: relative(ROOT, file), subject: m[1] })))

it("finds the literal ticket subjects it is meant to check", () => {
  // Received, closed, reopened and the two new-ticket mails, at least.
  expect(found.filter(f => ABOUT_A_TICKET.test(f.subject)).length).toBeGreaterThanOrEqual(5)
})

// A literal HDTC-N, or — since v3.87, when a request is labelled REQ-N — the
// label built by ticketLabel().
it("gives every subject about a ticket its label", () => {
  const offenders = found
    .filter(f => ABOUT_A_TICKET.test(f.subject))
    .filter(f => !/HDTC-|ticketLabel\(/.test(f.subject))
    .filter(f => !NOT_ONE_TICKET.some(rx => rx.test(f.subject)))
    .map(f => `${f.file}: ${f.subject}`)
  expect(offenders).toEqual([])
})
