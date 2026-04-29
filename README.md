# מערכת helpdesk — Cristalino HelpDesk

**Version 3.12** — Centralized ticket mutations, workdays tracking, audit history, profile pre-fill

A Hebrew RTL internal helpdesk system built for Cristalino LTD. Employees submit IT support tickets through a web app using their Google account. Helpdesk staff and admins manage the queue through dedicated panels.

---

## Features

- **Google OAuth login** — employees sign in with their Cristalino Google account
- **Ticket submission** — subject, description, computer name, phone, platform, category, urgency level
- **My tickets dashboard** — users see only their own tickets with live status, search and status filter
- **Full-text search** — every page has a search bar that queries all ticket fields simultaneously
- **Clickable stat-card filters** — summary cards on dashboard, /tickets and /admin filter the list on click; click again to clear
- **Mobile-first** — hamburger menu (☰) on all staff pages; responsive card layouts throughout
- **Admin queue** — sorted by urgency (דחוף → גבוה → בינוני → נמוך), FIFO within urgency; sortable by any column
- **Status management** — staff can mark tickets פתוח / בטיפול / סגור; automated emails on each transition
- **Re-open tickets** — users can re-open closed tickets within 4 weeks; admins can always re-open
- **Service ratings** — automatic rating request email after closure; 1–5 star review dashboard
- **Staff collaboration** — technician notes with @mention email notifications and image support
- **Two-way chat** — direct messaging between user and staff with email notifications
- **Stale ticket warning** — visual flag (orange) on open/in-progress tickets idle for 4+ workdays (Israeli Sun-Thu week)
- **Workdays display** — open duration shown in business days everywhere (e.g. "יע 3")
- **Ticket history** — full audit trail of every field change with actor and timestamp
- **Profile pre-fill** — /open and dashboard forms pre-populate name, phone, computer from saved profile
- **Self-close** — users can close their own tickets from the ticket detail page
- **Compound closure** — closing always auto-downgrades urgency to "נמוך" (server-enforced, single source of truth)
- **Role-based access** — Employee / Staff / Viewer / Admin with per-role page guards
- **Hebrew RTL** — full right-to-left layout throughout
- **Error monitoring** — admin log viewer with live filtering, copy-all and download buttons
- **Daily digest** — scheduled email summary of open tickets to staff each morning

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.2 (App Router, Turbopack) |
| Auth | NextAuth v5 (beta) with Google provider |
| ORM | Prisma 5.22.0 |
| Database | PostgreSQL (AWS RDS) |
| OS | Ubuntu 24.04 LTS |
| Process manager | PM2 |
| Deployment | SSH + SCP (deploy.sh) — build runs on server |
| Mail | nodemailer v7 — SMTP (helpdesk@cristalino.co.il) |

---

## Project Structure

```
helpdesk/
├── app/
│   ├── layout.tsx                   # Root layout — Hebrew RTL (lang="he" dir="rtl")
│   ├── page.tsx                     # Root redirect
│   ├── login/page.tsx               # Google sign-in
│   ├── dashboard/page.tsx           # User: ticket list + search + stat-card filters + new ticket form
│   ├── admin/page.tsx               # Admin: queue + search + stat filters + sort + users + logs
│   ├── admin/reviews/page.tsx       # Staff: service review dashboard
│   ├── admin/logs/page.tsx          # Admin: error log viewer
│   ├── admin-manual/page.tsx        # Staff/admin usage manual
│   ├── tickets/page.tsx             # Staff: all tickets + search + stat filters + sort
│   ├── tickets/view/page.tsx        # Viewer-role: read-only ticket list + search
│   ├── tickets/[id]/page.tsx        # Full ticket detail — notes, messages, attachments, edit
│   ├── help/page.tsx                # Hebrew user manual
│   ├── contact/page.tsx             # Contact form (sends email to dev team)
│   ├── profile/page.tsx             # User account settings
│   ├── open/page.tsx                # Public ticket-open shortcut
│   ├── review/[ticketId]/page.tsx   # Service rating (no login required)
│   └── api/                         # REST API routes (tickets, notes, messages,
│                                    #   attachments, reviews, profile, users, logs, digest)
├── components/
│   ├── TicketForm.tsx               # New ticket form (pre-populates from profile)
│   ├── TicketTable.tsx              # Ticket cards (isFiltered empty state)
│   ├── ErrorBoundary.tsx            # React error boundary
│   ├── ClientErrorHandler.tsx       # window.onerror logger
│   └── FooterCopyright.tsx          # Shared footer
├── lib/
│   ├── db.ts                        # Prisma singleton
│   ├── mail.ts                      # sendMail + email HTML templates
│   ├── staffEmails.ts               # STAFF_EMAILS + VIEWER_EMAILS
│   ├── staleTicket.ts               # isStaleOpen() — 5-day threshold
│   ├── useIsMobile.ts               # useIsMobile hook (640px breakpoint)
│   ├── logError.ts                  # Server-side error logging
│   └── version.ts                   # ← single source of version truth
├── __tests__/                       # 133 tests across 13 suites
├── prisma/schema.prisma             # Full schema (see Data Model below)
├── auth.ts                          # NextAuth config
├── deploy.sh                        # Linux deployment script
├── setup-server.sh                  # Ubuntu one-time setup
├── ssl-init.sh                      # SSL via Certbot/Nginx
└── ecosystem.config.js              # PM2 config
```

