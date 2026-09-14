/**
 * __tests__/noBareVoid.test.ts — rule 41, enforced (v3.85).
 *
 * A route handler that starts work with a bare `void` — `void sendMail(...)`,
 * `void Promise.all(mails)`, `void prisma.x.create(...)` — has nobody waiting
 * for it: once the response is out, the request can be torn down with the work
 * still in flight. v3.62 lost a closed ticket's note and message that way, and
 * mail is lost more quietly still: nothing fails, and nobody is told.
 *
 * Work the response reports is awaited; the rest is handed to after(), which
 * Next.js keeps alive until it finishes. Nine bare `void`s were left in the
 * ticket routes until v3.85. This reads every route under app/api and refuses
 * the next one.
 */

import { readFileSync, readdirSync } from "fs"
import { join, relative } from "path"

const ROOT = process.cwd()

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return routeFiles(full)
    return e.name === "route.ts" ? [full] : []
  })
}

/** `void` in front of mail, a batch of promises, or a database call. */
const BARE_VOID = /\bvoid\s+(sendMail|Promise\.(all|allSettled)|prisma\.)/

const files = routeFiles(join(ROOT, "app", "api"))

it("reads the route files it is meant to check", () => {
  expect(files.length).toBeGreaterThan(20)
})

it("has no bare `void` for mail or database work in a route handler", () => {
  const offenders = files.flatMap(file =>
    readFileSync(file, "utf8").split("\n")
      .map((line, i) => ({ text: line.trim(), n: i + 1 }))
      .filter(({ text }) => BARE_VOID.test(text) && !text.startsWith("//") && !text.startsWith("*"))
      .map(({ text, n }) => `${relative(ROOT, file)}:${n}: ${text}`))
  expect(offenders).toEqual([])
})
