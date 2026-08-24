# Gemini Project Review — Cristalino HelpDesk

> **Current version: 3.65** · Updated 2026-08-24

**Cristalino HelpDesk** is a Hebrew RTL internal IT helpdesk system for Cristalino Group LTD.
Employees submit IT tickets via a web app (Google login). IT staff manage the queue through dedicated panels.

**Live:** https://helpdesk.cristalino.co.il
**Repo:** https://github.com/cristalino-dev/HelpDesk.git
**Local path:** C:\Users\AlonKerem\Development\helpdesk

### Where the canonical detail lives

This file is an orientation brief. Three things are recorded elsewhere and are **not** duplicated here — read them there rather than trusting a summary:

| Subject | Canonical source |
|---|---|
| Schema field reference, endpoint table, authorization matrix, deployment, env vars | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Version history — what changed, when, and why | [`RELEASE_NOTES.md`](RELEASE_NOTES.md) |
| Agent working rules for this repo | [`AGENTS.md`](AGENTS.md) (`CLAUDE.md` is an alias for it) |

⚠️ **Read `AGENTS.md` first.** This is Next.js 16 with breaking changes versus most training data; the guides in `node_modules/next/dist/docs/` are authoritative over anything remembered.

---

## 1. Project Overview

### Roles

Four effective roles. Only **Admin** is a DB flag (`User.isAdmin`); the rest come from hardcoded lists in `lib/staffEmails.ts`. `isAdmin` implies staff — guards read `session.user.isAdmin || STAFF_EMAILS.includes(...)`.

| Role | Source | Entry point |
|---|---|---|
| Employee | any signed-in user | `/dashboard` |
| Viewer | `VIEWER_EMAILS` | `/tickets/view` — read-only |
| Staff | `STAFF_EMAILS` or `isAdmin` | `/tickets` |
| Admin | `User.isAdmin = true` | `/admin` |

### Key features

- **Google OAuth authentication** — login forces the account picker (`prompt=select_account`) so users with multiple Google accounts can switch. **No domain check exists in code** — `auth.ts` has no `signIn` callback; restricting to `@cristalino.co.il` is Google Workspace / OAuth-client configuration. Any admitted account is auto-provisioned as a regular user.
- **Employee portal (`/dashboard`)** — submit tickets, view own tickets, search, filter, re-open within 4 weeks, update profile
- **Staff portal (`/tickets`)** — all tickets with search, sort, stat-card filters (weekly/total toggle), inline expand/edit, paste images into notes
- **Viewer portal (`/tickets/view`)** — read-only ticket list
- **Admin portal (`/admin`)** — seven tabs: תור פניות · ניהול משתמשים · יומן שגיאות · שדות מערכת · רישוי · מדפסות · ציוד חסר
- **Ticket detail (`/tickets/<cuid>`)** — notes, messages, attachments, equipment lines, audit timeline, close button, copy-link button. Polls by revision signature so it stays live without flicker
- **Four-state lifecycle** — פתוח / בטיפול / **בהמתנה** / סגור. בהמתנה requires a `holdReason`, cleared automatically on reinstatement
- **Ticket deletion** — admins only, two-step confirm, permanent; the deletion is written to the `Log` table because the ticket's own audit trail dies with it
- **Change the submitter** — admins can move a ticket to a different registered user (`ownerEmail` on PATCH), after confirming
- **Open on behalf of** — admins can file a ticket for someone who phoned in, including a person who has never signed in
- **Full-text search** — every page; typing a ticket number (`494`, `#494`, `HDTC-494`, `hdtc494`) always lands on that ticket even when the view is filtered (`lib/ticketSearch.ts`)
- **Email automation** — new ticket, status change, staff @mention, closure + rating request, daily digest
- **Email-to-ticket ingestion** — inbound mail whose subject contains "ticket" becomes an URGENT ticket via IMAP polling (see §6)
- **Service ratings** — 1–5 stars with comment; admin review dashboard
- **Error logging** — ErrorBoundary + ClientErrorHandler + server `logError()` → `Log` table, with stale-chunk failures filtered out
- **Automation API** — `POST /api/automation/close` closes a ticket with a Bearer key; idempotent
- **Periodic urgency sweep** — cron every 5 min ensures closed tickets have `urgency = נמוך`
- **Configurable dropdowns** — category / platform / urgency / equipment / licenseCategory are DB-driven, managed in שדות מערכת
- **Image paste** — Ctrl+V images in description and note textareas become attachments
- **Dynamic staff roster** — assignment dropdown and @mention shortcuts show exactly the DB users with `isAdmin = true`; ex-admins drop out automatically. Served by `GET /api/staff`
- **Automation bot** — `bot@cristalino.co.il` is an assignable virtual user, never a mail recipient; an external script picks up its tickets by `assignedTo`
- **License inventory (רישוי)** — bulk key add, editable categories, optional masked username/password and remark per license
- **Printer inventory (מדפסות)** — make/model/supplier/IP/hostname/toner level/supplier serial, plus driver file uploads (≤ 100 MB, stored on disk)
- **New-employee onboarding (עובד חדש)** — four mandatory hire fields plus an equipment checklist
- **Leaving-employee offboarding (עובד עוזב)** — a return checklist of every gear item; **the ticket cannot be closed while any line is untouched**
- **Equipment shortage report (ציוד חסר)** — everything still owed across live tickets, aggregated into one supplier order
- **RTL & Hebrew** — full right-to-left styling across all portals, including email templates