---

## Data Model

```prisma
model User {
  id      String   @id @default(cuid())
  email   String   @unique
  name    String?
  image   String?
  isAdmin Boolean  @default(false)
  phone   String?
  station String?
  tickets Ticket[]
}

model Ticket {
  id           String             @id @default(cuid())
  ticketNumber Int                @unique @default(autoincrement())
  assignedTo   String             @default("helpdesk@cristalino.co.il")
  subject      String
  description  String
  phone        String
  computerName String
  urgency      String   // נמוך | בינוני | גבוה | דחוף
  category     String   // חומרה | תוכנה | רשת | מדפסת | אחר
  platform     String   // comax | comax sales tracker | אנדרואיד | אייפד | מחשב אישי
  status       String   // פתוח | בטיפול | סגור
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  userId       String
  user         User               @relation(fields: [userId], references: [id])
  notes        TicketNote[]
  attachments  TicketAttachment[]
  messages     TicketMessage[]
  review       TicketReview?
}

model TicketNote       { id, ticketId, content, authorName, authorEmail, createdAt }
model TicketMessage    { id, ticketId, content, authorName, authorEmail, authorRole, createdAt }
model TicketAttachment { id, ticketId, dataUrl, filename, createdAt }
model TicketReview     { id, ticketId(unique), rating 1–5, comment?, submitterName, submitterEmail, createdAt }

model Log {
  id        String   @id @default(cuid())
  timestamp DateTime @default(now())
  level     String   // error | warn | info
  message   String
  source    String?
  stack     String?
  date      String   // "YYYY-MM-DD" for queries + 30-day auto-cleanup
}
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/cristalino-dev/HelpDesk.git
cd HelpDesk
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret — `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `NEXTAUTH_URL` | Public URL of the app |
| `AUTH_TRUST_HOST` | `true` when behind a proxy |
| `ADMIN_EMAILS` | Comma-separated emails granted admin on first login |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Mail server credentials |

### 3. Set up the database

```bash
npx prisma generate
npx prisma db push
```

### 4. Run locally

```bash
npm run dev
```

---

## Google OAuth Setup

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add your app URL to **Authorized JavaScript origins**
4. Add `{YOUR_URL}/api/auth/callback/google` to **Authorized redirect URIs**
5. Copy the Client ID and Secret into `.env.local`
6. Make sure the OAuth app is **Published** (not Testing mode)

---

## Version History

| Version | Key Changes |
|---------|-------------|
| 1.0     | INITIAL RELEASE: Core ticket submission and admin dashboard |
| 2.0     | MAJOR BUILD: Multi-platform, Linux native, SSL domain |
| 2.1     | STAFF UPDATE: Global ticket view with Staff role |
| 2.2     | EDITING UPDATE: Advanced ticket editing for staff |
| 2.3     | REFINED MANAGEMENT: Fast inline editing, full lifecycle |
| 2.4     | NOTES & ATTACHMENTS: Collaborative notes, image upload |
| 2.5     | STAFF COLLABORATION: @mention notifications in notes |
| 2.6     | QUALITY UPDATE: Comprehensive test documentation |
| 2.7     | INTERACTIVE MESSAGING: Two-way chat with email notifications |
| 2.8     | ADMIN LOGS: Error log viewer with live filtering |
| 2.9     | NAVIGATION: Role-based header badges, nav fixes |
| 3.00    | REOPEN: 4-week re-open window; help page updated |
| 3.01    | STALE FIX: Stale warning covers בטיפול as well as פתוח |
| 3.02    | RELIABILITY: Self-notification exclusion; Prisma generate in build |
| 3.04    | STAFF: Restore alon@cristalino.co.il to STAFF_EMAILS |
| 3.05    | MOBILE: Hamburger menus on all staff pages; clickable stat-card filters |
| 3.06    | SEARCH: Full-text search on all pages; dashboard search + stat-filter combo; fix Rules of Hooks |

---

## Deployment (Ubuntu Linux via SSH)

```bash
./deploy.sh          # regular deploy — builds on server
./setup-server.sh    # one-time server setup
./ssl-init.sh        # optional SSL via Certbot
```

**Build pipeline (runs on server):**
```
npm install → prisma migrate deploy → prisma generate → jest --ci → next build → pm2 restart
```

### Granting admin access

Via environment variable (applied on first login):
```
ADMIN_EMAILS=user@company.com
```

Via database:
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'user@company.com';
```

---

## Notes

- **Inline styles**: No Tailwind CSS in page components — all styles are inline React styles
- **Build on server**: Turbopack embeds absolute paths — never build locally and copy `.next`
- **Hooks before early returns**: All React hooks (useMemo, useEffect, etc.) must come before any conditional `return null`

---

&copy; 2026 AK. All rights reserved.
