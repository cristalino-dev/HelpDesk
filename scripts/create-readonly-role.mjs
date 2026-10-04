/**
 * scripts/create-readonly-role.mjs — a SELECT-only database login for agents
 *
 * WHY THIS EXISTS
 * ───────────────
 * The helpdesk-db skill holds a psycopg2 connection and the automation API
 * key, and closes tickets with both. When a script wrote the reply and the
 * note itself as well as calling POST /api/automation/close, the ticket ended
 * up showing everything twice — thirteen tickets between 2026-06-04 and
 * 2026-10-04 (see RELEASE_NOTES, "Data repair"). The skill now opens its
 * connection with `set_session(readonly=True)`, but that is a line in a
 * template: the credential itself can still write, so one script that omits
 * the line puts us back where we started.
 *
 * This creates the credential that cannot. A role with CONNECT, USAGE and
 * SELECT and nothing else: a write is refused by the server, whatever the
 * client asks for. The app keeps its own owner login and is untouched.
 *
 * ALTER DEFAULT PRIVILEGES is the part that is easy to forget — without it the
 * role can read today's tables and not the ones the next `prisma migrate
 * deploy` creates. It is applied FOR the role that owns the tables, because
 * default privileges follow the creator, not the grantor.
 *
 * USAGE (on the server, where DATABASE_URL is set):
 *
 *   cd /home/ubuntu/helpdesk
 *   set -a; . ./.env; set +a
 *
 *   # look first: what the role would be, and what it would be granted
 *   node scripts/create-readonly-role.mjs
 *
 *   # create it. The password is read from stdin, never from argv or the
 *   # environment, so it does not appear in `ps` or in the shell history.
 *   # --out receives the finished connection string, mode 0600.
 *   printf '%s' "$PASSWORD" | node scripts/create-readonly-role.mjs --apply --out ~/ro.txt
 *
 * Re-running --apply on an existing role resets its password and re-applies
 * the grants. It never drops anything.
 *
 * The last thing it does is sign in AS the new role and try to write. A run
 * that does not end in "verified: SELECT works, INSERT refused" has not
 * finished, whatever else it printed.
 */

import { PrismaClient } from "@prisma/client"
import { writeFileSync, chmodSync } from "fs"

if (!process.env.DATABASE_URL) {
  console.error("")
  console.error("DATABASE_URL is not set, so there is no database to work on.")
  console.error("")
  console.error("  cd /home/ubuntu/helpdesk")
  console.error("  set -a; . ./.env; set +a")
  console.error("  node scripts/create-readonly-role.mjs")
  console.error("")
  process.exit(1)
}

const arg  = name => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1] }
const APPLY = process.argv.includes("--apply")
const ROLE  = arg("--role") ?? "helpdesk_readonly"
const OUT   = arg("--out")

// The role name is interpolated into DDL, where a bind parameter is not
// allowed. Restricting it to an identifier settles that for good.
if (!/^[a-z][a-z0-9_]{2,62}$/.test(ROLE)) {
  console.error(`Role name "${ROLE}" is not a plain lowercase identifier.`)
  process.exit(1)
}

const prisma = new PrismaClient()

/** Everything the plan depends on, read from the catalogs. */
async function survey() {
  const [{ current_user: owner, current_database: db, version }] = await prisma.$queryRawUnsafe(
    "SELECT current_user, current_database(), version()",
  )
  const tables = await prisma.$queryRawUnsafe(
    `SELECT tableowner, count(*)::int AS n FROM pg_tables
      WHERE schemaname = 'public' GROUP BY tableowner ORDER BY n DESC`,
  )
  const [{ exists }] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`, ROLE,
  )
  return { owner, db, version: version.split(" ").slice(0, 2).join(" "), tables, exists }
}

/** The password arrives on stdin so it is never in argv or the environment. */
async function readPassword() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8").trim()
}

async function main() {
  const { owner, db, version, tables, exists } = await survey()
  const totalTables = tables.reduce((n, t) => n + t.n, 0)

  console.log("")
  console.log(`  server    ${version}`)
  console.log(`  database  ${db}`)
  console.log(`  signed in ${owner}`)
  console.log(`  tables    ${totalTables} in schema public, owned by ${tables.map(t => `${t.tableowner} (${t.n})`).join(", ")}`)
  console.log(`  role      ${ROLE} — ${exists ? "already exists, its password and grants will be reset" : "will be created"}`)

  // Default privileges are recorded against the role that CREATES a table, so
  // they have to be set for each owner, or tomorrow's migration is unreadable.
  const owners = [...new Set(tables.map(t => t.tableowner))]
  const grants = [
    `GRANT CONNECT ON DATABASE "${db}" TO "${ROLE}"`,
    `GRANT USAGE ON SCHEMA public TO "${ROLE}"`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${ROLE}"`,
    ...owners.map(o => `ALTER DEFAULT PRIVILEGES FOR ROLE "${o}" IN SCHEMA public GRANT SELECT ON TABLES TO "${ROLE}"`),
  ]

  console.log("")
  console.log("  statements:")
  console.log(`    ${exists ? "ALTER" : "CREATE"} ROLE "${ROLE}" ... LOGIN PASSWORD '<from stdin>'`)
  for (const g of grants) console.log(`    ${g}`)

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply (password on stdin) to create it.\n")
    return
  }

  const password = await readPassword()
  // Alphanumeric only: it is interpolated into DDL, where a bind parameter is
  // not allowed, and this removes every quoting question at once.
  if (!/^[A-Za-z0-9]{24,}$/.test(password)) {
    console.error("\n  The password must be 24+ characters, letters and digits only.")
    console.error("  Pipe it in:  printf '%s' \"$PASSWORD\" | node scripts/create-readonly-role.mjs --apply\n")
    process.exitCode = 1
    return
  }

  await prisma.$executeRawUnsafe(
    exists
      ? `ALTER ROLE "${ROLE}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD '${password}'`
      : `CREATE ROLE "${ROLE}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD '${password}'`,
  )
  for (const g of grants) await prisma.$executeRawUnsafe(g)
  console.log(`\n  ${exists ? "Reset" : "Created"} "${ROLE}" and applied ${grants.length} grants.`)

  // ── Proof ──────────────────────────────────────────────────────────────
  // Sign in as the new role and try both things. A grant that reads correctly
  // and behaves otherwise is the whole reason this check is here.
  const url = new URL(process.env.DATABASE_URL)
  url.username = ROLE
  url.password = password
  const asRole = new PrismaClient({ datasources: { db: { url: url.toString() } } })
  try {
    const [{ n }] = await asRole.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Ticket"`)
    let refused = false
    try {
      await asRole.$executeRawUnsafe(`INSERT INTO "TicketHistory" (id, "ticketId", field) VALUES ('probe', 'probe', 'probe')`)
    } catch (e) {
      refused = /permission denied|read-only/i.test(String(e.message))
      if (!refused) throw e
    }
    if (!refused) {
      console.error("\n  NOT VERIFIED: the role was able to INSERT. Do not hand out this credential.\n")
      process.exitCode = 1
      return
    }
    console.log(`  verified: SELECT works (${n} tickets), INSERT refused.`)
  } finally {
    await asRole.$disconnect()
  }

  if (OUT) {
    writeFileSync(OUT, url.toString() + "\n", { mode: 0o600 })
    chmodSync(OUT, 0o600)
    console.log(`  connection string written to ${OUT} (mode 0600) — move it and delete it.`)
  }
  console.log("")
}

main()
  .catch(err => { console.error(err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
