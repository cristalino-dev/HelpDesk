# Cristalino HelpDesk — Handoff

> **v3.75** · Written for whoever picks this up next, human or model.
> Companions: [`GEMINI.md`](../GEMINI.md) (fast orientation), [`ARCHITECTURE.md`](ARCHITECTURE.md)
> (the deep reference), [`RELEASE_NOTES.md`](../RELEASE_NOTES.md) (why each change happened).
> This file is the operational one: how to run it, how to ship it, where the
> secrets are, and what will bite you.

---

## 0. Read this before you touch anything

**There are no secret values in this document, and there should never be.**
This repository is on GitHub. Every credential below is named and located, not
quoted. The values live in exactly two places:

| Where | What it holds | How to read it |
|---|---|---|
| `/home/ubuntu/helpdesk/.env` and `.env.local` **on the production server** | every runtime secret | SSH in and `cat` it |
| GitHub → Settings → Secrets and variables → Actions | `DEPLOY_SSH_KEY` only | write-only; not readable after saving |

`.env` and `.env.local` are gitignored and are **not** in the deploy archive
when they are absent locally — that is deliberate, so CI can deploy without
ever holding the application's secrets. See §4.

If you need a value, get it from the server. Do not paste one into a file, a
commit message, an issue, or a chat log.

---

## 1. What this is

An internal IT helpdesk for Cristalino Group. Hebrew, RTL throughout. Employees
open tickets; a small support team works them; admins run the system.

| | |
|---|---|
| **Production** | https://helpdesk.cristalino.co.il |
| **Public quick-open** | https://helpdesk.cristalino.co.il/open (no login — this is the link the ⧉ button in the header copies) |
| **Repository** | https://github.com/cristalino-dev/HelpDesk |
| **Server** | AWS Lightsail, `18.195.248.157`, user `ubuntu`, app in `/home/ubuntu/helpdesk` |
| **Process manager** | pm2, app name `helpdesk` (two other apps share the box: `crisrouter`, `smarter-warranty` — do not touch them) |
| **Database** | PostgreSQL on AWS RDS (`eu-central-1`). Host and credentials are in `DATABASE_URL` in `.env` on the server |
| **Mail** | Google Workspace, `helpdesk@cristalino.co.il`, SMTP + IMAP with an app password |

**Stack:** Next.js 16.2.2 (App Router, Turbopack) · React 19.2.4 · TypeScript 5
strict · Prisma 5.22 · NextAuth v5 beta (Google OAuth only) · Jest 30 + RTL.
**774 tests across 46 suites.**

**Two conventions that are not obvious:**

- **No Tailwind in components.** Every style is an inline `style={{}}` object,
  and every colour comes from `lib/theme.ts`. Tailwind exists in the build but
  components do not use it.
- **`AGENTS.md` is real.** This Next.js version has breaking changes from what
  most models were trained on. Read `node_modules/next/dist/docs/` before
  writing routing or data-fetching code. Dynamic route params are
  `Promise<{...}>` and must be awaited.

---

## 2. The domain logic worth knowing

### Roles

Four, and they are not a single enum — this trips people up:

| Role | Determined by | Sees |
|---|---|---|
| **Admin** | `User.isAdmin` in the database | everything |
| **Staff** | membership of `STAFF_EMAILS` in `lib/staffEmails.ts` (hardcoded) | the queue, the error log, the support manual |
| **Viewer** | membership of `VIEWER_EMAILS` | a read-only queue at `/tickets/view` |
| **User** | signed in, none of the above | their own tickets |

`isAdmin` does more than grant access: **the staff roster is derived from it**
(`lib/staffMembers.ts`). Promote someone and they start receiving every staff
notification email and appear in the assignment dropdown and @mention list.
Revoke it and that stops. There is no separate "notify me" setting.

Promote a user in **ניהול מערכת → ניהול משתמשים**. It takes effect on their next
login, and they must have signed in at least once for a row to exist.

**One nav, one source of truth:** `components/AppNav.tsx`. `navLinksFor()` is
pure and exported, and `__tests__/AppNav.test.tsx` asserts it against the guards
on the pages themselves. If you add a page, add it there — a link that leads to
a redirect is worse than no link, and a page an admin may open but cannot reach
is worse still.

### Tickets

`HDTC-<n>` where `n` is `Ticket.ticketNumber`, an autoincrement. Statuses:
`פתוח` · `בטיפול` · `בהמתנה` (needs `holdReason`) · `סגור`.

**Two categories are procedures, not requests**, and the code matches on their
exact Hebrew labels:

- **`עובד חדש`** (`lib/equipment.ts`) — the opener picks equipment and
  quantities; the technician marks what actually arrived.