---

## 2. Technology Stack

- **Framework:** Next.js 16.2.2 (App Router, Turbopack). ⚠️ Breaking changes vs. legacy Next.js.
- **Language:** TypeScript 5, React 19.2.4.
- **Auth:** NextAuth v5.0.0-beta.30 (Google provider only).
- **ORM:** Prisma 5.22.0 + PostgreSQL (AWS RDS).
- **Styling:** inline React styles; design tokens in `lib/theme.ts`. Only `globals.css` uses Tailwind.
- **Tests:** Jest 30 + React Testing Library 16 — **568 tests across 35 suites**, gating the build.
- **Hosting:** AWS Lightsail Linux (Ubuntu 24.04 LTS).
- **Process manager:** PM2 with auto-restart and boot persistence.
- **Deployment:** SSH + SCP via `deploy.sh`. Build runs strictly on the target server.
- **Mail:** nodemailer v7 (outbound SMTP) + imapflow / mailparser (inbound IMAP), both via helpdesk@cristalino.co.il. All three are in `next.config.ts` `serverExternalPackages`.

---

## 3. Architecture & Data Model

### Data models (Prisma) — 13 tables

Field-by-field reference with types, defaults and indexes: [`docs/ARCHITECTURE.md` §6](docs/ARCHITECTURE.md#6-database-schema-reference).

- **User** — OAuth metadata, `name`, `isAdmin`, `phone`, `station`. 1→N Ticket. ⚠️ `email` is stored exactly as Google supplied it and may carry capitals.
- **Ticket** — `ticketNumber` (autoincrement, the human `HDTC-N` id), `subject`, `description`, `phone`, `computerName`, `urgency`, `category`, `platform`, `status`, `assignedTo`, plus **`holdReason`** (required while בהמתנה) and **`sourceMessageId`** (`@unique`, the email-ingest idempotency key). FK → User. Indexed on `userId` and `status`. Relations: notes, attachments, messages, review, history, equipment.
- **TicketHistory** — audit trail: `field`, `oldValue`, `newValue`, `actorName`, `actorEmail`, `changedAt`. Written on create and on every status/urgency/assignedTo/edit change.
- **TicketMessage** — two-way user↔staff chat with email notifications. Only the author may delete their own message.
- **TicketNote** — staff-only technician notes (hidden from the user). Supports @mentions + image paste.
- **TicketAttachment** — image metadata. **Bytes live on disk** under `uploads/ticket-attachments/` since v3.48; `dataUrl` remains only for legacy rows and is still served as a fallback.
- **TicketEquipment** *(v3.58)* — `label`, `quantity`, `receivedQty`, `receivedAt`, `receivedBy`. `@@unique([ticketId, label])`. `label` is a **snapshot** of the FieldOption label at request time, so renaming an option never rewrites filed tickets. Not limited to onboarding — any ticket can carry lines.
- **TicketReview** — 1–5 star rating + optional comment. One per ticket (`ticketId @unique`).
- **License** — key, category (default "Office"), optional username/password, remark. `@@unique([category, key])`; bulk insert skips duplicates.
- **Printer** — name, maker, model, supplier, ipv4, hostname, inkToner, tonerLevel, supplierSerial.
- **PrinterDriver** — driver metadata; the binaries live on disk under `uploads/printer-drivers/`.
- **FieldOption** — configurable dropdown values. `field` ∈ `category | platform | urgency | licenseCategory | equipment`. `@@unique([field, label])`. Auto-seeded with defaults on first GET.
- **Log** — telemetry and error tracking (`level`, `message`, `source`, `stack`, `date`). 30-day auto-cleanup on write.

### Key application layers

- **UI:** all components use inline React styles. No Tailwind in page/component files.
- **Mobile:** `useIsMobile` hook (**768 px** breakpoint) used throughout. Hamburger menus on staff pages.
- **Search:** each page has a `useMemo`-derived `filtered` that chains stat-card filter → text search → sort. Ticket-number queries bypass the filter via `lib/ticketSearch.ts`.
- **User lookup:** `lib/users.ts` — `findUserByEmail()` matches **case-insensitively** (`findFirst` + `mode: "insensitive"`; `findUnique` has no `mode`), `resolveUserByEmail()` creates only when the address is genuinely new. Every entry point that takes an address from outside must go through it.
- **Email (outbound):** `lib/mail.ts` has `sendMail()` + all HTML templates. Self-notification excluded on PATCH. RTL is enforced with `dir="rtl"` + inline `direction:rtl;text-align:right` on the card div inside `wrap()` — Gmail strips html/body-level direction, so never rely on those. Status changes notify only the ticket owner + assigned staff member; non-status edits still broadcast to staff.
- **Email (inbound):** `lib/mailIngest.ts` (pure, testable) + `app/api/admin/ingest-mail/route.ts` (IMAP I/O). Polled by cron every 2 min. See §6.
- **File storage:** `lib/attachmentStorage.ts` and `lib/printerStorage.ts`. `uploads/` is git-ignored, excluded from the deploy archive, and not in deploy.sh's `rm -rf` list, so files survive deploys.
- **Stale tickets:** `lib/staleTicket.ts` `isStaleOpen()` — true for פתוח/בטיפול tickets older than **`STALE_WORKDAYS = 4`** Israeli workdays (Sun–Thu, via `lib/workdays.ts`).
- **Live detail page:** `lib/ticketRevision.ts` builds a compact signature so polling only re-renders on real change — `updatedAt` alone is not enough, because adding a message or note does not bump it.
- **Equipment:** `lib/equipment.ts` (selection, receipt clamping, shortage aggregation, supplier text), `lib/newEmployee.ts` (the four mandatory fields ↔ description block), `lib/offboarding.ts` (return checklist + close blockers).
- **Field options:** `lib/fieldOptions.ts` exports defaults + `fetchFieldOptions()`. All ticket forms call this on mount.
- **Image paste:** `lib/pasteImage.ts` exports `handleImagePaste(e, onImage)` — add to any textarea.
- **Chunk errors:** `lib/chunkError.ts` detects post-deploy stale-chunk failures and reloads once instead of logging noise.
- **API:** NextAuth JWTs + the `isAdmin` boolean guard all privileged routes. Client-side page guards are convenience only; every one is backed server-side.

### Critical business rules

1. **Compound close** — setting status → "סגור" always also sets urgency → "נמוך". Enforced server-side in `PATCH /api/tickets`, re-applied by the automation endpoint, and swept every 5 min. Client uses `closeTicket()` from `lib/ticketApi.ts`.
2. **Hold requires a reason** — status → "בהמתנה" needs `holdReason`; leaving that status clears it automatically. History records it as `בהמתנה: <reason>`.
3. **Offboarding tickets cannot be closed with unticked lines** — `PATCH /api/tickets` returns 400 with `{ blockers }`. This is the whole point of the עובד עוזב category.
4. **Onboarding tickets require four fields** — first name, last name, phone, job title; a blank one is a 400 at POST. They are folded into the description, not stored as columns.
5. **Auto-בטיפול** — when staff assigns a ticket to themselves and it is currently פתוח, status automatically becomes בטיפול.
6. **History must be awaited** — `prisma.ticketHistory.createMany()` is awaited before the API response returns, so client re-fetches always see the updated timeline. Never `void`.
7. **User deletion** — `DELETE /api/users` upserts `helpdesk@cristalino.co.il` as fallback, bulk-reassigns all tickets, then deletes. Self-deletion blocked; demoting the last remaining admin is blocked.
8. **Ticket deletion is admin-only and permanent** — no soft-delete flag. Child rows cascade, attachment bytes are unlinked first, and the act is logged to `Log`.
9. **Equipment receiving is staff-only** — anyone may ask for a screen; only the technician who handed it over may say it arrived, because the shortage report is the purchase order.
10. **Email addresses are matched case-insensitively** — always via `lib/users.ts`. A bare `findUnique` on a lowercased address misses rows and turns an `upsert` into a duplicate account.
11. **Staff roster is DB-driven** — assignment dropdown + @mention shortcuts show only current `isAdmin` users. `lib/staffMembers.ts` `getAllStaffMembers()` queries admins; `STAFF_MEMBERS` only supplies curated handles/names for matching emails (and is the empty-DB fallback). Clients fetch `GET /api/staff`.
12. **FieldOption deletions are guarded** — the four urgencies and the עובד חדש / עובד עוזב categories cannot be removed; business logic depends on them.

---

## 4. Important Rules & Conventions

1. **Server-side build only** — Turbopack embeds absolute paths. NEVER build locally and copy `.next`.
2. **Inline styles only** — no Tailwind component classes. Only `globals.css` uses Tailwind resets. Colors come from `lib/theme.ts`.
3. **Version in `lib/version.ts` only** — format `"X.YY"`. Renders via `FooterCopyright`.
4. **Build pipeline** — `prisma generate && jest --ci && next build`. Tests gate the deploy.
5. **Rules of Hooks** — all hooks before any conditional `return null`.
6. **Stat-card filters** — toggle behavior: click sets, second click clears. Search operates inside the filtered subset when active.
7. **`STAFF_EMAILS`** — `alon@cristalino.co.il` is system admin, listed first.
8. **`params` must be `Promise<{...}>` in Next.js 16** — always `await params` in dynamic route handlers.
9. **All `fetch().json()` calls must check `r.ok` first** — never call `.json()` without checking.
10. **No `void` on DB writes that must be visible before re-fetch** — use `await`.
11. **`ADMIN_EMAILS` is dead** — it appears in `.env.example` and an `auth.ts` comment, but nothing reads it. Grant admin from ניהול משתמשים or with SQL.
12. **Hebrew UI strings are the interface** — status, urgency and category values are Hebrew literals compared by value in business logic. Do not "tidy" them.

### Deployment steps

1. `deploy.sh` runs locally: packages source, uploads via SCP, triggers the remote build.
2. Remote: `npm install` → `prisma migrate deploy` → `prisma generate` → `jest --ci` → `next build` into `.next-staging` while the old build keeps serving.
3. PM2 stops, the two build dirs are swapped, PM2 starts — downtime is the swap window.
4. Three cron entries are (re)installed: digest 09:00, sweep `*/5`, ingest `*/2` (flock-guarded).
5. SSL termination via Nginx + Certbot (`ssl-init.sh`).

---

## 5. Version History

Not duplicated here. [`RELEASE_NOTES.md`](RELEASE_NOTES.md) is the version record, newest first, with the reasoning behind each change. Versions before 3.56 are in the table in `HANDOFF.md` (gitignored, local-only) and in `git log --oneline`.

The three most recent:

| Version | Summary |
|---|---|
| 3.65 | One account per person — all three email lookups (on-behalf-of, mail ingest, user deletion) now resolve through `lib/users.ts` and ignore case |
| 3.64 | Polish of the מגיש change — case-insensitive owner lookup, roster fetched on first edit rather than every view, cancel restores the whole form |
| 3.63 | Admins can change a ticket's submitter, after confirming |

---

## 6. Email-to-Ticket Ingestion — Operational Spec

**Goal.** Anyone can email the helpdesk mailbox (`helpdesk@cristalino.co.il`); if the **subject contains the word "ticket"**, the system opens a new URGENT ticket automatically.

The trigger condition and the full field mapping table are in [`docs/ARCHITECTURE.md` §10](docs/ARCHITECTURE.md#10-background-jobs). What follows is the operational detail an agent needs to run, debug, or query it.

### Architecture

- **`lib/mailIngest.ts`** — pure, unit-tested logic (no I/O): `hasTicketKeyword(subject, keyword)`, `stripTicketKeyword(subject, keyword)`, `buildIngestedTicket(parsedMail, keyword)`, `fixCharsetLabels(source)`, plus `INGEST_DEFAULTS` / `DEFAULT_TICKET_KEYWORD` / `INGEST_FALLBACK_EMAIL`.
- **`app/api/admin/ingest-mail/route.ts`** — `POST` only. Validates `x-ingest-secret`, connects via `imapflow` to `${IMAP_HOST}:993` (TLS), searches `{ seen: false, subject: keyword }` (server-side subject filter — avoids scanning the whole mailbox), runs the raw source through `fixCharsetLabels` (relabels Hebrew `iso-8859-8-i/-e` → `windows-1255` so `mailparser` decodes correctly), parses with `simpleParser`, dedupes by `Ticket.sourceMessageId` (unique), resolves the sender via `resolveUserByEmail`, persists, and marks `\Seen`. Returns `{ ok, created, tickets: number[] }`.
- **Cron:** `run-ingest.sh` (written by `deploy.sh`) curls the endpoint `*/2 * * * *`, logging to `logs/ingest.log`. **`flock`-guarded** so a slow scan cannot overlap the next tick.
- **Bundling:** `imapflow` and `mailparser` are in `next.config.ts` `serverExternalPackages` (Node-only, like `nodemailer`).

### Configuration (reuses existing secrets — nothing new is mandatory)

| Var | Purpose | Default |
|---|---|---|
| `SMTP_USER` / `SMTP_PASS` | IMAP auth (the existing Google **app password** works for IMAP) | — (already set) |
| `IMAP_HOST` | IMAP server | `imap.gmail.com` |
| `TICKET_MAIL_KEYWORD` | subject keyword | `ticket` |
| `INGEST_SECRET` | cron-endpoint secret (`x-ingest-secret`) | falls back to `DIGEST_SECRET` |

**Prerequisite:** IMAP must be **enabled** for `helpdesk@cristalino.co.il` in Gmail/Workspace settings (Settings → Forwarding and POP/IMAP → Enable IMAP).

### Endpoint responses

`200 { ok, created, tickets[] }` · `401` bad/missing secret · `503` mailbox not configured (`SMTP_USER`/`SMTP_PASS` missing) · `500` server error (logged via `logError`).

### Behaviour notes

- Non-matching emails are **left untouched and unread**. Already-`\Seen` messages are ignored.
- On success the route also writes a `created` `TicketHistory` row and emails both staff (`mailTicketOpenedStaff`) and the sender (`mailTicketOpenedUser`).
- Idempotency is structural, not best-effort: `sourceMessageId` is `@unique`, so a retried or overlapping run cannot double-file.

### Querying ingested tickets

Ingested tickets look like any other ticket. The reporter is the email sender; the description holds the email body. There is no special flag — they are `urgency='דחוף'` tickets whose `User` may be an external (non-OAuth) address. To isolate them, filter on `"sourceMessageId" IS NOT NULL`.

---

*Production build v3.65 — updated 2026-08-24.*
