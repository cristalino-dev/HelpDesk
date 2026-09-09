# מערכת helpdesk — Cristalino HelpDesk

**Version 3.80**

A Hebrew RTL internal helpdesk system built for Cristalino Group LTD. Employees submit IT support tickets through a web app using their Google account. Helpdesk staff and admins manage the queue through dedicated panels.

**Live:** https://helpdesk.cristalino.co.il

| Looking for | Go to |
|---|---|
| How the system is built — schema, endpoints, auth rules, deployment | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Handing the project over — operations, deploy paths, where every credential lives | [`docs/GEMINI-HANDOFF.md`](docs/GEMINI-HANDOFF.md) |
| What changed in each release | [`RELEASE_NOTES.md`](RELEASE_NOTES.md) |
| Instructions for AI coding agents | [`AGENTS.md`](AGENTS.md) (aliased by `CLAUDE.md`), [`GEMINI.md`](GEMINI.md) |

---

## Features

### Tickets

- **Google OAuth login** — employees sign in with their Cristalino Google account; the account picker is always shown
- **Ticket submission** — subject, description, computer name, phone, platform, category, urgency
- **Four-state lifecycle** — פתוח → בטיפול → סגור, plus בהמתנה (on hold) with a mandatory reason that clears itself on reinstatement
- **Compound closure** — closing always auto-downgrades urgency to נמוך, enforced server-side and swept every 5 minutes
- **Re-open** — users can re-open their own closed tickets within 4 weeks; staff and admins any time
- **Self-close** — users can close their own tickets from the ticket detail page
- **Ticket history** — full audit trail of every field change with actor and timestamp
- **Ticket deletion** — admins can permanently erase a ticket (two-step confirm); the deletion itself is written to the error log
- **Change the submitter** — admins can move a ticket filed against the wrong person to the right one, after confirming
- **Open on behalf of** — admins can file a ticket for an employee who phoned or walked in, even one who has never signed in

### Queue management

- **Admin queue** — sorted by urgency (דחוף → גבוה → בינוני → נמוך), FIFO within urgency; sortable by any column
- **Staff portal** — all tickets with weekly/all-time stat toggle, inline expand and edit
- **Viewer role** — read-only ticket list for observers who must not change anything
- **Full-text search** — every page has a search bar across all ticket fields, and typing a ticket number (`494`, `#494`, `HDTC-494`) always lands on that ticket even when the current view is filtered
- **Clickable stat-card filters** — summary cards filter the list on click; click again to clear
- **Stale ticket warning** — visual flag on open/in-progress tickets idle for 4+ workdays (Israeli Sun–Thu week)
- **Workdays display** — open duration shown in business days everywhere
- **Dynamic staff roster** — the assignment dropdown and @mention shortcuts show exactly the DB users flagged as admin; revoking admin removes someone automatically
- **Automation bot** — tickets can be assigned to a virtual bot account that an external script picks up

### Collaboration

- **Staff notes** — internal technician notes with @mention email notifications, never shown to the user
- **Two-way chat** — direct messaging between user and staff with email notifications and targeted replies
- **Image attachments** — upload, or paste screenshots straight into any description/note textarea with Ctrl+V
- **Service ratings** — automatic rating request email after closure; 1–5 star review dashboard

### Onboarding and offboarding

- **New employee (עובד חדש)** — a ticket that demands the new hire's first name, last name, phone and job title, and carries an equipment checklist
- **Leaving employee (עובד עוזב)** — a return checklist covering every item on the gear list; the ticket cannot be closed while any line is untouched
- **Equipment tracking** — any ticket can request items with quantities; technicians record what actually arrived
- **Shortage report** — everything still owed across live tickets, aggregated into one order to send the supplier

### Admin console

- **User management** — add, edit, delete; deleting reassigns that user's tickets to helpdesk@; the last admin cannot be demoted
- **שדות מערכת** — category, platform, urgency, equipment and license-category dropdowns are DB-driven and editable
- **רישוי** — software license inventory with bulk key insert, per-license username/password (masked, click-to-reveal) and remarks
- **מדפסות** — printer inventory with toner levels, supplier serials, and driver file uploads
- **ציוד חסר** — the equipment shortage report
- **Error monitoring** — admin log viewer with live filtering, copy-all and download

### Automation

