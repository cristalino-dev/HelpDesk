# Gemini Project Review — Cristalino HelpDesk

## 1. Project Overview

**Cristalino HelpDesk** is a Hebrew RTL internal IT helpdesk system for Cristalino Group LTD.  
Employees submit IT tickets via web app (Google login). IT staff manage the queue through dedicated panels.

**Current version:** 3.29  
**Live:** https://helpdesk.cristalino.co.il  
**Repo:** https://github.com/cristalino-dev/HelpDesk.git  
**Local path:** C:\Users\AlonKerem\Development\helpdesk

**Key Features:**
- **Google OAuth Authentication** — strictly for `@cristalino.co.il` accounts; login forces account picker (`prompt=select_account`) so users with multiple Google accounts can switch
- **Employee Portal (`/dashboard`)** — submit tickets, view own tickets, search, filter, re-open within 4 weeks, update profile
- **Staff Portal (`/tickets`)** — all tickets with search, sort, stat-card filters (weekly/total toggle), inline expand/edit, paste images into notes
- **Viewer Portal (`/tickets/view`)** — read-only ticket list
- **Admin Portal (`/admin`)** — ticket queue, user management (add/edit/delete), error logs, service review dashboard, **"שדות מערכת" tab** to manage dropdown options
- **Ticket Detail (`/tickets/HDTC-N`)** — full ticket page with notes, messages, attachments, audit timeline, admin close button, copy-link button
- **Full-text search** — every page has a search bar across all ticket fields
- **Email automation** — new ticket, status change, staff @mention, closure + rating request, daily digest
- **Service ratings** — 1–5 stars with comment; admin review dashboard
- **Error logging** — ErrorBoundary + ClientErrorHandler + server `logError()` → DB Log table
- **RTL & Hebrew** — full Right-to-Left styling across all portals
- **Automation API** — `POST /api/automation/close` — external scripts close tickets with Bearer key
- **Weekly Stats View** — `/tickets` defaults to last 7 days; toggle to all-time
- **Periodic Urgency Sweep** — cron every 5 min ensures closed tickets have urgency=נמוך
- **Configurable Dropdowns** — category/platform/urgency values managed from admin panel (DB-driven)
- **Image Paste** — Ctrl+V images in description and notes textareas become attachments
- **Dynamic Staff Roster** — the assignment dropdown and @mention shortcuts show exactly the DB users with `isAdmin = true` (ex-admins drop out automatically). Served by `GET /api/staff`; consumed by `/admin`, `/tickets`, `/tickets/[id]`

## 2. Technology Stack

- **Framework:** Next.js 16.2.2 (App Router, Turbopack). ⚠️ Breaking changes vs. legacy Next.js.
- **Auth:** NextAuth v5.0.0-beta.30 (Google Provider only).
- **ORM:** Prisma 5.22.0 + PostgreSQL (AWS RDS Lightsail).
- **Hosting:** AWS Lightsail Linux (Ubuntu 24.04 LTS).
- **Process Manager:** PM2 with auto-restart and boot persistence.
- **Deployment:** SSH + SCP via `deploy.sh`. Build runs strictly on target server.
- **Mail:** nodemailer v7, SMTP via helpdesk@cristalino.co.il.

## 3. Architecture & Data Model

### Data Models (Prisma)

- **User:** OAuth metadata, name, `isAdmin`, `phone`, `station`. 1-to-Many → Ticket.
- **Ticket:** `ticketNumber` (autoincrement, human-readable ID), `subject`, `description`, `phone`, `computerName`, `urgency`, `category`, `platform`, `status`, `assignedTo`. FK → User. Related: notes, attachments, messages, review, history.
- **TicketHistory:** Audit trail — field, oldValue, newValue, actorName, actorEmail, changedAt. Written on every status/urgency/assignedTo/edit change.
- **TicketNote:** Staff-only technician notes (hidden from user). Supports @mentions + image paste.
- **TicketMessage:** Two-way user↔staff chat with email notifications.
- **TicketAttachment:** Image attachments stored as dataUrl with filename.
- **TicketReview:** 1–5 star service rating + optional comment. One per ticket.
- **FieldOption:** Configurable dropdown values. Fields: id, field (`"category"|"platform"|"urgency"`), label, order. Unique constraint on (field, label). Auto-seeded with defaults on first GET.
- **Log:** Telemetry and error tracking (`level`, `message`, `source`, `stack`, `date`). 30-day auto-cleanup.

### Key Application Layers

