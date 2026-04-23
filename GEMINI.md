# Gemini Project Review — Cristalino HelpDesk

## 1. Project Overview

**Cristalino HelpDesk** is a Hebrew RTL internal IT helpdesk system for Cristalino Group LTD.  
Employees submit IT tickets via web app (Google login). IT staff manage the queue through dedicated panels.

**Current version:** 3.06  
**Live:** https://helpdesk.cristalino.co.il  
**Tests:** 133 passing (13 suites)

**Key Features:**
- **Google OAuth Authentication** — strictly for `@cristalino.co.il` accounts
- **Employee Portal (`/dashboard`)** — submit tickets, view own tickets, search all fields, filter by status, re-open within 4 weeks, update profile
- **Staff Portal (`/tickets`)** — all tickets with search, sort, stat-card filters, inline expand/edit
- **Viewer Portal (`/tickets/view`)** — read-only ticket list with search
- **Admin Portal (`/admin`, `/admin/logs`, `/admin/reviews`)** — queue management, user management, error log viewer, service review dashboard
- **Full-text search** — every page has a search bar querying all ticket fields
- **Clickable stat-card filters** — toggle-filter summary cards on dashboard, /tickets, /admin
- **Mobile-first** — hamburger menu (☰) on all staff pages; responsive layouts throughout
- **Email automation** — new ticket, status change, staff update, @mention, closure + rating request, daily digest
- **Service ratings** — 1–5 stars with comment; admin review dashboard
- **Error logging** — ErrorBoundary + ClientErrorHandler + server logError() → DB Log table
- **RTL & Hebrew** — full Right-to-Left styling natively applied across all portals

## 2. Technology Stack

- **Framework:** Next.js 16.2.2 (App Router, Turbopack). ⚠️ Breaking changes vs. legacy Next.js.
- **Auth:** NextAuth v5.0.0-beta.30 (Google Provider only).
- **ORM:** Prisma 5.22.0 + PostgreSQL (AWS RDS).
- **Hosting:** AWS Lightsail Linux (Ubuntu 24.04 LTS).
- **Process Manager:** PM2 with auto-restart and boot persistence.
- **Deployment:** SSH + SCP via `deploy.sh`. Build runs strictly on target server.
- **Mail:** nodemailer v7, SMTP via helpdesk@cristalino.co.il.

## 3. Architecture & Data Model

### Data Models (Prisma)

- **User:** OAuth metadata, name, `isAdmin`, `phone`, `station`. 1-to-Many → Ticket.
- **Ticket:** `ticketNumber` (autoincrement, human-readable ID), `subject`, `description`, `phone`, `computerName`, `urgency`, `category`, `platform`, `status`, `assignedTo`. Related: notes, attachments, messages, review.
- **TicketNote:** Staff-only technician notes (hidden from user). Supports @mentions + image paste.
- **TicketMessage:** Two-way user↔staff chat with email notifications.
- **TicketAttachment:** Image attachments stored as dataUrl with filename.
- **TicketReview:** 1–5 star service rating + optional comment. One per ticket, user-updatable.
- **Log:** Telemetry and error tracking (`level`, `message`, `source`, `stack`, `date`). 30-day auto-cleanup.

### Key Application Layers

- **UI:** All components use inline React styles. No Tailwind in page/component files.
- **Mobile:** `useIsMobile` hook (640px breakpoint) used throughout. Hamburger menus on staff pages.
- **Search:** Each page has a `useMemo`-derived `displayTickets`/`filtered` that chains status filter → text search → sort.
- **Email:** `lib/mail.ts` has `sendMail()` + all HTML templates. Self-notification excluded on PATCH (actor filtered from recipients).
- **Stale tickets:** `lib/staleTicket.ts` `isStaleOpen()` returns true for פתוח/בטיפול tickets older than 5 days.
- **API:** NextAuth JWTs + `isAdmin` boolean guard all privileged routes.

## 4. Important Rules & Conventions

1. **Server-Side Build Only** — Turbopack embeds absolute paths. NEVER build locally and copy `.next`.
2. **Inline Styles Only** — No Tailwind component classes. Only `globals.css` uses Tailwind resets.
3. **Version in `lib/version.ts` only** — format `"X.YY"` (major.2digit-minor). Renders via `FooterCopyright`.
4. **Build pipeline** — `prisma generate && jest --ci && next build`. Tests gate the deploy.
5. **Rules of Hooks** — All hooks (useMemo, useEffect, etc.) before any conditional `return null`.
6. **Stat-card filters** — toggle behavior: click sets filter, second click clears it. When active, search operates inside the filtered subset.
7. **STAFF_EMAILS** — `alon@cristalino.co.il` is system admin and is listed first.

### Deployment Steps

1. `deploy.sh` runs locally: packages source, uploads via SCP, triggers remote build.
2. Remote: `npm install` → `prisma migrate deploy` → `prisma generate` → `jest --ci` → `next build`.
3. PM2 (`ecosystem.config.js`) restarts app on port 3000.
4. SSL termination via Nginx + Certbot (`ssl-init.sh`).

---

*Production Build v3.06 — Full-text search, mobile-first, clickable stat filters (Ubuntu/PM2). Updated 2026-04-23.*
