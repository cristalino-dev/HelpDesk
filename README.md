# מערכת הלפדסק — Cristalino HelpDesk

**Version 1.0** — Production baseline

A Hebrew RTL internal helpdesk system built for Cristalino LTD. Employees submit IT support tickets through a web app using their Google account. Helpdesk staff manage the queue through a dedicated admin panel.

---

## Features

- **Google OAuth login** — employees sign in with their Cristalino Google account
- **Ticket submission** — subject, description, computer name, phone, category, and urgency level
- **My tickets view** — users see only their own tickets with live status
- **Admin queue** — sorted by urgency (דחוף → גבוה → בינוני → נמוך), then by open time (FIFO)
- **Status management** — admins can mark tickets as פתוח / בטיפול / סגור with one click
- **Role-based access** — admin link only visible to authorized emails
- **Hebrew RTL** — full right-to-left layout throughout

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | NextAuth v5 (beta) with Google provider |
| ORM | Prisma 5 |
| Database | PostgreSQL 18 (AWS Lightsail RDS) |
| Styling | Inline React styles (RTL-safe, no Tailwind in prod) |
| Hosting | AWS Lightsail Windows Server 2022 |
| Process manager | Windows Task Scheduler (runs as SYSTEM) |
| Deployment | WinRM + PowerShell zip-upload-build-on-server |

---

## Project Structure

```
helpdesk/
├── app/
│   ├── layout.tsx              # Root layout — Hebrew RTL (lang="he" dir="rtl")
│   ├── globals.css             # Base styles, input/label/button resets
│   ├── providers.tsx           # NextAuth SessionProvider wrapper
│   ├── login/
│   │   └── page.tsx            # Google sign-in page
│   ├── dashboard/
│   │   └── page.tsx            # User ticket list + new ticket form
│   ├── admin/
│   │   └── page.tsx            # Admin queue (admins only)
│   └── api/
│       └── tickets/
│           └── route.ts        # GET / POST / PATCH ticket API
├── components/
│   ├── TicketForm.tsx          # New ticket form with urgency selector + computer name tooltip
│   └── TicketTable.tsx         # Ticket cards with urgency-colored borders + hover effect
├── lib/
│   └── db.ts                   # Prisma client singleton
├── prisma/
│   └── schema.prisma           # User + Ticket models
├── auth.ts                     # NextAuth config — Google provider, session callback, auto-creates users
├── deploy.example.ps1          # Deployment script template (fill in credentials → save as deploy.ps1)
├── check.example.ps1           # Diagnostics script template
├── .env.example                # Environment variable template
└── next.config.ts
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
  tickets Ticket[]
}

model Ticket {
  id           String   @id @default(cuid())
  subject      String
  description  String
  phone        String
  computerName String
  urgency      String   @default("בינוני")   // נמוך | בינוני | גבוה | דחוף
  category     String   @default("אחר")      // חומרה | תוכנה | רשת | מדפסת | אחר
  status       String   @default("פתוח")     // פתוח | בטיפול | סגור
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  userId       String
  user         User     @relation(fields: [userId], references: [id])
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
# Edit .env.local with your values
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret — generate with `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `NEXTAUTH_URL` | Public URL of the app (must match Google OAuth redirect URI) |
| `AUTH_TRUST_HOST` | Set to `true` when running behind a proxy or non-localhost |
| `ADMIN_EMAILS` | Comma-separated emails that get admin access on first login |

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

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add your app URL to **Authorized JavaScript origins**
4. Add `{YOUR_URL}/api/auth/callback/google` to **Authorized redirect URIs**
5. Copy the Client ID and Secret into `.env.local`
6. Make sure the OAuth app is **Published** (not in Testing mode) so all users can sign in

---

## Deployment (Windows Server via WinRM)

This project deploys to an AWS Lightsail Windows Server 2022 instance. The build runs on the server (not locally) because Turbopack embeds absolute paths in compiled chunks.

```powershell
# 1. Copy the example and fill in your server credentials
cp deploy.example.ps1 deploy.ps1

# 2. Run from local PowerShell (not from Claude Code — ConvertTo-SecureString requires Windows security modules)
.\deploy.ps1
```

The script:
1. Zips source files (no `node_modules` or `.next`)
2. Uploads the zip to the server via WinRM
3. Extracts, runs `npm install` + `prisma generate` + `npm run build` on the server
4. Restarts the "Helpdesk" Windows Scheduled Task

### Server requirements

- Node.js installed
- WinRM enabled (port 5985 open in firewall)
- Port 3000 open in Windows Firewall and Lightsail firewall rules
- Windows Scheduled Task named **"Helpdesk"** configured to run `start.ps1` as SYSTEM

### Granting admin access

Admin access is controlled two ways:

**Via environment variable** (applied on first login):
```
ADMIN_EMAILS=user@company.com,other@company.com
```

**Via database** (for existing users):
```sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'user@company.com';
```

---

## API

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/tickets` | User | Returns own tickets; returns all tickets for admins |
| `POST` | `/api/tickets` | User | Creates a new ticket |
| `PATCH` | `/api/tickets` | Admin | Updates ticket status |

---

## Notes

- **nip.io domain**: `18.x.x.x.nip.io` is used because Google OAuth does not allow raw IP addresses as redirect URIs
- **Inline styles**: Tailwind CSS classes are not used in page components — all styles are React inline styles to ensure they render correctly after server build
- **No PM2**: PM2 dies when a WinRM session closes. Windows Task Scheduler running as SYSTEM is used instead
- **Build on server**: Next.js Turbopack embeds absolute local paths in chunks — building locally and copying `.next` causes module hash mismatches on the server