- **Email-to-ticket** — inbound mail to helpdesk@ whose subject contains "ticket" opens an urgent ticket automatically (IMAP poll every 2 minutes, idempotent by Message-ID)
- **Machine-to-machine closure** — `POST /api/automation/close` closes a ticket by number with a Bearer key
- **Daily digest** — scheduled email summary of open tickets to staff each morning
- **Urgency sweep** — a cron every 5 minutes repairs any closed ticket whose urgency drifted

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.2 (App Router, Turbopack) |
| Language | TypeScript 5, React 19.2.4 |
| Auth | NextAuth v5 (beta) with Google provider |
| ORM | Prisma 5.22.0 |
| Database | PostgreSQL (AWS RDS) |
| Styling | Inline React styles; tokens in `lib/theme.ts` (CSS custom properties, two palettes in `lib/palette.ts`) |
| Mail | nodemailer v7 (outbound) · imapflow + mailparser (inbound) |
| Tests | Jest 30 + React Testing Library 16 — 1,028 tests, 52 suites |
| OS | Ubuntu 24.04 LTS (AWS Lightsail) |
| Process manager | PM2 |
| Deployment | SSH + SCP — `deploy.sh` (bash) or `deploy.ps1` (Windows); build runs on server; also runnable from GitHub Actions |

---

## Project Structure

```
helpdesk/
├── app/
│   ├── layout.tsx  page.tsx  providers.tsx   # RTL shell, root redirect, providers
│   ├── login/  profile/  contact/            # Sign-in, account settings, contact form
│   ├── dashboard/                            # User: own tickets + form + search
│   ├── open/                                 # Ticket-open shortcut (profile pre-filled)
│   ├── tickets/                              # Staff: all tickets + weekly stats
│   │   ├── [id]/                             # Detail: notes, messages, attachments,
│   │   │                                     #   equipment, history timeline
│   │   └── view/                             # Viewer role: read-only list
│   ├── admin/                                # Queue, users, logs, שדות מערכת,
│   │   │                                     #   רישוי, מדפסות, ציוד חסר
│   │   ├── logs/                             # Error log viewer
│   │   ├── reports/                          # Timeline, breakdowns, insights
│   │   └── reviews/                          # Service review dashboard
│   ├── help/  manual/  admin-manual/         # User manual, printable, staff manual
│   ├── review/[ticketId]/                    # Service rating page (no login)
│   └── api/                                  # REST API — see docs/ARCHITECTURE.md §7
├── components/                               # AppHeader, TicketForm, TicketTable,
│                                             #   EquipmentPicker, NewEmployeeFields,
│                                             #   OffboardingNotice, ImageAttachments,
│                                             #   ErrorBoundary, ClientErrorHandler, …
├── lib/                                      # Pure logic + storage + mail
│   ├── db.ts  version.ts  theme.ts           # Prisma singleton, version, design tokens
│   ├── palette.ts  themeBoot.ts  useTheme.ts  # light+dark palettes, theme switch
│   ├── users.ts  staffEmails.ts              # User lookup, role lists, @mentions
│   ├── staffMembers.ts                       # DB-driven staff roster
│   ├── ticketApi.ts  ticketSearch.ts         # Client mutations, HDTC-number search
│   ├── ticketRevision.ts  staleTicket.ts     # Poll signature, stale detection
│   ├── workdays.ts                           # Israeli Sun–Thu arithmetic
│   ├── equipment.ts  newEmployee.ts          # Equipment lines, onboarding fields
│   ├── offboarding.ts  fieldOptions.ts       # Return checklist, dropdown defaults
│   ├── mail.ts  mailIngest.ts                # Outbound templates, inbound parsing
│   ├── attachmentStorage.ts                  # Attachment bytes on disk
│   ├── printerStorage.ts                     # Driver binaries on disk
│   └── logError.ts  chunkError.ts            # Server logging, stale-chunk recovery
├── types/                                    # next-auth.d.ts, ticket.ts, printer.ts
├── prisma/schema.prisma                      # 13 models — see docs/ARCHITECTURE.md §6
├── scripts/                                  # One-shot maintenance scripts
├── __tests__/                                # 1,028 tests across 52 suites
├── auth.ts                                   # NextAuth config
├── deploy.sh                                 # Deployment (build runs on server)
├── deploy.ps1                                # The same, for Windows PowerShell
├── scripts/deploy-remote.sh                  #   the server side, shared by both
├── scripts/maintenance.template.html         #   the swap-window page, shared by both
├── .github/workflows/deploy.yml              # The same script, run from CI on demand
├── setup-server.sh  ssl-init.sh              # One-time server setup, SSL via Certbot
└── ecosystem.config.js                       # PM2 config
```

---

## Data Model

Thirteen Prisma models: `User`, `Ticket`, `TicketHistory`, `TicketMessage`, `TicketNote`, `TicketAttachment`, `TicketEquipment`, `TicketReview`, `License`, `Printer`, `PrinterDriver`, `FieldOption`, `Log`.