- **`סגירת משתמש`** (`lib/offboarding.ts`) — the ticket is born with a checklist
  of **every** item on the equipment list, hardware and accounts alike, and
  **cannot be closed until every line is ticked**. Enforced server-side in
  `PATCH /api/tickets` and `/api/automation/close`; the disabled button in the
  UI is a courtesy, not the rule.

  The list is not a selection on purpose. Nobody is asked what the leaver has,
  and nothing is queried from Google or Zoho to find out — the failure being
  designed against is the item nobody remembered to ask about (the second screen
  at home, the Zoho seat still being billed). An item they never had is struck
  off by staff: a decision someone made, rather than one nobody made.

  **This label was `עובד עוזב` until v3.74.** Renaming it required a data
  migration (`20260906120000_rename_leaving_employee_category`) because the
  string is stored on every ticket and as the dropdown option. If you rename it
  again, migrate both or every existing offboarding silently stops being one and
  becomes closable with lines unticked.

  The ticket form watches the subject and description and offers the category as
  a button when the text reads like a closure (`suggestsOffboarding`). Matching
  is by *phrase*, never keyword — `סגירה` alone appears in every third ticket.

### Reports (`/admin/reports`)

**`Ticket` has no `closedAt` column.** A closure is a `TicketHistory` row with
`field: "status"`, `newValue: "סגור"`. A reopened ticket has several. The API
takes the **latest**, and only for tickets closed *now*, so that:

```
cumulative opened − cumulative closed = tickets actually open
```

Counting close *events* instead double-counts reopened tickets and sinks the
backlog line below the truth, silently. Tickets closed before history existed
have no row: they count as opened, are excluded from the closure line, and the
page **says so** rather than under-reporting quietly.

Buckets are civil days in **Asia/Jerusalem**, not UTC — a ticket opened at 01:30
local is opened today. Weeks start Sunday. All the arithmetic is pure and lives
in `lib/reports.ts`; the API returns one flat row per ticket **once** and every
control recomputes in the browser, which is what makes the timeline draggable.
Above roughly ten thousand tickets, move the aggregation server-side — the pure
functions run there unchanged.

### Mail

`lib/mail.ts`, ten templates, all through one `wrap()`. Constraints that dictate
the markup and are not negotiable:

- **Gmail strips `dir` from `<html>`/`<body>` and drops the `<style>` block's
  body rules.** Hebrew renders left-to-right unless `dir="rtl"` and
  `direction:rtl;text-align:right` are inline on the content elements.
- **Outlook renders through Word.** No flex, no grid — nested tables only.
- **Subjects and descriptions are free text.** Every interpolation goes through
  `esc()`. An unescaped `<` truncates the rest of the message in most clients.
- Colours are **derived** from `lib/theme.ts`, never copied, so a re-brand
  reaches the mail.

Sending retries what Gmail calls temporary (4xx, three attempts, 2s then 8s) and
gives up at once on permanent 5xx. `isTransientMailError()` classifies; see
v3.69 for why it is fiddlier than reading `responseCode`.

### Crons

Installed idempotently by the deploy, on the server:

| Job | Frequency | Endpoint |
|---|---|---|
| Daily digest | 09:00 Israel | `POST /api/admin/digest` |
| Urgency sweep | every 5 min | `POST /api/admin/sweep` |
| Email→ticket ingest | every 2 min, `flock`-guarded | `POST /api/admin/ingest-mail` |

Each reads its secret from `.env.local` at runtime and authenticates with a
header. Logs in `/home/ubuntu/helpdesk/logs/`.

### Rules that have bitten people

1. **Never resolve a user by a bare `findUnique` on an email.** Always
   `lib/users.ts` — `findUserByEmail` / `resolveUserByEmail`, which match
   case-insensitively. A miss returns an empty dashboard rather than an error,
   which is the kind of bug nobody reports. The database backs this with
   `UNIQUE (lower(email))`, created by a raw-SQL migration; `prisma migrate dev`
   reporting it as drift is expected, not a reason to reset.
2. **`uploads/` survives deploys** — attachments and printer drivers live on
   disk outside the deploy archive.
3. **Jest is not a server-side gate.** `deploy.sh` runs `next build` directly.
   Run `npm run build` (which is `prisma generate && jest --ci && next build`)
   before you ship, or use the GitHub Actions deploy, which gates on tests and
   typecheck.
4. **`npx tsc --noEmit` catches what jest cannot.** Jest transpiles through SWC
   and does **not** typecheck. Several bugs this session passed every test and
   failed the typecheck.

---

## 3. Credentials — names and locations only

All values are on the server in `/home/ubuntu/helpdesk/.env` and `.env.local`.

| Variable | What it is | Where to get a new one |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (RDS) | AWS RDS console |
| `AUTH_SECRET` | signs the JWT session cookie | `openssl rand -base64 32` — rotating it signs everyone out |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client | Google Cloud console → Credentials |
| `NEXTAUTH_URL` | must exactly match the OAuth redirect URI | — |
| `SMTP_USER` / `SMTP_PASS` | `helpdesk@cristalino.co.il` + Google **app password** (not the account password) | Google Account → Security → App passwords |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | `smtp.gmail.com`, 587, STARTTLS | — |
| `IMAP_HOST` | defaults to `imap.gmail.com` | — |
| `DIGEST_SECRET` · `SWEEP_SECRET` · `INGEST_SECRET` | shared secrets for the three cron endpoints | any random string; must match the cron scripts |
| `AUTOMATION_API_KEY` | authenticates `/api/automation/close` | any random string |
| `TICKET_MAIL_KEYWORD` | subject keyword that turns an email into a ticket (default `ticket`) | — |
| `NEXT_PUBLIC_APP_URL` | used to build ticket links in emails | — |

