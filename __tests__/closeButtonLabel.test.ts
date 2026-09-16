/**
 * __tests__/closeButtonLabel.test.ts — the close button reads as an action (v3.91).
 *
 * The queue's quick-close button was a small green pill reading "✓ סגור",
 * right beside the status pill — "סגור" is also a status, the tick says done,
 * and green is the colour of the closed status. People read it as the ticket's
 * status. It is now an outlined "סגור פנייה": the object makes "סגור" a verb.
 */

import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

const ROOT = join(__dirname, "..")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|jsx?)$/.test(entry) ? [full] : []
  })
}

it("no page or component labels a button with a tick and a bare סגור", () => {
  const offenders = ["app", "components"]
    .flatMap(d => sourceFiles(join(ROOT, d)))
    .filter(f => readFileSync(f, "utf8").includes("✓ סגור"))
    .map(f => relative(ROOT, f))
  expect(offenders).toEqual([])
})

it.each(["app/tickets/page.tsx", "components/TicketTable.tsx", "app/tickets/[id]/page.tsx"])(
  "%s says סגור פנייה",
  file => {
    expect(readFileSync(join(ROOT, file), "utf8")).toContain('"סגור פנייה"')
  },
)