- **UI:** All components use inline React styles. No Tailwind in page/component files.
- **Mobile:** `useIsMobile` hook (640px breakpoint) used throughout. Hamburger menus on staff pages.
- **Search:** Each page has a `useMemo`-derived `filtered` that chains stat-card filter → text search → sort.
- **Email:** `lib/mail.ts` has `sendMail()` + all HTML templates. Self-notification excluded on PATCH. RTL is enforced with `dir="rtl"` + inline `direction:rtl;text-align:right` on the card div inside `wrap()` — Gmail strips html/body-level direction, so never rely on those.
- **Stale tickets:** `lib/staleTicket.ts` `isStaleOpen()` returns true for פתוח/בטיפול tickets older than 5 days.
- **API:** NextAuth JWTs + `isAdmin` boolean guard all privileged routes.
- **Field options:** `lib/fieldOptions.ts` exports defaults + `fetchFieldOptions()`. All ticket forms call this on mount.
- **Image paste:** `lib/pasteImage.ts` exports `handleImagePaste(e, onImage)` — add to any textarea.

### Critical Business Rules

1. **Compound close** — setting status → "סגור" always also sets urgency → "נמוך". Enforced server-side in `PATCH /api/tickets`. Client uses `closeTicket()` from `lib/ticketApi.ts`.
2. **Auto-בטיפול** — when staff assigns a ticket to themselves (`assignedTo = session.user.email`) and ticket is currently פתוח, status automatically becomes בטיפול.
3. **History must be awaited** — `prisma.ticketHistory.createMany()` is awaited before the API response returns, so client re-fetches always see the updated timeline.
4. **User deletion** — `DELETE /api/users` upserts `helpdesk@cristalino.co.il` as fallback, bulk-reassigns all tickets, then deletes. Self-deletion blocked.
5. **Admin close button** — calls `updateTicket({assignedTo: me})` then `apiCloseTicket()`. Two separate calls, not merged.
6. **History writes gated** — only `await`, never `void`, for `ticketHistory.createMany()`.
7. **Staff roster is DB-driven** — assignment dropdown + @mention shortcuts show only current `isAdmin` users. `lib/staffMembers.ts` `getAllStaffMembers()` queries admins; `STAFF_MEMBERS` only supplies curated handles/names for matching emails (and is the empty-DB fallback). Clients fetch `GET /api/staff`. Admin implies staff: guards are `isAdmin || STAFF_EMAILS.includes(...)`.

## 4. Important Rules & Conventions

1. **Server-Side Build Only** — Turbopack embeds absolute paths. NEVER build locally and copy `.next`.
2. **Inline Styles Only** — No Tailwind component classes. Only `globals.css` uses Tailwind resets.
3. **Version in `lib/version.ts` only** — format `"X.YY"`. Renders via `FooterCopyright`.
4. **Build pipeline** — `prisma generate && jest --ci && next build`. Tests gate the deploy.
5. **Rules of Hooks** — All hooks before any conditional `return null`.
6. **Stat-card filters** — toggle behavior: click sets, second click clears. Search operates inside filtered subset when active.
7. **STAFF_EMAILS** — `alon@cristalino.co.il` is system admin, listed first.
8. **params must be `Promise<{...}>` in Next.js 16** — always `await params` in dynamic route handlers.
9. **All fetch().json() calls must check r.ok first** — never call `.json()` without checking `r.ok`.
10. **No `void` on DB writes that must be visible before re-fetch** — use `await`.

### Deployment Steps

1. `deploy.sh` runs locally: packages source, uploads via SCP, triggers remote build.
2. Remote: `npm install` → `prisma migrate deploy` → `prisma generate` → `jest --ci` → `next build`.
3. PM2 (`ecosystem.config.js`) restarts app on port 3000.
4. SSL termination via Nginx + Certbot (`ssl-init.sh`).

## 5. Version History (recent)

| Version | Notes |
|---------|-------|
| 3.14    | POST /api/automation/close — machine-to-machine ticket closure |
| 3.15    | Force Google account picker on login |
| 3.16    | Urgency sweep on close + /open onboarding redirect |
| 3.17    | Periodic closed-ticket urgency sweep (every 5 min) |
| 3.18    | Delete user in admin panel with two-step confirm |
| 3.19    | Deleting a user reassigns their tickets to helpdesk@ |
| 3.20    | Admin one-click "סגור פנייה" button on ticket detail |
| 3.21    | Close button assigns to self + 🔗 copy-link button |
| 3.22    | Rename button to "✓ סגור פנייה" |
| 3.23    | Auto-set בטיפול when self-assigning from פתוח |
| 3.24    | Fix race condition: await history createMany |
| 3.25    | Admin "שדות מערכת" tab — DB-driven dropdown options (FieldOption) |
| 3.26    | Paste images into textareas (Ctrl+V) |
| 3.27    | DB admins auto-included in assignment dropdown + @mention shortcuts (GET /api/staff); admins gain /tickets access |
| 3.28    | Staff roster purely DB-driven (isAdmin only, ex-admins drop out); /admin page wired to /api/staff; generic mention placeholders |
| 3.29    | All emails render RTL/right-aligned (inline dir + direction on card div — Gmail strips html/body-level RTL) |

---

*Production Build v3.29 — Updated 2026-06-11.*