**GitHub Actions secret:** `DEPLOY_SSH_KEY` — the full contents of `alon.pem`,
BEGIN/END lines included. Optional overrides `DEPLOY_HOST`, `DEPLOY_USER`.

**SSH key:** `alon.pem`, held by the maintainer
(`C:\Users\AlonKerem\Development\alon.pem` on the current machine). It is not in
the repository and must never be.

---

## 4. Deploying

The build happens **on the server**, into `.next-staging`, while the old app
keeps serving. Only after a successful build does it stop, migrate, swap the
build directories and restart — so a failed build leaves production untouched.
Downtime is the few seconds of the swap, covered by a maintenance page.

Three entry points, **one implementation**. `scripts/deploy-remote.sh` (the
server half) and `scripts/maintenance.template.html` are shared by all of them;
`__tests__/deployScripts.test.ts` fails the build if they drift.

### From Windows PowerShell — the usual path

```powershell
git pull
.\deploy.ps1 -Key C:\Users\AlonKerem\Development\alon.pem
```

Needs nothing but Windows 10/11 (`ssh`, `scp` and `tar` ship with it). It works
from a locked-down temporary **copy** of the key, so your `alon.pem` is never
modified.

**`deploy.ps1` must stay pure ASCII.** Windows PowerShell 5.1 reads a `.ps1`
without a BOM in the system ANSI codepage, so one em dash in a comment becomes
mojibake, terminates the string it sits in, and the parser reads the rest of the
line as code. PowerShell 7 defaults to UTF-8 and will **not** reproduce the
failure — a byte-level test does.

### From bash / macOS / Linux

```bash
DEPLOY_KEY=/path/to/alon.pem ./deploy.sh
```

### From GitHub Actions

**Actions → Deploy → Run workflow.** Manual by design — it does not fire on
every merge to `main`; the `push:` trigger is one commented-out block away in
`.github/workflows/deploy.yml`. It gates on `jest --ci` and `tsc --noEmit`
before touching the server, allows one deploy at a time, and shreds the key
afterwards. Requires the `DEPLOY_SSH_KEY` secret.

CI has no `.env`, so `deploy.sh` omits the env files from the archive and the
server keeps the copies it already holds. That is the whole reason CI needs only
the SSH key.

### Release convention

Bump `lib/version.ts`, add a `RELEASE_NOTES.md` entry, and update the test
counts in `README.md`, `GEMINI.md` and `docs/ARCHITECTURE.md`. The version shows
in the app and on the maintenance page.

---

## 5. What changed in this session (v3.67 → v3.75)

| Version | Change |
|---|---|
| **3.67** | New-ticket emails carry `HDTC-<n>` in subject and body, rebuilt on the brand palette |
| **3.68** | **Reports** — `/admin/reports`: timeline (day/week/month, drag to zoom), breakdowns by five dimensions, plain-language insights |
| **3.69** | Two production-log fixes: the timeline crashed when the bucket count shrank under a hovered point; a Gmail `421` silently dropped notifications instead of retrying |
| **3.70** | **One navigation bar** — `AppNav` replaces seven hand-rolled link rows |
| **3.71** | `/admin-manual` gained a server-side guard; it had none |
| **3.72** | `לוח אישי` is personal again — `GET /api/tickets` stopped handing admins the whole table; `/admin` renamed `ניהול מערכת` |
| **3.73** | `מדווח שעות קומקס` added to the offboarding checklist, back-filled into the live install |
| **3.74** | Category renamed `עובד עוזב` → `סגירת משתמש` (data migration) + the form suggests it from free text |
| **3.75** | All ten mail templates share one design; the three manuals became one `/help` |

Also added this session: `deploy.ps1`, `.github/workflows/deploy.yml`,
`.gitattributes`, and the extraction of `scripts/deploy-remote.sh` +
`scripts/maintenance.template.html` so the deploy paths cannot drift.

---

## 6. Known gaps

- **`/tickets/view` has two pre-existing `setState`-in-effect lint errors.** They
  predate this session and were left alone rather than widening a change.
- **The reports payload is roughly 150 bytes per ticket, fetched once per page
  load.** Fine at a few thousand tickets; see §2 for when to move it.
- **`STAFF_EMAILS` and `VIEWER_EMAILS` are hardcoded** in `lib/staffEmails.ts`.
  Only `isAdmin` is data. Adding staff means a code change and a deploy.
- **The equipment checklist labels are `FieldOption` rows**, editable in
  **ניהול מערכת → שדות מערכת** — but `סגירת משתמש` and `עובד חדש` are protected
  from deletion because code matches on them.
- **A stale branch, `claude/sync-all-cloud-fie6b0`**, may still exist on the
  remote. It is fully merged into `main`; delete it from the branches page.
