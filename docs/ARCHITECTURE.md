# Cristalino HelpDesk — Architecture Document

> Version 1.09 · Last updated 2026-04-14 · v2.9 Release

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture Diagram](#3-high-level-architecture-diagram)
4. [Request Flow Diagrams](#4-request-flow-diagrams)
   - 4.1 Authentication Flow
   - 4.2 Employee Submitting a Ticket
   - 4.3 Admin Changing Ticket Status
   - 4.4 Client Error Logging Flow
   - 4.5 Contact Form Email Flow
5. [Application Layer Map](#5-application-layer-map)
6. [Database Schema — Full Field Reference](#6-database-schema--full-field-reference)
   - 6.1 User Table
   - 6.2 Ticket Table
   - 6.3 Log Table
   - 6.4 Entity Relationship Diagram
7. [API Routes Reference](#7-api-routes-reference)
8. [Authorization Matrix](#8-authorization-matrix)
9. [Error Logging Architecture](#9-error-logging-architecture)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Environment Variables Reference](#11-environment-variables-reference)

---

## 1. System Overview

Cristalino HelpDesk is an internal web application for Cristalino Group LTD employees to submit IT support requests and for the IT department to manage them. The system has two user roles:

| Role | Entry Point | Capabilities |
|------|-------------|--------------|
| **Employee** | `/dashboard` | Open tickets, view own tickets, edit profile |
| **Admin (IT Staff)** | `/admin`, `/admin/logs` | View all tickets, update status, manage users, view dedicated error logs |

Authentication is Google OAuth only — employees use their corporate `@cristalino` Google account. There are no passwords stored in the system.

---

## 2. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.2.2 | App Router, Turbopack dev server |
| Language | TypeScript | 5.x | Strict mode |
| UI | React | 19.x | Client components where interaction needed |
| Styling | Inline React styles | — | No Tailwind in components (Turbopack path issue) |
| Auth | NextAuth | v5.0.0-beta.30 | Google OAuth, JWT sessions |
| ORM | Prisma | 5.x | Type-safe DB client |
| Database | PostgreSQL | 18 | AWS RDS (managed) |
| Email | nodemailer | 7.x | Google Workspace SMTP |
| Testing | Jest + RTL | 30 + 16 | 40+ unit tests, gate the build |
| Hosting | Ubuntu Server | — | PM2 process manager |
| Deploy | SSH + SCP | — | deploy.sh — build runs on server |

---

## 3. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EMPLOYEE'S BROWSER                           │
│                                                                     │
│   ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌─────────┐           │
│   │  /login  │  │/dashboard │  │ /admin  │  │/profile │  /contact  │
│   └────┬─────┘  └─────┬─────┘  └────┬────┘  └────┬────┘     │     │
│        │              │              │              │           │    │
└────────┼──────────────┼──────────────┼──────────────┼───────────┼───┘
         │              │              │              │           │
         │  HTTPS       │              │              │           │
         ▼              ▼              ▼              ▼           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   AWS LIGHTSAIL — WINDOWS SERVER 2022               │
│                   Next.js 16 running on port 3000                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     NEXT.JS APP ROUTER                        │  │
│  │                                                               │  │
│  │  Server Components    │    Client Components                  │  │
│  │  ─────────────────    │    ─────────────────                  │  │
│  │  app/page.tsx         │    app/dashboard/page.tsx             │  │
│  │  app/layout.tsx       │    app/admin/page.tsx                 │  │
│  │                       │    app/login/page.tsx                 │  │
│  │                       │    app/profile/page.tsx               │  │
│  │                       │    app/contact/page.tsx               │  │
│  │                       │    app/help/page.tsx                  │  │
│  │                       │    components/TicketForm.tsx           │  │
│  │                       │    components/TicketTable.tsx          │  │
│  │                       │    components/ErrorBoundary.tsx        │  │
│  │                       │    components/ClientErrorHandler.tsx   │  │
│  │                       │    components/FooterCopyright.tsx      │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                       API ROUTES                               │  │
│  │  /api/auth/[...nextauth]  — OAuth callbacks (NextAuth)        │  │
│  │  /api/tickets             — Ticket CRUD                        │  │
│  │  /api/profile             — User profile read/write            │  │
│  │  /api/users               — Admin: user management             │  │
│  │  /api/admin/logs        — Admin: dedicated log fetch/clear   │  │
│  │  /api/logs              — Public: write log entry (telemetry)│  │
│  │  /api/contact           — Send email via SMTP                │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                     PRISMA ORM (lib/db.ts)                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │  TCP 5432
                               ▼
             ┌─────────────────────────────────────┐
             │  AWS LIGHTSAIL RDS                   │
             │  PostgreSQL 18                       │
             │                                     │
             │  Tables: User, Ticket, Log           │
             └─────────────────────────────────────┘

                   ┌─────────────────────────┐
                   │  GOOGLE OAUTH SERVERS    │
                   │  accounts.google.com    │
                   │                         │
                   │  OAuth 2.0 + OpenID     │
                   └─────────────────────────┘

                   ┌─────────────────────────┐
                   │  SMTP MAIL SERVER        │
                   │  (configured via env)   │
                   │                         │
                   │  → dev@cristalino.co.il │
                   └─────────────────────────┘
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
   │  Click "Google Sign-In"  │                          │                    │
   │─────────────────────────>│                          │                    │
   │                          │  signIn("google")        │                    │
   │  redirect to Google      │─────────────────────────>│                    │
   │<─────────────────────────│                          │                    │
   │                          │                          │                    │
   │  User picks account      │                          │                    │
   │─────────────────────────────────────────────────────>                    │
   │                          │                          │                    │
   │  Google sends auth code  │                          │                    │
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
   │                          │                          │  User row created  │
   │                          │  isAdmin, id ────────────│───────────────────<│
   │                          │                          │                    │
   │                          │  sign JWT cookie         │                    │
   │                          │  (contains isAdmin, id)  │                    │
   │  redirect /dashboard     │                          │                    │
   │<─────────────────────────│                          │                    │
   │                          │                          │                    │
```

### 4.2 Employee Submitting a Ticket

```
Browser (Dashboard)         Next.js /api/tickets         PostgreSQL
       │                           │                          │
       │  Click "+ פנייה חדשה"      │                          │
       │  (TicketForm appears)      │                          │
       │                           │                          │
       │  Fill form fields          │                          │
       │  Click "שלח פנייה"         │                          │
       │                           │                          │
       │  POST /api/tickets         │                          │
       │  { subject, description,   │                          │
       │    phone, computerName,    │                          │
       │    urgency, category }     │                          │
       │──────────────────────────>│                          │
       │                           │  auth() → read JWT       │
       │                           │  findUnique(email) ─────>│
       │                           │  <── user.id ────────────│
       │                           │  ticket.create(          │
       │                           │    ...fields,            │
       │                           │    userId: user.id       │
       │                           │  ) ─────────────────────>│
       │                           │  <── Ticket row ─────────│
       │  200 { ticket }           │                          │
       │<──────────────────────────│                          │
       │                           │                          │
       │  onSuccess() called        │                          │
       │  Form hides               │                          │
       │  GET /api/tickets ────────>│                          │
       │                           │  findMany(userId) ──────>│
       │                           │  <── [tickets] ──────────│
       │  200 [tickets]            │                          │
       │<──────────────────────────│                          │
       │  Ticket list updates      │                          │
       │                           │                          │
```

### 4.3 Admin Changing Ticket Status

```
Browser (Admin)             Next.js /api/tickets         PostgreSQL
       │                           │                          │
       │  Expand ticket card        │                          │
       │  Click "בטיפול" button     │                          │
       │                           │                          │
       │  PATCH /api/tickets        │                          │
       │  { id, status: "בטיפול" }  │                          │
       │──────────────────────────>│                          │
       │                           │  auth() → isAdmin check  │
       │                           │  [403 if not admin]      │
       │                           │  ticket.update(          │
       │                           │    { id },               │
       │                           │    { status }            │
       │                           │  ) ─────────────────────>│
       │                           │  updatedAt auto-bumped   │
       │                           │  <── updated Ticket ─────│
       │  200 { ticket }           │                          │
       │<──────────────────────────│                          │
       │  loadTickets() re-runs    │                          │
       │  Card disappears from     │                          │
       │  queue (status = סגור)    │                          │
       │                           │                          │
```

### 4.4 Client Error Logging Flow

```
Browser                    ErrorBoundary /           Next.js          PostgreSQL
(Any Page)                 ClientErrorHandler        /api/logs
    │                            │                       │                 │
    │  React render error        │                       │                 │
    │  OR unhandled exception    │                       │                 │
    │  OR promise rejection      │                       │                 │
    │───────────────────────────>│                       │                 │
    │                            │                       │                 │
    │  [ErrorBoundary]           │                       │                 │
    │  componentDidCatch runs    │                       │                 │
    │  Shows fallback UI         │                       │                 │
    │                            │                       │                 │
    │  [ClientErrorHandler]      │                       │                 │
    │  window "error" /          │                       │                 │
    │  "unhandledrejection"      │                       │                 │
    │                            │  POST /api/logs       │                 │
    │                            │  { level, message,    │                 │
    │                            │    source, stack }    │                 │
    │                            │──────────────────────>│                 │
    │                            │                       │  log.create()──>│
    │                            │                       │  log.deleteMany │
    │                            │                       │  (> 30 days) ──>│
    │                            │                       │  200 { ok:true }│
    │                            │                       │<────────────────│
    │  Admin visits logs tab     │                       │                 │
    │  GET /api/logs?date=today  │                       │                 │
    │───────────────────────────────────────────────────>│                 │
    │                            │                       │  log.findMany() │
    │                            │                       │  (where date)──>│
    │                            │                       │<────────────────│
    │  Logs shown in textarea    │                       │                 │
    │<───────────────────────────────────────────────────│                 │
```

### 4.5 Contact Form Email Flow

```
Browser (/contact)          Next.js /api/contact        SMTP Server
       │                           │                          │
       │  Type message              │                          │
       │  Click "שלח הודעה"         │                          │
       │                           │                          │
       │  POST /api/contact         │                          │
       │  { message }               │                          │
       │──────────────────────────>│                          │
       │                           │  auth() → get session    │
       │                           │  [401 if not logged in]  │
       │                           │  [400 if empty message]  │
       │                           │                          │
       │                           │  read SMTP_* env vars    │
       │                           │  [503 if not configured] │
       │                           │                          │
       │                           │  createTransport(config) │
       │                           │  sendMail({              │
       │                           │    to: dev@cristalino    │
       │                           │    subject: "HelpDesk    │
       │                           │             Issues"      │
       │                           │    replyTo: sender       │
       │                           │    body: message         │
       │                           │  }) ─────────────────────>
       │                           │  (delivered to inbox)    │
       │                           │<─────────────────────────│
       │  200 { ok: true }         │                          │
       │<──────────────────────────│                          │
       │  Success banner shown     │                          │
       │  Textarea cleared         │                          │
       │                           │                          │
```

---

## 5. Application Layer Map

```
app/
│
├── layout.tsx              SERVER — HTML shell, lang/dir, Providers mount
├── page.tsx                SERVER — Root redirect (/ → /login or /admin or /dashboard)
├── globals.css             CSS    — Base resets (input, label, button, textarea)
├── providers.tsx           CLIENT — SessionProvider + ErrorBoundary + ClientErrorHandler
│
├── login/page.tsx          CLIENT — Google sign-in UI
├── dashboard/page.tsx      CLIENT — Employee ticket list + new ticket form
├── admin/page.tsx          CLIENT — Admin: ticket queue | users | logs
├── profile/page.tsx        CLIENT — Account settings (name, phone, station)
├── contact/page.tsx        CLIENT — Contact dev team form
├── help/page.tsx           SERVER — Hebrew user manual (static content, no auth needed)
│
└── api/
    ├── auth/[...nextauth]/route.ts  — NextAuth OAuth handlers (GET + POST)
    ├── tickets/route.ts             — GET (own/all) | POST (create) | PATCH (status)
    ├── profile/route.ts             — GET (own profile) | PATCH (update)
    ├── users/route.ts               — GET (all users) | PATCH (any user) [admin]
    ├── logs/route.ts                — GET (by date) [admin] | POST (write entry)
    └── contact/route.ts             — POST (send email via SMTP)

components/
├── TicketForm.tsx          CLIENT — New ticket form with pre-fill and tooltip
├── TicketTable.tsx         CLIENT — User ticket card list (display-only)
├── ErrorBoundary.tsx       CLIENT — React render error catch + fallback UI
├── ClientErrorHandler.tsx  CLIENT — window.onerror + unhandledrejection listener
└── FooterCopyright.tsx     CLIENT — Shared version footer + LinkedIn easter egg

lib/
├── db.ts          — Prisma singleton (prevents connection pool exhaustion in dev)
├── version.ts     — APP_VERSION constant (single source of truth)
└── logError.ts    — Server-side logError() helper (used by all API routes)

types/
├── next-auth.d.ts — Augments NextAuth Session with isAdmin + id
└── ticket.ts      — Ticket and TicketWithUser interfaces

prisma/
├── schema.prisma  — Database models: User, Ticket, Log
└── migrations/    — SQL migration history
```

---

## 6. Database Schema — Full Field Reference

### 6.1 User Table

The `User` table represents every person who has ever signed in to the system. Rows are created automatically on first Google OAuth login by the `session` callback in `auth.ts`.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              TABLE: User                                     │
├──────────────┬───────────────┬──────────┬──────────────────────────────────┤
│ Column       │ Type          │ Required │ Description                      │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ id           │ String (CUID) │ ✓        │ Primary key. Auto-generated by   │
│              │               │          │ Prisma using @default(cuid()).   │
│              │               │          │ CUIDs are sortable, URL-safe,    │
│              │               │          │ and unique across tables.        │
│              │               │          │ Example: "clh3k2x4f0001..."      │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ email        │ String        │ ✓        │ Google OAuth email address.      │
│              │               │          │ @unique constraint — one row     │
│              │               │          │ per email address.               │
│              │               │          │ Used as the lookup key in auth   │
│              │               │          │ and API routes.                  │
│              │               │          │ Example: "alon@cristalino.co.il" │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ name         │ String?       │ ✗        │ Display name. Set from Google    │
│              │               │          │ profile on first login, then     │
│              │               │          │ editable via /profile page.      │
│              │               │          │ Null for users who never signed  │
│              │               │          │ in with a Google account that    │
│              │               │          │ has a display name set.          │
│              │               │          │ Example: "Alon Kerem"            │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ image        │ String?       │ ✗        │ URL of the user's Google profile │
│              │               │          │ photo. Set on first login, never │
│              │               │          │ updated after. Not displayed in  │
│              │               │          │ the current UI (avatars use      │
│              │               │          │ initials instead).               │
│              │               │          │ Example: "https://lh3.google..." │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ isAdmin      │ Boolean       │ ✓        │ Whether this user can access     │
│              │               │          │ /admin and admin-only API        │
│              │               │          │ endpoints. Defaults to false.    │
│              │               │          │ Changed via admin user table or  │
│              │               │          │ direct SQL.                      │
│              │               │          │ Takes effect on next login.      │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ phone        │ String?       │ ✗        │ Employee's contact phone number. │
│              │               │          │ Set via /profile page.           │
│              │               │          │ Pre-fills TicketForm.phone.      │
│              │               │          │ Null until the user saves it.    │
│              │               │          │ Example: "050-1234567"           │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ station      │ String?       │ ✗        │ Workstation hostname or ID.      │
│              │               │          │ Set via /profile page.           │
│              │               │          │ Pre-fills TicketForm.computer    │
│              │               │          │ Name field.                      │
│              │               │          │ Null until saved.                │
│              │               │          │ Example: "PC-ALON-01"            │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ tickets      │ Ticket[]      │ —        │ Prisma relation field (virtual). │
│              │               │          │ Not a DB column — it's a         │
│              │               │          │ back-reference allowing Prisma   │
│              │               │          │ to load related Ticket rows via  │
│              │               │          │ include: { user: true }.         │
└──────────────┴───────────────┴──────────┴──────────────────────────────────┘
```

### 6.2 Ticket Table

The `Ticket` table represents every support request submitted by employees. Once created, only the `status` field is changed (by admins). All other fields are immutable.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              TABLE: Ticket                                   │
├──────────────┬───────────────┬──────────┬──────────────────────────────────┤
│ Column       │ Type          │ Required │ Description                      │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ id           │ String (CUID) │ ✓        │ Primary key. Auto-generated.     │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ subject      │ String        │ ✓        │ One-line problem description.    │
│              │               │          │ Shown as the card title in both  │
│              │               │          │ dashboard and admin queue.       │
│              │               │          │ No length limit in schema, but   │
│              │               │          │ UI truncates with ellipsis.      │
│              │               │          │ Example: "המדפסת לא מדפיסה"       │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ description  │ String        │ ✓        │ Full details of the problem.     │
│              │               │          │ Multi-line text. Shown in the    │
│              │               │          │ expanded admin card panel.       │
│              │               │          │ Preserved with white-space:      │
│              │               │          │ pre-wrap for line breaks.        │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ phone        │ String        │ ✓        │ Employee's contact number at     │
│              │               │          │ time of submission.              │
│              │               │          │ Pre-filled from User.phone if    │
│              │               │          │ set. Stored per-ticket so it     │
│              │               │          │ remains accurate even if the     │
│              │               │          │ user later changes their profile.│
│              │               │          │ Example: "050-1234567"           │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ computerName │ String        │ ✓        │ Hostname of the affected machine.│
│              │               │          │ Pre-filled from User.station.    │
│              │               │          │ The "?" tooltip in TicketForm    │
│              │               │          │ explains how to find this value  │
│              │               │          │ (Start → cmd → hostname).        │
│              │               │          │ Example: "PC-ALON-01"            │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ urgency      │ String        │ ✓        │ Priority level. Controls queue   │
│              │               │          │ sort order in admin panel.       │
│              │               │          │ Default: "בינוני"                │
│              │               │          │                                  │
│              │               │          │ Valid values:                    │
│              │               │          │  "נמוך"   — Low. Non-urgent.      │
│              │               │          │  "בינוני" — Medium (default).    │
│              │               │          │  "גבוה"   — High. Significant    │
│              │               │          │             work impact.         │
│              │               │          │  "דחוף"   — Urgent. Complete     │
│              │               │          │             work stoppage.       │
│              │               │          │                                  │
│              │               │          │ Queue sort rank:                 │
│              │               │          │  דחוף=0, גבוה=1, בינוני=2, נמוך=3│
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ category     │ String        │ ✓        │ Type of IT issue.                │
│              │               │          │ Default: "אחר"                   │
│              │               │          │                                  │
│              │               │          │ Valid values:                    │
│              │               │          │  "חומרה"  — Hardware (PC, screen,│
│              │               │          │             keyboard, mouse)     │
│              │               │          │  "תוכנה"  — Software (OS, apps,  │
│              │               │          │             errors)              │
│              │               │          │  "רשת"    — Network (internet,   │
│              │               │          │             Wi-Fi, VPN)          │
│              │               │          │  "מדפסת"  — Printer issues       │
│              │               │          │  "אחר"    — Other / uncategorised│
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ status       │ String        │ ✓        │ Current state of the ticket.     │
│              │               │          │ Default: "פתוח"                  │
│              │               │          │ Only changed by admins via       │
│              │               │          │ PATCH /api/tickets.              │
│              │               │          │                                  │
│              │               │          │ Valid values:                    │
│              │               │          │  "פתוח"   — Open. Awaiting       │
│              │               │          │             attention.           │
│              │               │          │  "בטיפול" — In Progress. Tech is │
│              │               │          │             working on it.       │
│              │               │          │  "סגור"   — Closed. Resolved.    │
│              │               │          │             Removed from queue.  │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ createdAt    │ DateTime      │ ✓        │ When the ticket was submitted.   │
│              │               │          │ Auto-set by Prisma @default(now) │
│              │               │          │ Server time (UTC).               │
│              │               │          │ Used for FIFO queue ordering     │
│              │               │          │ within same urgency level.       │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ updatedAt    │ DateTime      │ ✓        │ When the ticket was last changed.│
│              │               │          │ Auto-updated by Prisma @updatedAt│
│              │               │          │ on any field change.             │
│              │               │          │ Currently only changes when      │
│              │               │          │ status is updated.               │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ userId       │ String        │ ✓        │ Foreign key → User.id            │
│              │               │          │ Set at creation from the         │
│              │               │          │ authenticated user's DB row.     │
│              │               │          │ Never changes after creation.    │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ user         │ User          │ —        │ Prisma relation (virtual).       │
│              │               │          │ Populated by include: { user }   │
│              │               │          │ in admin ticket fetches.         │
└──────────────┴───────────────┴──────────┴──────────────────────────────────┘
```

### 6.3 Log Table

The `Log` table stores all error events from both client and server. It is used exclusively by the admin error log viewer. Entries are never shown to regular users.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              TABLE: Log                                      │
├──────────────┬───────────────┬──────────┬──────────────────────────────────┤
│ Column       │ Type          │ Required │ Description                      │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ id           │ String (CUID) │ ✓        │ Primary key. Auto-generated.     │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ timestamp    │ DateTime      │ ✓        │ Exact time of the error.         │
│              │               │          │ Auto-set by Prisma @default(now) │
│              │               │          │ Server time (UTC).               │
│              │               │          │ Used to order log entries        │
│              │               │          │ chronologically in the log tab.  │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ level        │ String        │ ✓        │ Severity of the event.           │
│              │               │          │ Default: "error"                 │
│              │               │          │ Currently only "error" is used.  │
│              │               │          │ Reserved for future: "warn",     │
│              │               │          │ "info" levels.                   │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ message      │ String        │ ✓        │ The error message string.        │
│              │               │          │ Truncated to 2000 characters by  │
│              │               │          │ logError() and POST /api/logs.   │
│              │               │          │ Example: "Cannot read properties │
│              │               │          │ of undefined (reading 'map')"    │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ source       │ String?       │ ✗        │ Where the error originated.      │
│              │               │          │ For API routes: the route path   │
│              │               │          │ and method, e.g.                 │
│              │               │          │ "/api/tickets POST".             │
│              │               │          │ For client errors: the page URL  │
│              │               │          │ path from window.location.       │
│              │               │          │ Null if not provided.            │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ stack        │ String?       │ ✗        │ JavaScript stack trace.          │
│              │               │          │ Truncated to 5000 characters.    │
│              │               │          │ For React errors: includes both  │
│              │               │          │ the JS stack and React's         │
│              │               │          │ component tree stack             │
│              │               │          │ (from info.componentStack).      │
│              │               │          │ Null for errors without a trace. │
├──────────────┼───────────────┼──────────┼──────────────────────────────────┤
│ date         │ String        │ ✓        │ ISO date string: "YYYY-MM-DD"    │
│              │               │          │ Derived from timestamp at write  │
│              │               │          │ time. Used for two purposes:     │
│              │               │          │                                  │
│              │               │          │ 1. FILTERING: Admin log tab      │
│              │               │          │    queries WHERE date = ?        │
│              │               │          │    to show a specific day.       │
│              │               │          │                                  │
│              │               │          │ 2. CLEANUP: Entries with date <  │
│              │               │          │    cutoff date are deleted.      │
│              │               │          │    String comparison is safe     │
│              │               │          │    because ISO dates sort        │
│              │               │          │    lexicographically.            │
│              │               │          │                                  │
│              │               │          │ Example: "2026-04-09"            │
└──────────────┴───────────────┴──────────┴──────────────────────────────────┘
```

### 6.4 Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│               User                  │
├─────────────────────────────────────┤
│ id        PK  CUID                  │
│ email     UNIQUE  String            │
│ name      String?                   │
│ image     String?                   │
│ isAdmin   Boolean  DEFAULT false    │
│ phone     String?                   │
│ station   String?                   │
└──────────────────┬──────────────────┘
                   │  1 : N
                   │  (one user, many tickets)
                   │
                   ▼
┌─────────────────────────────────────┐
│               Ticket                │
├─────────────────────────────────────┤
│ id          PK  CUID                │
│ subject     String                  │
│ description String                  │
│ phone       String                  │
│ computerName String                 │
│ urgency     String  DEFAULT "בינוני"│
│ category    String  DEFAULT "אחר"  │
│ status      String  DEFAULT "פתוח" │
│ createdAt   DateTime  DEFAULT now() │
│ updatedAt   DateTime  @updatedAt    │
│ userId      FK → User.id            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│               Log                   │
├─────────────────────────────────────┤
│ id        PK  CUID                  │
│ timestamp DateTime  DEFAULT now()   │
│ level     String    DEFAULT "error" │
│ message   String                    │
│ source    String?                   │
│ stack     String?                   │
│ date      String  ("YYYY-MM-DD")    │
└─────────────────────────────────────┘
  (Log has no foreign keys — it is
   independent of User and Ticket)
```

---

## 7. API Routes Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | `/api/auth/[...nextauth]` | — | NextAuth OAuth handler (managed by library) |
| GET | `/api/tickets` | User | Own tickets (or all tickets if admin) |
| POST | `/api/tickets` | User | Create new ticket |
| PATCH | `/api/tickets` | Admin | Update ticket status |
| GET | `/api/profile` | User | Get own name/phone/station |
| PATCH | `/api/profile` | User | Update own name/phone/station |
| GET | `/api/users` | Admin | Get all users |
| PATCH | `/api/users` | Admin | Update any user (name/phone/station/isAdmin) |
| GET | `/api/logs?date=YYYY-MM-DD` | Admin | Get log entries for a date |
| POST | `/api/logs` | None | Write a log entry (+ 30-day cleanup) |
| POST | `/api/contact` | User | Send email to dev@cristalino.co.il |

---

## 8. Authorization Matrix

```
Route / Action              │ Unauthenticated │ Regular User │ Admin
────────────────────────────┼─────────────────┼──────────────┼──────────
GET /                       │ → /login        │ → /dashboard │ → /admin
GET /login                  │ ✓               │ ✓            │ ✓
GET /dashboard              │ → /login        │ ✓            │ ✓
GET /admin                  │ → /login        │ → /dashboard │ ✓
GET /profile                │ → /login        │ ✓            │ ✓
GET /help                   │ ✓               │ ✓            │ ✓
GET /contact                │ → /login        │ ✓            │ ✓
────────────────────────────┼─────────────────┼──────────────┼──────────
POST /api/tickets           │ 401             │ ✓            │ ✓
GET  /api/tickets           │ 401             │ Own only     │ All
PATCH /api/tickets          │ 401             │ 403          │ ✓
GET  /api/profile           │ 401             │ Own only     │ Own only
PATCH /api/profile          │ 401             │ Own only     │ Own only
GET  /api/users             │ 401             │ 403          │ ✓
PATCH /api/users            │ 401             │ 403          │ ✓
GET  /api/logs              │ 403             │ 403          │ ✓
POST /api/logs              │ ✓ (open)        │ ✓            │ ✓
POST /api/contact           │ 401             │ ✓            │ ✓
```

---

## 9. Error Logging Architecture

Three separate mechanisms capture errors, all writing to the same `Log` database table:

```
                     ┌─────────────────────────────────────┐
                     │           Log Database Table         │
                     │  id, timestamp, level, message,      │
                     │  source, stack, date                 │
                     └──────────────────────────────────────┘
                            ▲             ▲             ▲
                            │             │             │
          ┌─────────────────┤             │             ├────────────────────┐
          │                 │             │             │                    │
  ┌───────────────┐  ┌──────────────┐    │    ┌─────────────────────┐       │
  │ ErrorBoundary │  │ClientError   │    │    │ API Routes          │       │
  │               │  │Handler       │    │    │                     │       │
  │ React render  │  │              │    │    │ try/catch in:       │       │
  │ errors        │  │ window.error │    │    │  /api/tickets       │       │
  │               │  │ unhandled    │    │    │  /api/profile       │       │
  │ componentDid  │  │ rejection    │    │    │  /api/users         │       │
  │ Catch()       │  │              │    │    │                     │       │
  └───────┬───────┘  └──────┬───────┘    │    │ calls logError()   │       │
          │                 │            │    │ from lib/logError.ts│       │
          │  POST           │  POST      │    │                     │       │
          └─────────────────┘            │    │ Direct DB write     │       │
               /api/logs                 │    │ (no HTTP round-trip)│       │
                    │                    │    └─────────────────────┘       │
                    └────────────────────┘                                  │
                    Prisma log.create()  ◄──────────────────────────────────┘
                    + log.deleteMany()
                    (30-day cleanup)
```

**Why three mechanisms?**

| Mechanism | What it catches | How it logs |
|-----------|----------------|-------------|
| `ErrorBoundary` | React component render crashes | POST /api/logs |
| `ClientErrorHandler` | Unhandled JS errors + promise rejections | POST /api/logs |
| `logError()` in API routes | Server-side DB/logic errors | Direct Prisma write |

---

## 10. Deployment Architecture

```
Developer Machine
        │
        │  1. ./deploy.sh
        │
        │  2. tar: app/, components/, lib/, prisma/, public/,
        │     types/, auth.ts, package.json, tsconfig.json,
        │     next.config.ts → helpdesk-src.tar.gz
        │
        │  3. scp tar.gz → ubuntu@server:/home/ubuntu/helpdesk/
        │
        ▼
Ubuntu Server — /home/ubuntu/helpdesk/
        │
        │  4. pm2 stop helpdesk
        │
        │  5. tar -xzf helpdesk-src.tar.gz
        │
        │  6. npm install
        │     npx prisma migrate deploy   ← applies pending migrations
        │     npx prisma generate         ← regenerates Prisma Client
        │     npm run build               ← next build
        │
        │  7. pm2 start helpdesk
        │
        ▼
     Port 3000 → nginx → https://helpdesk.cristalino.co.il

IMPORTANT RULES:
─────────────────
• NEVER build locally and copy .next — Turbopack embeds absolute paths
  from the build machine into compiled JS chunks. Building on a different
  machine causes module hash mismatches on the server.
• PM2 is configured with systemd (pm2 startup) so the app survives reboots.
```

---

## 11. Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✓ | PostgreSQL connection string. Format: `postgresql://USER:PASS@HOST:5432/DB` |
| `AUTH_SECRET` | ✓ | Secret for signing JWT cookies. Generate: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | ✓ | Google OAuth Client ID from Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | ✓ | Google OAuth Client Secret |
| `NEXTAUTH_URL` | ✓ | Public URL of the app. Must match Google OAuth redirect URI. E.g. `https://helpdesk.cristalino.co.il` |
| `AUTH_TRUST_HOST` | ✓ | Set to `true` when behind a reverse proxy (nginx). Required on the server. |
| `ADMIN_EMAILS` | ✗ | Comma-separated list of emails to auto-grant admin on first login (optional). |
| `SMTP_HOST` | ✗ | Mail server hostname for /contact. E.g. `smtp.office365.com` |
| `SMTP_PORT` | ✗ | SMTP port. `587` (STARTTLS, recommended) or `465` (SSL). Default: `587` |
| `SMTP_USER` | ✗ | SMTP authentication username (usually the From address) |
| `SMTP_PASS` | ✗ | SMTP password or app-specific password |
| `SMTP_FROM` | ✗ | Sender address in emails. Defaults to `SMTP_USER` if not set. |

> SMTP variables are optional but the `/contact` page will return HTTP 503 "SMTP not configured" if they are missing.

---

*© 2026 AK. All rights reserved.*
