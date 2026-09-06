# Cristalino HelpDesk — Architecture Document

> Version 2.0 · Last updated 2026-09-06 · v3.69

This document describes **how the system is built** — the database schema, the
HTTP surface, the authorization rules, and the deployment shape.

Two things deliberately do **not** live here:

| You want | Read |
|---|---|
| What changed in each release | [`RELEASE_NOTES.md`](../RELEASE_NOTES.md) — the version record |
| Day-to-day working rules and current state | `HANDOFF.md` in the repo root — **gitignored, local-only**, so it is not in a fresh clone |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture Diagram](#3-high-level-architecture-diagram)
4. [Request Flow Diagrams](#4-request-flow-diagrams)
5. [Application Layer Map](#5-application-layer-map)
6. [Database Schema Reference](#6-database-schema-reference)
7. [API Routes Reference](#7-api-routes-reference)
8. [Authorization Matrix](#8-authorization-matrix)
9. [Error Logging Architecture](#9-error-logging-architecture)
10. [Background Jobs](#10-background-jobs)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Environment Variables Reference](#12-environment-variables-reference)

---

## 1. System Overview

Cristalino HelpDesk is an internal web application for Cristalino Group LTD
employees to submit IT support requests and for the IT department to manage
them. The UI is Hebrew, right-to-left throughout (`lang="he" dir="rtl"`).

There are four effective roles. Only **Admin** is a database flag; the other
three come from hardcoded address lists in `lib/staffEmails.ts`.

| Role | How you get it | Entry point | Capabilities |
|------|----------------|-------------|--------------|
| **Employee** | Any signed-in user | `/dashboard` | Open tickets, view/search own tickets, chat with staff, close and re-open own tickets, edit profile |
| **Viewer** | Listed in `VIEWER_EMAILS` | `/tickets/view` | Read-only list of all tickets; cannot modify anything |
| **Staff** | Listed in `STAFF_EMAILS`, **or** `isAdmin = true` | `/tickets` | All tickets, edit any field, assign, internal notes, attachments, record equipment arrivals |
| **Admin** | `User.isAdmin = true` in the DB | `/admin` | Everything Staff can do, plus user management, error logs, field options, licenses, printers, the equipment shortage report, changing a ticket's submitter, and deleting tickets |

`isAdmin` implies staff — every staff guard in the codebase reads
`session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)`.

Authentication is Google OAuth only; no passwords are stored. There is **no
domain restriction in application code** — `auth.ts` defines no `signIn`
callback. Limiting sign-in to `@cristalino.co.il` is the job of the Google Cloud
OAuth client / Workspace configuration. Any account Google lets through is
auto-provisioned as a regular (non-admin) `User` row by the `session` callback.

The login button passes `prompt: "select_account"`, so users with several Google
accounts always get the account picker rather than being signed in silently.

### Ticket lifecycle

```
   פתוח  ──────────────►  בטיפול  ──────────────►  סגור
     │                      │  ▲                     │
     │                      ▼  │                     │
     └────────────────►  בהמתנה ─┘                     │
                    (holdReason required)             │
                                                      │
     ◄─────────────────────────────────────────────────┘
       re-open: owner within 4 weeks; staff/admin at any time
```

Four statuses, not three: **בהמתנה** (on hold) requires a free-text
`holdReason`, which is cleared automatically when the ticket leaves that status.

**Compound close is a system-wide invariant.** Setting `status = "סגור"` always
also forces `urgency = "נמוך"`. It is enforced server-side in
`PATCH /api/tickets`, re-applied by `POST /api/automation/close`, and swept for
every 5 minutes by `POST /api/admin/sweep`. Client code must never reproduce it
— call `closeTicket()` from `lib/ticketApi.ts`.

Two categories carry extra behaviour:

- **`"עובד חדש"` (new employee)** — the form demands four extra fields (first
  name, last name, phone, job title), which are folded into the description as a
  labelled block rather than stored in new columns. See `lib/newEmployee.ts`.
- **`"עובד עוזב"` (leaving employee)** — the ticket is born with a return
  checklist covering *every* item on the equipment list, and **cannot be closed
  while any line is untouched**. See `lib/offboarding.ts`.

---

## 2. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.2.2 | App Router, Turbopack dev server |
| Language | TypeScript | 5.x | Strict mode |
| UI | React | 19.2.4 | Client components wherever there is interaction |
| Styling | Inline React styles | — | No Tailwind in components; design tokens in `lib/theme.ts`. Only `globals.css` uses Tailwind resets |
| Auth | NextAuth | 5.0.0-beta.30 | Google OAuth, JWT sessions |
| ORM | Prisma | 5.22.0 | Type-safe DB client |
| Database | PostgreSQL | — | AWS RDS (managed) |
| Mail (outbound) | nodemailer | 7.x | Google Workspace SMTP |
| Mail (inbound) | imapflow + mailparser | 1.4.x / 3.9.x | Email-to-ticket polling |
| HTTP client | axios | 1.14.x | |
| Testing | Jest + RTL | 30 + 16 | **688 tests across 43 suites** — they gate `npm run build` locally |
| Hosting | Ubuntu 24.04 (AWS Lightsail) | — | PM2 process manager |
| Deploy | SSH + SCP | — | `deploy.sh` (bash) and `deploy.ps1` (Windows PowerShell) — the build runs on the server. Both share `scripts/deploy-remote.sh` and `scripts/maintenance.template.html`, so the entry points cannot drift. `DEPLOY_KEY`/`DEPLOY_HOST`/`DEPLOY_USER` override the defaults, which is how `.github/workflows/deploy.yml` runs it from a runner |

`nodemailer`, `imapflow` and `mailparser` are listed in `next.config.ts`
under `serverExternalPackages` — they are Node-only and must not be bundled.

---

## 3. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER (Hebrew RTL)                             │
│                                                                              │
│  /login  /dashboard  /tickets  /tickets/[id]  /admin  /profile  /open        │
│  /contact  /help  /manual  /admin-manual  /review/[ticketId]  /tickets/view  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │  HTTPS (nginx + Certbot)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              AWS LIGHTSAIL — UBUNTU 24.04 · PM2 · port 3000                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        NEXT.JS 16 APP ROUTER                           │ │
│  │                                                                        │ │
│  │  Server Components        │  Client Components                         │ │
│  │  ─────────────────        │  ─────────────────                         │ │
│  │  app/layout.tsx           │  every page under app/ except layout       │ │
│  │  app/page.tsx (redirect)  │  components/*.tsx                          │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                            API ROUTES                                  │ │
│  │  /api/auth/[...nextauth]   OAuth callbacks (NextAuth)                  │ │
│  │  /api/tickets   /api/tickets/all   /api/tickets/[id]/*                 │ │
│  │  /api/profile   /api/users   /api/staff   /api/reviews   /api/contact  │ │
│  │  /api/attachments/[id]     /api/logs (write-only telemetry)            │ │
│  │  /api/admin/{logs, digest, sweep, ingest-mail, equipment,              │ │
│  │              field-options, licenses, printers}                        │ │
│  │  /api/automation/close     Bearer-key machine-to-machine closure       │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │             lib/  — pure logic, storage helpers, mail templates        │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                      PRISMA ORM (lib/db.ts)                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  uploads/ticket-attachments/   ← attachment bytes (since v3.48)              │
│  uploads/printer-drivers/      ← driver binaries                             │
│  (both outside the deploy archive, so they survive deploys)                  │
└───┬───────────────────────┬──────────────────────┬───────────────────────────┘
    │ TCP 5432              │ SMTP                 │ IMAP 993
    ▼                       ▼                      ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  AWS RDS     │   │ Google Workspace │   │ Google Workspace │
│  PostgreSQL  │   │ SMTP (outbound)  │   │ IMAP (inbound)   │
│  13 tables   │   │ helpdesk@        │   │ helpdesk@        │
└──────────────┘   └──────────────────┘   └──────────────────┘

                   ┌──────────────────────┐
                   │ GOOGLE OAUTH SERVERS │
                   │ accounts.google.com  │
                   └──────────────────────┘
```

---

## 4. Request Flow Diagrams

### 4.1 Authentication Flow

```
Browser                  Next.js Server             Google OAuth          PostgreSQL
   │                          │                          │                    │
   │  GET /                   │                          │                    │
   │─────────────────────────>│                          │                    │
   │                          │  auth() → no session     │                    │
   │  redirect /login         │                          │                    │
   │<─────────────────────────│                          │                    │
   │                          │                          │                    │
   │  Click "התחברות עם Google"│                          │                    │
   │─────────────────────────>│                          │                    │
   │                          │  signIn("google",        │                    │
   │                          │    {callbackUrl},        │                    │
   │  redirect to Google      │    {prompt:select_account})────────────────>  │
   │<─────────────────────────│                          │                    │
   │                          │                          │                    │
   │  User picks account      │                          │                    │
   │───────────────────────────────────────────────────────>                    │
   │                          │                          │                    │
   │  GET /api/auth/callback  │                          │                    │
   │─────────────────────────>│                          │                    │
   │                          │  exchange code for token │                    │
   │                          │─────────────────────────>│                    │
   │                          │  profile (email,name,img)│                    │
   │                          │<─────────────────────────│                    │
   │                          │                          │                    │
   │                          │  session callback runs   │                    │
   │                          │  findUnique(email) ──────│───────────────────>│
   │                          │                          │                    │
   │                          │  [first login]           │                    │
   │                          │  create(email,name,img)──│───────────────────>│
   │                          │  isAdmin, id ────────────│───────────────────<│
   │                          │                          │                    │
   │                          │  sign JWT cookie         │                    │
   │                          │  (carries isAdmin, id)   │                    │
   │  redirect /dashboard     │                          │                    │
   │<─────────────────────────│                          │                    │
```

`isAdmin` is re-read from the database on **every** session access, so promoting
or demoting a user takes effect on their next request — not only at next login.

### 4.2 Employee Submitting a Ticket

```
Browser (Dashboard / /open)   POST /api/tickets            PostgreSQL      SMTP
       │                            │                          │            │
       │  Fill TicketForm            │                          │            │
       │  (+ equipment lines,        │                          │            │
       │   + new-employee fields     │                          │            │
       │     if category = עובד חדש) │                          │            │
       │  Click "שלח פנייה"          │                          │            │
       │───────────────────────────>│                          │            │
       │                            │  auth() → read JWT       │            │
       │                            │  [401 if no session]     │            │
       │                            │                          │            │
       │                            │  onBehalfOfEmail present │            │
       │                            │  and NOT admin → 403     │            │
       │                            │                          │            │
       │                            │  newEmployee incomplete  │            │
       │                            │  → 400                   │            │
       │                            │                          │            │
       │                            │  resolveUserByEmail() ──>│            │
       │                            │  (case-insensitive find, │            │
       │                            │   create if truly new)   │            │
       │                            │                          │            │
       │                            │  ticket.create(...) ────>│            │
       │                            │  equipment lines ───────>│            │
       │                            │  offboarding checklist ─>│            │
       │                            │    (if עובד עוזב)         │            │
       │                            │  history "created" ─────>│            │
       │                            │                          │            │
       │                            │  mailTicketOpenedUser ───────────────>│
       │                            │  mailTicketOpenedStaff ──────────────>│
       │  201 { ticket }            │                          │            │
       │<───────────────────────────│                          │            │
       │  GET /api/tickets → list refreshes                    │            │
```

### 4.3 Staff Changing Ticket Status

```
Browser (/admin or /tickets)   PATCH /api/tickets           PostgreSQL      SMTP
       │                            │                          │            │
       │  { id, status }            │                          │            │
       │───────────────────────────>│                          │            │
       │                            │  auth() → isStaff?       │            │
       │                            │  regular user may only   │            │
       │                            │  close/re-open own       │            │
       │                            │  (4-week reopen window)  │            │
       │                            │                          │            │
       │                            │  status = "סגור"          │            │
       │                            │    → urgency = "נמוך"     │            │
       │                            │      (compound close)    │            │
       │                            │  status = "בהמתנה"        │            │
       │                            │    → holdReason required │            │
       │                            │  leaving "בהמתנה"         │            │
       │                            │    → holdReason = null   │            │
       │                            │  assignedTo = self       │            │
       │                            │    and was "פתוח"         │            │
       │                            │    → status = "בטיפול"    │            │
       │                            │                          │            │
       │                            │  offboarding ticket with │            │
       │                            │  unticked lines → 400    │            │
       │                            │  { blockers }            │            │
       │                            │                          │            │
       │                            │  ticket.update() ───────>│            │
       │                            │  AWAIT history           │            │
       │                            │    createMany() ────────>│            │
       │                            │                          │            │
       │                            │  status change → owner + assignee only│
       │                            │  other edits  → all staff ───────────>│
       │  200 { ticket }            │                          │            │
       │<───────────────────────────│                          │            │
```

The history write is **awaited**, never `void`-ed, so a client re-fetch that
follows the response always sees the new timeline entry.

### 4.4 Email-to-Ticket Ingestion

```
cron (*/2 min)         POST /api/admin/ingest-mail      Gmail IMAP     PostgreSQL
  run-ingest.sh              │                              │              │
  (flock-guarded)            │                              │              │
       │  x-ingest-secret    │                              │              │
       │───────────────────>│                              │              │
       │                     │  [401 if secret wrong]       │              │
       │                     │  [503 if SMTP_USER/PASS unset]              │
       │                     │                              │              │
       │                     │  connect imapflow TLS :993 ─>│              │
       │                     │  search { seen:false,        │              │
       │                     │           subject: keyword } │              │
       │                     │  <── matching messages ──────│              │
       │                     │                              │              │
       │                     │  fixCharsetLabels()          │              │
       │                     │   iso-8859-8-i/-e            │              │
       │                     │     → windows-1255           │              │
       │                     │  simpleParser()              │              │
       │                     │  buildIngestedTicket()       │              │
       │                     │                              │              │
       │                     │  dedupe on sourceMessageId ─────────────────>│
       │                     │  resolveUserByEmail(From) ──────────────────>│
       │                     │  ticket.create(urgency=דחוף) ───────────────>│
       │                     │  history "created" ─────────────────────────>│
       │                     │                              │              │
       │                     │  mark \Seen ────────────────>│              │
       │  200 { ok, created, tickets[] }                     │              │
       │<───────────────────│                              │              │
```

Non-matching emails are left **unread and untouched**. `Ticket.sourceMessageId`
is `@unique`, so the same email can never produce two tickets even if a run
overlaps or is retried.

### 4.5 Equipment Request → Shortage Report

```
Opener (any ticket)        Technician                Admin console
       │                        │                          │
       │ POST /api/tickets      │                          │
       │  { equipment: [        │                          │
       │     {label, quantity}] │                          │
       │  }                     │                          │
       │   — or later —         │                          │
       │ POST /api/tickets/     │                          │
       │      [id]/equipment    │                          │
       │  (upsert by label)     │                          │
       ▼                        │                          │
  TicketEquipment rows          │                          │
  quantity = N                  │                          │
  receivedQty = 0               │                          │
       │                        │                          │
       │   items arrive ────────►                          │
       │                        │ PATCH /api/tickets/      │
       │                        │       [id]/equipment     │
       │                        │  { id, receivedQty }     │
       │                        │  or { id, received:true }│
       │                        │  STAFF ONLY              │
       │                        ▼                          │
       │                 receivedQty ↑                     │
       │                 receivedAt / receivedBy set       │
       │                        │                          │
       │                        │   GET /api/admin/        │
       │                        │       equipment  ────────►
       │                        │                          │
       │                        │   aggregateShortage():   │
       │                        │   every line where       │
       │                        │   receivedQty < quantity,│
       │                        │   grouped by label,      │
       │                        │   live tickets only      │
       │                        │   (?includeClosed=1 to   │
       │                        │    audit closed ones)    │
       │                        │                          ▼
       │                        │                  "ציוד חסר" tab
       │                        │                  + supplierText
       │                        │                    (one order)
```

`TicketEquipment.label` is a **snapshot** of the `FieldOption` label at request
time — renaming or deleting an equipment option later must not rewrite the
history of tickets already filed. Leaving-employee tickets never appear in the
shortage report: their checklist is gear coming back, not gear to buy.

### 4.6 Client Error Logging Flow

```
Browser                    ErrorBoundary /           Next.js          PostgreSQL
(Any Page)                 ClientErrorHandler        /api/logs
    │                            │                       │                 │
    │  React render error        │                       │                 │
    │  OR unhandled exception    │                       │                 │
    │  OR promise rejection      │                       │                 │
    │───────────────────────────>│                       │                 │
    │                            │                       │                 │
    │                            │  isChunkError()?      │                 │
    │                            │   yes → reload once,  │                 │
    │                            │         do not log    │                 │
    │                            │   (stale build after  │                 │
    │                            │    a deploy)          │                 │
    │                            │                       │                 │
    │                            │  POST /api/logs       │                 │
    │                            │  { level, message,    │                 │
    │                            │    source, stack }    │                 │
    │                            │──────────────────────>│                 │
    │                            │                       │  log.create()──>│
    │                            │                       │  log.deleteMany │
    │                            │                       │  (> 30 days) ──>│
    │                            │                       │  200 { ok }     │
    │                            │                       │<────────────────│
    │                                                                      │
    │  Admin opens יומן שגיאות tab                                          │
    │  GET /api/admin/logs?date=YYYY-MM-DD ───────────────────────────────>│
    │<─────────────────────────────────────────────────────────────────────│
```

`lib/chunkError.ts` filters out stale-chunk failures — a tab left open across a
deploy requests JS chunks whose hashes no longer exist. Those are not bugs, so
the page reloads once instead of logging noise.

---

## 5. Application Layer Map

```
app/
├── layout.tsx              SERVER — HTML shell, lang="he" dir="rtl", Providers mount
├── page.tsx                SERVER — Root redirect (→ /login | /admin | /dashboard)
├── globals.css             CSS    — Tailwind resets only
├── providers.tsx           CLIENT — SessionProvider + ErrorBoundary + ClientErrorHandler
│
├── login/page.tsx          CLIENT — Google sign-in (prompt=select_account)
├── dashboard/page.tsx      CLIENT — Employee: own tickets, form, search, stat filters
├── open/page.tsx           CLIENT — Ticket-open shortcut, pre-filled from profile
├── profile/page.tsx        CLIENT — Account settings (name, phone, station)
├── contact/page.tsx        CLIENT — Contact-the-dev-team form
├── help/page.tsx           CLIENT — Hebrew user manual
├── manual/page.tsx         CLIENT — Printable manual
├── admin-manual/page.tsx   CLIENT — Staff/admin manual
├── review/[ticketId]/      CLIENT — Service rating page (no login required)
│
├── tickets/
│   ├── page.tsx            CLIENT — Staff: all tickets, weekly/all-time stats, sort
│   ├── view/page.tsx       CLIENT — Viewer role: read-only ticket list
│   └── [id]/page.tsx       CLIENT — Ticket detail: notes, messages, attachments,
│                                    equipment, history timeline, polling by revision
├── admin/
│   ├── page.tsx            CLIENT — Tabs: תור פניות · ניהול משתמשים · יומן שגיאות ·
│   │                                שדות מערכת · רישוי · מדפסות · ציוד חסר
│   ├── logs/page.tsx       CLIENT — Standalone error-log viewer
│   ├── reports/            CLIENT — Ticket analytics: page.tsx + TimelineChart.tsx
│   │                                + BreakdownBars.tsx (hand-rolled SVG, no chart lib)
│   └── reviews/page.tsx    CLIENT — Service-review dashboard
│
└── api/                    See §7 for the full route reference

components/
├── AppHeader.tsx           Shared header + role badge + hamburger nav
├── Logo.tsx                Brand mark
├── TicketForm.tsx          New-ticket form (profile pre-fill, category-driven fields)
├── TicketTable.tsx         Ticket card list
├── EquipmentPicker.tsx     Item + quantity picker for equipment requests
├── NewEmployeeFields.tsx   The four mandatory "עובד חדש" fields
├── OffboardingNotice.tsx   Return-checklist banner for "עובד עוזב"
├── ImageAttachments.tsx    Pending/uploaded image strip
├── ErrorBoundary.tsx       React render-error catch + fallback UI
├── ClientErrorHandler.tsx  window.onerror + unhandledrejection listener
├── ErrorToast.tsx          Transient error banner
└── FooterCopyright.tsx     Shared version footer

lib/
├── db.ts                   Prisma singleton (prevents dev connection-pool exhaustion)
├── version.ts              VERSION constant — the single source of version truth
├── theme.ts                Design tokens: T, STATUS, URGENCY maps
│
├── users.ts                Case-insensitive User lookup / create (v3.65) — the
│                           ONLY way to resolve a User from an email, auth.ts
│                           included since v3.66
├── staffEmails.ts          STAFF_EMAILS, VIEWER_EMAILS, STAFF_MEMBERS, BOT_EMAIL,
│                           ASSIGNABLE_FALLBACK, parseMentions()
├── staffMembers.ts         Server-side resolver for the DB-driven staff roster
│
├── ticketApi.ts            Client mutation helpers — closeTicket(), updateTicket()
├── ticketSearch.ts         HDTC-number-aware search (`494`, `#494`, `HDTC-494`, …)
├── ticketRevision.ts       Compact signature so detail-page polling avoids re-renders
├── staleTicket.ts          isStaleOpen() — STALE_WORKDAYS = 4
├── workdays.ts             Israeli Sun–Thu workday arithmetic
│
├── equipment.ts            Equipment selection, receipt clamping, shortage aggregation
├── newEmployee.ts          The four mandatory onboarding fields ↔ description block
├── offboarding.ts          Return checklist + close blockers for "עובד עוזב"
├── fieldOptions.ts         Dropdown defaults + fetchFieldOptions()
│
├── mail.ts                 sendMail() + every outbound HTML template
├── mailIngest.ts           Pure inbound-email → ticket logic (no I/O)
├── attachmentStorage.ts    Ticket attachment bytes on disk (v3.48+)
├── printerStorage.ts       Printer driver binaries on disk
│
├── logError.ts             Server-side logError() → Log table
├── chunkError.ts           Stale-chunk detection + one-shot reload
├── pasteImage.ts           handleImagePaste() for any textarea
└── useIsMobile.ts          useIsMobile() hook — 768 px breakpoint

types/
├── next-auth.d.ts          Augments NextAuth Session with isAdmin + id
├── ticket.ts               Ticket / TicketWithUser interfaces
└── printer.ts              Printer + PrinterDriver interfaces

prisma/
├── schema.prisma           13 models — see §6
└── migrations/             SQL migration history

scripts/
└── migrate-attachments-to-disk.js   One-shot v3.48 backfill

__tests__/                  43 suites, 688 tests — gate the build
```

> **Every entry point that receives an email address from outside must resolve
> it through `lib/users.ts`.** Matching a lowercased address against a row that
> carries capitals with `findUnique` misses it, and an `upsert` built on that
> miss inserts a second account for the same person. The callers are
> `app/api/tickets/route.ts` (on-behalf-of), `app/api/users/route.ts`
> (deletion reassignment), `app/api/admin/ingest-mail/route.ts` (inbound
> sender) and, since v3.66, `auth.ts` — which used to be the one place that
> stored the address exactly as Google supplied it, and is therefore how a row
> came to carry capitals in the first place.
>
> Since v3.66 the database enforces this rather than merely expecting it:
> `UNIQUE (lower(email))`, added out of band by the migration
> `20260824000000_user_email_case_insensitive` because Prisma has no syntax for
> a functional index. `prisma migrate dev` reports it as drift; that is
> expected. See v3.65 and v3.66 in [`RELEASE_NOTES.md`](../RELEASE_NOTES.md).

---

## 6. Database Schema Reference

Thirteen models. `prisma/schema.prisma` is the source of truth; this section is
the annotated reading of it.

Every `id` is a CUID (`@default(cuid())`) unless noted — sortable, URL-safe, and
unique across tables.

### 6.1 User

Every person who has ever signed in. Rows are created automatically on first
Google OAuth login by the `session` callback in `auth.ts`, and by
`resolveUserByEmail()` when an admin files a ticket on someone's behalf or an
email arrives from an unknown address.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `email` | String | ✓ | `@unique`, **plus a second out-of-band `UNIQUE (lower(email))`** (v3.66) — the plain unique is over the exact bytes, so it alone would let one person hold two rows differing only in case. The lookup key everywhere. Stored lowercased and trimmed; always match through `lib/users.ts`, never a bare `findUnique` on an address from outside |
| `name` | String? | ✗ | Display name from Google on first login, then editable at `/profile` |
| `image` | String? | ✗ | Google profile photo URL. Set on first login (via `resolveUserByEmail`'s optional third argument), never refreshed. Not rendered — the UI uses initials |
| `isAdmin` | Boolean | ✓ | Default `false`. Grants `/admin` and every admin-only endpoint. Re-read from the DB on every session access |
| `phone` | String? | ✗ | Set at `/profile`; pre-fills the ticket form |
| `station` | String? | ✗ | Workstation hostname/ID; pre-fills the ticket form's computer field |
| `tickets` | Ticket[] | — | Relation — tickets this user owns |

### 6.2 Ticket

The central table.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key; used in URLs (`/tickets/<id>`) and unguessable, which is what makes the public review link safe |
| `ticketNumber` | Int | ✓ | `@unique @default(autoincrement())`. The human-facing number, shown as `HDTC-<n>` |
| `assignedTo` | String | ✓ | Email of the handling staff member. Default `helpdesk@cristalino.co.il`. May be `bot@cristalino.co.il` (the automation bot — never a mail recipient) |
| `subject` | String | ✓ | Short title |
| `description` | String | ✓ | Full details. For `"עובד חדש"` tickets this also carries the labelled new-employee block (see `lib/newEmployee.ts`) |
| `phone` | String | ✓ | Reporter's contact number. Empty string for email-ingested tickets |
| `computerName` | String | ✓ | Affected machine. Empty string for email-ingested tickets |
| `urgency` | String | ✓ | Default `"בינוני"`. `נמוך` \| `בינוני` \| `גבוה` \| `דחוף` — extendable via FieldOption, but these four are protected from deletion |
| `category` | String | ✓ | Default `"אחר"`. FieldOption-driven; `עובד חדש` and `עובד עוזב` are protected and carry extra behaviour |
| `platform` | String | ✓ | Default `"מחשב אישי"`. FieldOption-driven |
| `status` | String | ✓ | Default `"פתוח"`. `פתוח` \| `בטיפול` \| `בהמתנה` \| `סגור` |
| `createdAt` | DateTime | ✓ | `@default(now())` |
| `updatedAt` | DateTime | ✓ | `@updatedAt`. **Not bumped** by adding a message or note — see `lib/ticketRevision.ts` |
| `userId` | String | ✓ | FK → `User.id`. The מגיש (submitter). Admins can move it via `PATCH /api/tickets { ownerEmail }` |
| `sourceMessageId` | String? | ✗ | `@unique`. The source email's `Message-ID` for email-ingested tickets; the idempotency key that stops one email becoming two tickets. Null for UI tickets |
| `holdReason` | String? | ✗ | Required while `status = "בהמתנה"`; cleared automatically on reinstatement |

Relations: `user`, `notes`, `attachments`, `messages`, `review`, `history`,
`equipment`.

Indexes: `@@index([userId])` (the user dashboard filters by owner) and
`@@index([status])` (the digest and sweep crons filter by it every few minutes).
Postgres does not index foreign keys automatically.

### 6.3 TicketHistory

The audit trail. Written on creation and on every field change.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `ticketId` | String | ✓ | FK → `Ticket.id`, `onDelete: Cascade` |
| `field` | String | ✓ | `"created"` \| `"status"` \| `"urgency"` \| `"assignedTo"` \| `"edited"` |
| `oldValue` | String? | ✗ | Previous value |
| `newValue` | String? | ✗ | New value. For a hold this reads `בהמתנה: <holdReason>` |
| `actorName` | String | ✓ | Who made the change — the acting admin, not the ticket owner |
| `actorEmail` | String | ✓ | Their address |
| `changedAt` | DateTime | ✓ | `@default(now())` |

Indexed on `ticketId`.

### 6.4 TicketMessage

Two-way user ↔ staff conversation. Visible to the ticket owner.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `ticketId` | String | ✓ | FK → `Ticket.id`, cascade |
| `content` | String | ✓ | Message body |
| `authorName` | String | ✓ | Sender's display name |
| `authorEmail` | String | ✓ | Sender's address. Only the author may delete their own message |
| `authorRole` | String | ✓ | `"staff"` \| `"user"` |
| `createdAt` | DateTime | ✓ | `@default(now())` |

Indexed on `ticketId`.

### 6.5 TicketNote

Internal technician notes. **Never shown to the ticket owner.** Supports
`@mention` handles and pasted images.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `ticketId` | String | ✓ | FK → `Ticket.id`, cascade |
| `content` | String | ✓ | Note body; `@handle` mentions trigger notification email |
| `authorName` | String | ✓ | Staff member's name |
| `authorEmail` | String | ✓ | Staff member's address |
| `createdAt` | DateTime | ✓ | `@default(now())` |

Indexed on `ticketId`.

### 6.6 TicketAttachment

Since v3.48 the bytes live on the server filesystem under
`uploads/ticket-attachments/`; the row holds only metadata.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key; the URL is `/api/attachments/<id>` |
| `ticketId` | String | ✓ | FK → `Ticket.id`, cascade |
| `dataUrl` | String? | ✗ | **Legacy** inline base64 for rows created before v3.48. Null once the file is on disk. Still served as a fallback |
| `storedName` | String? | ✗ | `@unique`. On-disk filename (`uuid.ext`) |
| `mimeType` | String? | ✗ | Content type |
| `size` | Int? | ✗ | Decoded size in bytes |
| `filename` | String? | ✗ | Original name shown to the user |
| `createdAt` | DateTime | ✓ | `@default(now())` |

Indexed on `ticketId`. `scripts/migrate-attachments-to-disk.js` moves legacy
rows onto disk.

### 6.7 TicketEquipment

Equipment requested on a ticket. Introduced in v3.58.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `ticketId` | String | ✓ | FK → `Ticket.id`, cascade |
| `label` | String | ✓ | e.g. `"מסך"`, `"חשבון Gmail"`. A **snapshot** of the FieldOption label at request time, so renaming the option later does not rewrite filed tickets |
| `quantity` | Int | ✓ | Default `1`. How many were requested (max 99) |
| `receivedQty` | Int | ✓ | Default `0`. How many arrived / were installed, clamped to `0..quantity` |
| `receivedAt` | DateTime? | ✗ | When the line was last marked fully received |
| `receivedBy` | String? | ✗ | Email of the staff member who marked it |
| `createdAt` | DateTime | ✓ | `@default(now())` |

`@@unique([ticketId, label])` — re-posting an existing label updates its
quantity rather than adding a duplicate line. Indexed on `ticketId` for the
shortage scan.

Despite the name, equipment is **not** limited to onboarding tickets — any
ticket may carry lines. The `"עובד חדש"` category only decides whether the
picker is expanded by default.

### 6.8 TicketReview

Service rating, one per ticket.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `ticketId` | String | ✓ | `@unique`, FK → `Ticket.id`, cascade |
| `rating` | Int | ✓ | 1–5 |
| `comment` | String? | ✗ | Optional free text |
| `submitterName` | String | ✓ | Who rated |
| `submitterEmail` | String | ✓ | Their address |
| `createdAt` | DateTime | ✓ | `@default(now())` |

### 6.9 License

Software license inventory, managed in the admin **רישוי** tab.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `key` | String | ✓ | The license number / product key |
| `category` | String | ✓ | Default `"Office"`. Managed via FieldOption (`field = "licenseCategory"`) |
| `username` | String? | ✗ | Account the license was activated with |
| `password` | String? | ✗ | Masked in the UI, click-to-reveal |
| `remark` | String? | ✗ | Free text — who received it, which machine |
| `createdAt` / `updatedAt` | DateTime | ✓ | Timestamps |

`@@unique([category, key])` — bulk insert skips duplicates. Indexed on
`category`.

### 6.10 Printer

Printer inventory, managed in the admin **מדפסות** tab.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `name` | String | ✓ | Display name |
| `maker` | String? | ✗ | יצרן — manufacturer |
| `model` | String? | ✗ | Model number / name |
| `supplier` | String? | ✗ | ספק — supplier the printer belongs to |
| `ipv4` | String? | ✗ | Network IPv4 address |
| `hostname` | String? | ✗ | Network hostname |
| `inkToner` | String? | ✗ | סוג דיו/טונר — required ink/toner type |
| `tonerLevel` | Int? | ✗ | 0–100 % remaining |
| `supplierSerial` | String? | ✗ | מספר ספק — supplier-assigned serial |
| `createdAt` / `updatedAt` | DateTime | ✓ | Timestamps |
| `drivers` | PrinterDriver[] | — | Relation |

Indexed on `name`.

### 6.11 PrinterDriver

Driver binaries can be hundreds of MB, so the files live under
`uploads/printer-drivers/` and the row holds only metadata.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `printerId` | String | ✓ | FK → `Printer.id`, cascade |
| `filename` | String | ✓ | Original name shown to the user |
| `storedName` | String | ✓ | `@unique`. On-disk name (uuid + sanitized original) |
| `size` | Int | ✓ | Bytes. Max 100 MB per file |
| `mimeType` | String? | ✗ | Content type |
| `createdAt` | DateTime | ✓ | `@default(now())` |

Indexed on `printerId`.

### 6.12 FieldOption

DB-driven dropdown values, managed in the admin **שדות מערכת** tab.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `field` | String | ✓ | `"category"` \| `"platform"` \| `"urgency"` \| `"licenseCategory"` \| `"equipment"` |
| `label` | String | ✓ | The value shown in the dropdown |
| `order` | Int | ✓ | Default `0`. Sort position |

`@@unique([field, label])`, indexed on `field`. Defaults are auto-seeded on the
first `GET` for any field whose rows are missing. Deletion is blocked for the
four protected urgencies and for the `עובד חדש` / `עובד עוזב` categories, which
business logic depends on.

### 6.13 Log

Error and telemetry sink. Has no foreign keys.

| Column | Type | Required | Description |
|---|---|---|---|
| `id` | String (CUID) | ✓ | Primary key |
| `timestamp` | DateTime | ✓ | `@default(now())` |
| `level` | String | ✓ | Default `"error"` |
| `message` | String | ✓ | Error message, or an audit line (ticket deletions are recorded here) |
| `source` | String? | ✗ | Route or component that reported it |
| `stack` | String? | ✗ | Stack trace |
| `date` | String | ✓ | `"YYYY-MM-DD"` — the query key for the admin log tab |

Indexed on `date` and `timestamp`. Rows older than 30 days are deleted on write.

### 6.14 Entity Relationship Diagram

```
┌────────────────┐
│      User      │
│ id · email(U)  │
│ isAdmin        │
└───────┬────────┘
        │ 1 : N   (userId — the מגיש)
        ▼
┌──────────────────────────────────────────────────────────┐
│                        Ticket                            │
│  id · ticketNumber(U) · status · urgency · category      │
│  holdReason? · sourceMessageId(U)?                       │
└──┬────────┬────────┬─────────┬──────────┬────────────────┘
   │ 1:N    │ 1:N    │ 1:N     │ 1:N      │ 1:1      │ 1:N
   ▼        ▼        ▼         ▼          ▼          ▼
┌────────┐┌────────┐┌────────┐┌─────────┐┌────────┐┌──────────┐
│Ticket  ││Ticket  ││Ticket  ││Ticket   ││Ticket  ││Ticket    │
│History ││Message ││Note    ││Attach-  ││Review  ││Equipment │
│        ││        ││        ││ment     ││        ││          │
└────────┘└────────┘└────────┘└─────────┘└────────┘└──────────┘
   all six: onDelete: Cascade
   TicketReview   — ticketId @unique  (one review per ticket)
   TicketEquipment— @@unique([ticketId, label])

┌────────────────┐          ┌────────────────┐
│    Printer     │ 1 : N    │ PrinterDriver  │
│ id · name      ├─────────►│ storedName (U) │
└────────────────┘  cascade └────────────────┘

┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│    License     │  │  FieldOption   │  │      Log       │
│ @@unique       │  │ @@unique       │  │ (no FKs —      │
│ (category,key) │  │ (field,label)  │  │  independent)  │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## 7. API Routes Reference

**Auth column key** — `—` none · `User` any signed-in user ·
`Owner/Staff` the ticket's owner or any staff member · `Staff` staff or admin ·
`Admin` `isAdmin` only · `Secret` shared-secret header (cron) ·
`Key` Bearer API key.

### Tickets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tickets` | User | Own tickets; **all** tickets with nested `user` if admin |
| POST | `/api/tickets` | User | Create a ticket. Accepts `equipment[]` on any category, `newEmployee{}` (mandatory for `עובד חדש`, else 400), and `onBehalfOfEmail` / `onBehalfOfName` (**admin only**, 403 otherwise) → 201 |
| PATCH | `/api/tickets` | User / Staff / Admin | Update fields. **Compound close** forces `urgency="נמוך"`. `holdReason` required for `בהמתנה`. Self-assign from `פתוח` auto-sets `בטיפול`. Owners may close anytime and re-open within 4 weeks. `ownerEmail` (change the מגיש) is **admin only** and requires an existing user. Offboarding tickets with unticked lines → 400 `{ blockers }` |
| GET | `/api/tickets/all` | Staff / Viewer | All tickets — the read-only viewer list |
| GET | `/api/tickets/[id]` | Owner/Staff | Full detail: messages, notes, attachment metadata, equipment |
| DELETE | `/api/tickets/[id]` | **Admin** | Permanently erase a ticket. No undo, no soft-delete. Child rows cascade; attachment bytes are unlinked first; the deletion itself is written to `Log` |
| GET | `/api/tickets/[id]/history` | Owner/Staff | Audit timeline |
| POST | `/api/tickets/[id]/messages` | Owner/Staff | Post a conversation message. Optional `replyToEmail` / `replyToName` / `replyToMsgId` target one participant with a deep-link email and suppress the general notification |
| DELETE | `/api/tickets/[id]/messages` | Author | Delete your own message |
| POST | `/api/tickets/[id]/notes` | Staff | Internal note; `@handle` mentions notify by email |
| POST | `/api/tickets/[id]/attachments` | Owner/Staff | Upload an image (data URL in, bytes to disk) |
| POST | `/api/tickets/[id]/equipment` | Owner/Staff | Add/amend lines `[{ label, quantity }]`; upsert by label. Frozen for the owner once the ticket is closed |
| PATCH | `/api/tickets/[id]/equipment` | **Staff** | Record arrivals: `{ id, receivedQty }` or `{ id, received: true }` |
| DELETE | `/api/tickets/[id]/equipment` | Staff, or Owner | Owner only while nothing has arrived against the line |

All three equipment verbs return the ticket's full ordered line list, so the
client can replace state without a second round-trip.

### People and profile

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/profile` | User | Own name/phone/station (`image` and `isAdmin` are not exposed) |
| PATCH | `/api/profile` | User | Update own name/phone/station |
| GET | `/api/users` | Admin | All users |
| PATCH | `/api/users` | Admin | Update name/phone/station/`isAdmin`. Revoking the last admin is refused |
| DELETE | `/api/users` | Admin | Delete a user; their tickets are bulk-reassigned to `helpdesk@`. Self-deletion blocked |
| GET | `/api/staff` | Staff | Effective roster — DB users with `isAdmin = true`, plus the bot for assignment. Feeds assignment dropdowns and `@mention` chips |

### Reviews, attachments, contact

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/reviews?ticket=<id>` | — | **Public.** Ticket summary + existing review, to bootstrap the rating page |
| GET | `/api/reviews` | Staff | All reviews for the dashboard |
| POST | `/api/reviews` | — | **Public.** Submit a rating for a closed ticket |
| PATCH | `/api/reviews` | — | **Public.** Change an existing rating/comment |
| GET | `/api/admin/reports` | Admin | Every ticket flattened for the reports page — opened date, resolved close date, and the five dimensions it breaks down by |
| GET | `/api/attachments/[id]` | Owner/Staff | Serve attachment bytes (disk, or legacy `dataUrl`). Cached immutable |
| POST | `/api/contact` | User | Email the dev team. 503 if SMTP is unconfigured |

Review POST/PATCH are intentionally unauthenticated: the ticket CUID in the
emailed link is unguessable, so only the recipient can reach the URL.

### Admin console

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/logs?date=YYYY-MM-DD` | Staff | Log entries for a date |
| DELETE | `/api/admin/logs` | **Admin** | Clear logs |
| GET | `/api/admin/field-options` | User | All options grouped by field; auto-seeds defaults |
| POST | `/api/admin/field-options` | Admin | Add an option |
| DELETE | `/api/admin/field-options` | Admin | Remove an option; refused for protected urgencies and the two special categories |
| GET / POST / PATCH / DELETE | `/api/admin/licenses` | Admin | License inventory; POST accepts bulk keys (newline or `;` separated) |
| GET / POST / PATCH / DELETE | `/api/admin/printers` | Admin | Printer inventory |
| POST / DELETE | `/api/admin/printers/drivers` | Admin | Upload / remove a driver file (≤ 100 MB, extension allowlist) |
| GET | `/api/admin/printers/drivers/[id]` | Admin | Download a driver file |
| GET | `/api/admin/equipment?includeClosed=1` | **Staff** | Shortage report — everything still owed, aggregated by item, plus `supplierText`. Staff-gated, not admin-only: the technicians who tick items off are the ones who need it |

### Machine-to-machine and cron

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | — | NextAuth OAuth handler |
| POST | `/api/logs` | — | Write a telemetry/error entry (+ 30-day cleanup). Deliberately open — the client must be able to report errors even when auth is what broke |
| POST | `/api/automation/close` | Key | Close a ticket by `ticketNumber`. `Authorization: Bearer <AUTOMATION_API_KEY>` or `X-Api-Key`. Optional `message`, `note`, `actorName`, `actorEmail`, `fields{}`. Idempotent — an already-closed ticket returns `{ ok: true, alreadyClosed: true }`. 503 if the key is unset |
| POST | `/api/admin/digest` | Secret | `x-digest-secret` → `DIGEST_SECRET`. Daily open-ticket summary to staff |
| POST | `/api/admin/sweep` | Secret | `x-sweep-secret` → `SWEEP_SECRET`, falling back to `DIGEST_SECRET`. Repairs closed tickets whose urgency is not `נמוך` |
| POST | `/api/admin/ingest-mail` | Secret | `x-ingest-secret` → `INGEST_SECRET`, falling back to `DIGEST_SECRET`. Polls IMAP and creates tickets. Returns `{ ok, created, tickets[] }`; 503 if the mailbox is unconfigured |

---

## 8. Authorization Matrix

### Pages

```
Route                       │ Unauthenticated │ Employee    │ Viewer      │ Staff │ Admin
────────────────────────────┼─────────────────┼─────────────┼─────────────┼───────┼───────
GET /                       │ → /login        │ → /dashboard│ → /dashboard│ → ... │ → /admin
GET /login                  │ ✓               │ ✓           │ ✓           │ ✓     │ ✓
GET /dashboard              │ → /login        │ ✓           │ ✓           │ ✓     │ ✓
GET /open                   │ → /login        │ ✓           │ ✓           │ ✓     │ ✓
GET /profile  /contact      │ → /login        │ ✓           │ ✓           │ ✓     │ ✓
GET /help  /manual          │ → /login        │ ✓           │ ✓           │ ✓     │ ✓
GET /tickets                │ → /login        │ → /dashboard│ → /dashboard│ ✓     │ ✓
GET /tickets/[id]           │ → /login        │ Own only    │ Read-only   │ ✓     │ ✓
GET /tickets/view           │ → /login        │ → /dashboard│ ✓           │ ✓     │ ✓
GET /admin                  │ → /login        │ → /dashboard│ → /dashboard│ → ... │ ✓
GET /admin/logs  /reviews   │ → /login        │ → /dashboard│ → /dashboard│ ✓     │ ✓
GET /admin-manual           │ → /login        │ → /dashboard│ → /dashboard│ ✓     │ ✓
GET /review/[ticketId]      │ ✓ (no login)    │ ✓           │ ✓           │ ✓     │ ✓
```

### API

```
Endpoint                          │ Unauth │ Employee   │ Viewer │ Staff │ Admin
──────────────────────────────────┼────────┼────────────┼────────┼───────┼──────
GET   /api/tickets                │ 401    │ Own only   │ Own    │ Own   │ All
POST  /api/tickets                │ 401    │ ✓          │ ✓      │ ✓     │ ✓ +onBehalfOf
PATCH /api/tickets                │ 401    │ Own close/ │ 403    │ ✓     │ ✓ +ownerEmail
                                  │        │ reopen ≤4w │        │       │
GET   /api/tickets/all            │ 401    │ 403        │ ✓      │ ✓     │ ✓
GET   /api/tickets/[id]           │ 401    │ Own only   │ ✓      │ ✓     │ ✓
DELETE/api/tickets/[id]           │ 401    │ 403        │ 403    │ 403   │ ✓
POST  /api/tickets/[id]/notes     │ 401    │ 403        │ 403    │ ✓     │ ✓
POST  /api/tickets/[id]/messages  │ 401    │ Own ticket │ 403    │ ✓     │ ✓
POST  /api/tickets/[id]/equipment │ 401    │ Own ticket │ 403    │ ✓     │ ✓
PATCH /api/tickets/[id]/equipment │ 401    │ 403        │ 403    │ ✓     │ ✓
GET   /api/attachments/[id]       │ 401    │ Own only   │ 403    │ ✓     │ ✓
GET/PATCH /api/profile            │ 401    │ Own only   │ Own    │ Own   │ Own
GET/PATCH/DELETE /api/users       │ 401    │ 403        │ 403    │ 403   │ ✓
GET   /api/staff                  │ 401    │ 403        │ 403    │ ✓     │ ✓
GET   /api/admin/logs             │ 401    │ 401        │ 401    │ ✓     │ ✓
DELETE/api/admin/logs             │ 403    │ 403        │ 403    │ 403   │ ✓
GET   /api/admin/field-options    │ 401    │ ✓          │ ✓      │ ✓     │ ✓
POST/DELETE /api/admin/field-opts │ 403    │ 403        │ 403    │ 403   │ ✓
*     /api/admin/licenses         │ 403    │ 403        │ 403    │ 403   │ ✓
*     /api/admin/printers[/*]     │ 403    │ 403        │ 403    │ 403   │ ✓
GET   /api/admin/equipment        │ 401    │ 403        │ 403    │ ✓     │ ✓
POST  /api/contact                │ 401    │ ✓          │ ✓      │ ✓     │ ✓
POST  /api/logs                   │ ✓ open │ ✓          │ ✓      │ ✓     │ ✓
GET   /api/reviews (list)         │ 401    │ 403        │ 403    │ ✓     │ ✓
GET   /api/reviews?ticket=        │ ✓ open │ ✓          │ ✓      │ ✓     │ ✓
POST/PATCH /api/reviews           │ ✓ open │ ✓          │ ✓      │ ✓     │ ✓
POST  /api/automation/close       │ Bearer AUTOMATION_API_KEY (no session)
POST  /api/admin/{digest,sweep,ingest-mail}  │ shared-secret header (no session)
```

Page guards are client-side redirects; **every one of them is backed by a
server-side check in the corresponding API route.** The client guard is
convenience, not security.

---

## 9. Error Logging Architecture

Three mechanisms capture errors, all writing to the same `Log` table:

```
                     ┌──────────────────────────────────────┐
                     │           Log database table         │
                     │  id, timestamp, level, message,      │
                     │  source, stack, date                 │
                     └──────────────────────────────────────┘
                            ▲             ▲             ▲
                            │             │             │
          ┌─────────────────┤             │             ├────────────────────┐
          │                 │             │             │                    │
  ┌───────────────┐  ┌──────────────┐     │    ┌─────────────────────┐       │
  │ ErrorBoundary │  │ ClientError  │     │    │ API routes          │       │
  │               │  │ Handler      │     │    │                     │       │
  │ React render  │  │              │     │    │ try/catch calls     │       │
  │ crashes       │  │ window error │     │    │ logError() from     │       │
  │               │  │ + unhandled  │     │    │ lib/logError.ts     │       │
  │ componentDid  │  │ rejection    │     │    │                     │       │
  │ Catch()       │  │              │     │    │ Direct Prisma write │       │
  └───────┬───────┘  └──────┬───────┘     │    │ (no HTTP round-trip)│       │
          │                 │             │    └─────────────────────┘       │
          │   both first check isChunkError() — a stale build after a        │
          │   deploy reloads once instead of logging (lib/chunkError.ts)     │
          │                 │             │                                  │
          │  POST           │  POST       │                                  │
          └─────────────────┴─────────────┘                                  │
               /api/logs  (open, no auth)                                    │
                    │                                                        │
                    └────────────────────────────────────────────────────────┘
                    Prisma log.create() + log.deleteMany(> 30 days)
```

| Mechanism | What it catches | How it logs |
|---|---|---|
| `ErrorBoundary` | React component render crashes | `POST /api/logs` |
| `ClientErrorHandler` | Unhandled JS errors + promise rejections | `POST /api/logs` |
| `logError()` in API routes | Server-side DB/logic errors | Direct Prisma write |

Reading is separate from writing: `POST /api/logs` is open so a broken client
can always report, while `GET /api/admin/logs` is staff-gated and
`DELETE /api/admin/logs` is admin-only.

---

## 10. Background Jobs

Three cron entries, all installed idempotently by `deploy.sh` and all
authenticating to `localhost:3000` with a shared secret read from
`.env.local` at run time.

| Schedule | Script | Endpoint | Purpose |
|---|---|---|---|
| `0 9 * * *` (09:00 Israel) | `send-digest.sh` | `POST /api/admin/digest` | Daily summary of open tickets to every `isAdmin` user |
| `*/5 * * * *` | `run-sweep.sh` | `POST /api/admin/sweep` | Repair any closed ticket whose urgency drifted off `נמוך` |
| `*/2 * * * *` | `run-ingest.sh` | `POST /api/admin/ingest-mail` | Poll IMAP; turn matching emails into urgent tickets |

`run-ingest.sh` is **`flock`-guarded** — a slow IMAP scan must not let the next
tick start a second overlapping run. Each script appends to
`/home/ubuntu/helpdesk/logs/{digest,sweep,ingest}.log`.

### Email-to-ticket rules

An inbound message to `helpdesk@cristalino.co.il` becomes a ticket only if the
**subject contains the keyword** (`TICKET_MAIL_KEYWORD`, default `ticket`,
case-insensitive substring). The IMAP search is server-side filtered
(`{ seen: false, subject: keyword }`) so the whole mailbox is never scanned.

| Ticket field | Source |
|---|---|
| `subject` | Email subject with the keyword removed and separators tidied. Fallback `"פנייה מהמייל"` |
| `description` | Plain-text body. Fallback `"(לא צורף תוכן להודעה)"` |
| `urgency` | Always `"דחוף"` |
| `category` / `platform` | Defaults (`"אחר"` / `"מחשב אישי"`) |
| `phone` / `computerName` | Empty strings |
| owner | `resolveUserByEmail()` on the `From` address; display name from the header, fallbacks: address, then `"שולח לא ידוע"`; address fallback `mail-ingest@cristalino.co.il` |
| `sourceMessageId` | The email's `Message-ID` — `@unique`, the idempotency key |

Hebrew bodies labelled `iso-8859-8-i` / `-e` are relabelled to `windows-1255`
by `fixCharsetLabels()` before parsing, or `mailparser` mangles them.

On success the route writes a `created` history row, emails staff and the
sender, and flags the message `\Seen`. Non-matching mail is left unread and
untouched. **Prerequisite:** IMAP must be enabled for the mailbox in Gmail
(Settings → Forwarding and POP/IMAP).

---

## 11. Deployment Architecture

```
Developer machine
        │
        │  1. ./deploy.sh
        │
        │  2. tar: app/ components/ lib/ prisma/ public/ types/ scripts/
        │     auth.ts package.json tsconfig.json next.config.ts
        │        → helpdesk-src.tar.gz
        │
        │  3. scp → ubuntu@server:/home/ubuntu/helpdesk/
        ▼
Ubuntu server — /home/ubuntu/helpdesk/
        │
        │  4. tar -xzf helpdesk-src.tar.gz
        │
        │  5. npm install                 ← skipped if package-lock hash unchanged
        │     npx prisma generate         ← skipped if schema.prisma hash unchanged
        │     next build                  ← into .next-staging (NEXT_DIST_DIR)
        │        the OLD build keeps serving from .next throughout,
        │        so a failed build leaves the live site untouched
        │
        │  ┌─ 6. SWAP WINDOW — the only downtime, seconds ──────────────┐
        │  │    pm2 stop helpdesk                                       │
        │  │    maintenance page comes up (maintenance-server.js)       │
        │  │    npx prisma migrate deploy   ← pending migrations        │
        │  │    rm -rf .next && mv .next-staging .next                  │
        │  │    pm2 start ecosystem.config.js                           │
        │  └────────────────────────────────────────────────────────────┘
        │
        │  7. install/refresh the three cron entries, then health-check
        │     until the app answers HTTP 200
        ▼
     Port 3000 → nginx → https://helpdesk.cristalino.co.il
```

**Rules that are not negotiable:**

- **Migrations run INSIDE the swap window, with the app stopped and `set -e`
  armed.** A migration that fails there does not abort cleanly — it leaves the
  site down, because `.next` is never swapped and pm2 is never restarted. Any
  migration that can fail on existing data (v3.66's `UNIQUE (lower(email))` is
  the type case) should be written `IF NOT EXISTS` and applied by hand against
  the *running* app first, where a failure costs nothing.
- **Jest is not a server-side gate.** `deploy.sh` runs `next build` directly,
  not `npm run build`, so the test suite never executes on the server. Run
  `npx jest --ci` locally before deploying.

- **Never build locally and copy `.next`.** Turbopack embeds absolute paths from
  the build machine into compiled chunks; a foreign build produces module-hash
  mismatches on the server.
- **`uploads/` is never in the archive and never in the `rm -rf` list**, so
  ticket attachments and printer drivers survive every deploy.
- **Tests gate the build.** `npm run build` is
  `prisma generate && jest --ci && next build` — the same gate runs on the
  server.
- PM2 is registered with systemd (`pm2 startup`), so the app survives reboots.

SSL is terminated by nginx with a Certbot certificate; `ssl-init.sh` performs
the one-time setup and `setup-server.sh` the one-time machine provisioning.

---

## 12. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL connection string: `postgresql://USER:PASS@HOST:5432/DB` |
| `AUTH_SECRET` | ✓ | Signs the JWT cookie. Generate with `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | ✓ | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | ✓ | Google OAuth client secret |
| `AUTH_TRUST_HOST` | ✓ | `true` behind a reverse proxy. Required on the server |
| `NEXTAUTH_URL` | ✗ | Public URL. Omitted in `.env.example` so `AUTH_TRUST_HOST` can resolve it dynamically for multiple domains |
| `NEXT_PUBLIC_APP_URL` | ✗ | Base URL used to build links inside emails. Defaults to `https://helpdesk.cristalino.co.il` |
| `SMTP_USER` | ✗ | Google Workspace mailbox (`helpdesk@cristalino.co.il`). Doubles as the IMAP username |
| `SMTP_PASS` | ✗ | Google **App Password** (16 chars, no spaces). Doubles as the IMAP password |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | ✗ | Overrides for non-Workspace SMTP. `SMTP_FROM` defaults to `SMTP_USER` |
| `IMAP_HOST` | ✗ | IMAP server. Default `imap.gmail.com` |
| `TICKET_MAIL_KEYWORD` | ✗ | Subject keyword that triggers ingestion. Default `ticket` |
| `DIGEST_SECRET` | ✗ | `x-digest-secret` for the digest cron; also the fallback for the other two |
| `SWEEP_SECRET` | ✗ | `x-sweep-secret`. Falls back to `DIGEST_SECRET` |
| `INGEST_SECRET` | ✗ | `x-ingest-secret`. Falls back to `DIGEST_SECRET` |
| `AUTOMATION_API_KEY` | ✗ | Bearer key for `POST /api/automation/close`. Unset ⇒ the endpoint returns 503 |

**Degradation when optional variables are unset:** `sendMail()` becomes a no-op
so the app runs locally without mail; `/api/contact` returns 503; the ingest
endpoint returns 503; the automation endpoint returns 503; a cron whose secret
is missing logs a skip and exits 0.

> **`ADMIN_EMAILS` is documented in `.env.example` and in the `auth.ts` header
> comment, but nothing reads it.** The logic was considered and never
> implemented. Admin access is granted either from the admin console's
> ניהול משתמשים tab, or directly:
>
> ```sql
> UPDATE "User" SET "isAdmin" = true WHERE email = 'user@cristalino.co.il';
> ```
>
> `isAdmin` is re-read on every session access, so the change lands on the next
> request.

---

*© 2026 AK. All rights reserved.*