`prisma/schema.prisma` is the source of truth. The annotated field-by-field reference — types, defaults, indexes, and why each column exists — is [`docs/ARCHITECTURE.md` §6](docs/ARCHITECTURE.md#6-database-schema-reference).

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/cristalino-dev/HelpDesk.git
```

```bash
cd HelpDesk && npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `AUTH_SECRET` | ✓ | Random secret — `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | ✓ | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | ✓ | Google OAuth client secret |
| `AUTH_TRUST_HOST` | ✓ | `true` when behind a proxy |
| `NEXT_PUBLIC_APP_URL` | ✗ | Base URL for links inside emails |
| `SMTP_USER` / `SMTP_PASS` | ✗ | Google Workspace mailbox + App Password; also used for IMAP |
| `IMAP_HOST` / `TICKET_MAIL_KEYWORD` | ✗ | Email-to-ticket settings |
| `DIGEST_SECRET` / `SWEEP_SECRET` / `INGEST_SECRET` | ✗ | Cron endpoint secrets |
| `AUTOMATION_API_KEY` | ✗ | Bearer key for the M2M close endpoint |

Without the optional variables the app still runs: mail becomes a no-op and the endpoints that need them return 503. The full table, including what degrades how, is in [`docs/ARCHITECTURE.md` §12](docs/ARCHITECTURE.md#12-environment-variables-reference).

### 3. Set up the database

```bash
npx prisma generate && npx prisma migrate deploy
```

### 4. Run locally

```bash
npm run dev
```

### 5. Run the tests

```bash
npx jest --ci
```

---

## Google OAuth Setup

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add your app URL to **Authorized JavaScript origins**
4. Add `{YOUR_URL}/api/auth/callback/google` to **Authorized redirect URIs**
5. Copy the Client ID and Secret into `.env.local`
6. Make sure the OAuth app is **Published** (not Testing mode)

> There is no domain check in application code — `auth.ts` defines no `signIn` callback. Restricting sign-in to `@cristalino.co.il` is done in the Google Cloud / Workspace configuration. Any account Google admits is auto-provisioned as a regular user.

---

## Granting admin access

From the admin console: **ניהול משתמשים** → edit the user → tick הרשאת מנהל.

Or directly in the database:

```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'user@company.com';
```

`isAdmin` is re-read from the database on every session access, so the change takes effect on the user's next request.

> `ADMIN_EMAILS` appears in `.env.example` and in a comment in `auth.ts`, but **nothing reads it**. The env-var route was considered and never implemented — use one of the two methods above.

---

## Deployment (Ubuntu Linux via SSH)

```bash
./deploy.sh
```

**On Windows, use PowerShell** — no Git Bash or WSL needed:

```powershell
.\deploy.ps1 -Key C:\Users\you\alon.pem
```

`deploy.ps1` is the twin of `deploy.sh` and shares its two moving parts
(`scripts/maintenance.template.html`, `scripts/deploy-remote.sh`), so the two
cannot drift. It uses the `ssh`, `scp` and `tar` that ship with Windows 10/11,
and works from a locked-down temporary copy of your key rather than changing
its permissions.

The key defaults to `../CrisRouter/alon.pem`; point `DEPLOY_KEY` at it if yours
lives elsewhere (`DEPLOY_HOST` and `DEPLOY_USER` override the target the same
way):

```bash
DEPLOY_KEY=/c/Users/you/alon.pem ./deploy.sh
```

**Or deploy from GitHub Actions** — Actions → **Deploy** → *Run workflow*. It
runs this same script from a runner, gated on `jest --ci` and `tsc --noEmit`, so
it also works from a machine with no route to the server. Requires the
`DEPLOY_SSH_KEY` repository secret; see
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for the one-time
setup. CI never holds the app's secrets: `.env`/`.env.local` are gitignored, so
`deploy.sh` omits them from the archive and the server keeps its own copies.

```bash
./setup-server.sh
```

```bash
./ssl-init.sh
```

**Build pipeline (runs on the server):**

```
npm install → prisma migrate deploy → prisma generate → jest --ci → next build → pm2 restart
```

The build goes into `.next-staging` while the old build keeps serving, then the two are swapped during a seconds-long stop window. `deploy.sh` also installs three cron entries: the daily digest (09:00), the urgency sweep (every 5 min), and email ingestion (every 2 min, `flock`-guarded).

---

## Notes

- **Inline styles** — no Tailwind CSS in page components; only `globals.css` uses Tailwind resets. Design tokens live in `lib/theme.ts`, and are CSS custom properties so that light/dark can switch inside an inline style. Never type a colour literal in `app/` or `components/` — add a token to `lib/palette.ts`; a test enforces this
- **Build on server** — Turbopack embeds absolute paths; never build locally and copy `.next`
- **Tests gate the build** — `npm run build` is `prisma generate && jest --ci && next build`
- **Hooks before early returns** — all React hooks must come before any conditional `return null`
- **`params` is a Promise** — in Next.js 16, always `await params` in dynamic route handlers
- **`uploads/` survives deploys** — attachment and driver files are outside the deploy archive and git-ignored
- **Version lives in `lib/version.ts` only** — format `"X.YY"`, rendered by `FooterCopyright`

---

&copy; 2026 AK. All rights reserved.
