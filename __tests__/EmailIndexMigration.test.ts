/**
 * __tests__/EmailIndexMigration.test.ts — the case-insensitive email constraint
 *
 * The guard against duplicate accounts is a database index, and an index is
 * not something jest can execute. What jest CAN do is hold the migration to
 * the three properties the rest of the design assumes, so none of them can be
 * quietly edited away later:
 *
 *   1. It creates UNIQUE (lower(email)) on "User".
 *   2. It is IF NOT EXISTS. deploy.sh runs `prisma migrate deploy` inside the
 *      swap window with pm2 stopped and `set -e` armed, so a migration that
 *      fails there leaves the site DOWN rather than aborting cleanly. The
 *      index is meant to be created by hand first, against the running app;
 *      IF NOT EXISTS is what makes the in-window run a guaranteed no-op.
 *   3. It leaves the plain `@unique` btree alone. Prisma needs it for
 *      `findUnique({ where: { email } })`, and a dozen call sites use one.
 */

import { readFileSync, readdirSync } from "fs"
import { join } from "path"

const MIGRATIONS = join(process.cwd(), "prisma", "migrations")

function migrationSql(): string {
  const dirs = readdirSync(MIGRATIONS).filter(d => d.endsWith("_user_email_case_insensitive"))
  expect(dirs).toHaveLength(1)
  return readFileSync(join(MIGRATIONS, dirs[0], "migration.sql"), "utf8")
}

/** The file minus its comment lines — what Postgres actually runs. */
function statements(): string {
  return migrationSql()
    .split("\n")
    .filter(line => !line.trimStart().startsWith("--"))
    .join("\n")
}

describe("the lower(email) unique index migration", () => {
  it("creates a unique index over lower(email) on User", () => {
    expect(statements()).toMatch(
      /CREATE\s+UNIQUE\s+INDEX(\s+IF\s+NOT\s+EXISTS)?\s+"User_email_lower_key"\s+ON\s+"User"\s*\(\s*lower\(email\)\s*\)/i
    )
  })

  // Deploy-window safety — see the header. Do not remove this.
  it("is idempotent, so the swap-window run cannot fail on an index that exists", () => {
    expect(statements()).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS/i)
  })

  it("does not drop or weaken the exact-email unique constraint", () => {
    const sql = statements()
    expect(sql).not.toMatch(/DROP\s+INDEX/i)
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT/i)
    expect(sql).not.toMatch(/User_email_key/)
  })

  // A migration that rewrote User.email would desynchronise it from the many
  // other tables that store an email as plain text (Ticket.assignedTo,
  // TicketMessage.authorEmail, TicketHistory.actorEmail, …). The index
  // constrains; it does not edit anybody's row.
  it("does not rewrite existing data", () => {
    const sql = statements()
    expect(sql).not.toMatch(/\bUPDATE\s+"User"/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM/i)
  })

  it("leaves email @unique in the Prisma schema — findUnique depends on it", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8")
    const userModel = schema.slice(schema.indexOf("model User {"), schema.indexOf("model Ticket {"))
    expect(userModel).toMatch(/email\s+String\s+@unique/)
  })
})
