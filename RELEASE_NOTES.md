# Release Notes

Newest first. Versions before 3.56 are recorded in the version table in
[HANDOFF.md](HANDOFF.md) and in `git log --oneline`.

---

## v3.58 — בקשות ציוד ורשימת חוסרים לספק

**Equipment can now be requested on a ticket, ticked off as it arrives, and
totalled into one order for the supplier.**

Onboarding a new employee meant typing the kit into the description as free
text — "מחשב + מסך + מייל" — and then chasing what had actually turned up by
re-reading the thread. Nothing added up across tickets, so ordering from the
supplier meant opening twenty tickets and counting by hand.

### What changed for users

- **A new "עובד חדש" category.** Choosing it opens the equipment checklist
  automatically, because onboarding always needs a kit.
- **Any ticket can ask for equipment**, not just onboarding ones. On every other
  category a "+ אני צריך גם ציוד" button reveals the same checklist — an
  existing employee asking for a second screen is the same request as far as the
  supplier is concerned.
- **Items carry a quantity.** Each item is a chip you click to request, with a
  −/+ stepper, so "מסך × 2" is one line rather than a duplicate.
- **The item list is admin-managed**, exactly like category and platform:
  "שדות מערכת" → "ציוד". Seeded with מחשב, מחשב נייד, מסך, מסך שני, עכבר,
  מקלדת, תחנת עגינה, אוזניות, טלפון נייד, חשבון Gmail, חשבון Zoho, משתמש קומקס.
- **The technician ticks items off** on the ticket page — a ✓ per line, or a
  count for a partial delivery ("2 מתוך 3 הגיעו"). The header shows the
  progress; the ticket owner sees the same list fill in.
- **The person who opened the ticket can add to their own list** while it is
  open, and withdraw an item nothing has arrived against yet.
- **New admin tab "ציוד חסר"** — everything still owed, grouped by item and
  ordered most-missing first. Expand an item to see which tickets are waiting.
  A "📋 העתק רשימה לספק" button puts a plain-text order on the clipboard.

### Who may do what

| Action | Owner | Staff |
|---|---|---|
| Request items (open ticket) | ✓ | ✓ |
| Request items (closed ticket) | — | ✓ |
| Mark an item received | — | ✓ |
| Withdraw an item nothing arrived against | ✓ | ✓ |
| Remove a partly-delivered item | — | ✓ |

Receiving is staff-only on purpose: the shortage list is the purchase order, so
anyone may ask for a screen but only the technician who handed it over may say
it arrived.

### What changed for developers

- **New model `TicketEquipment`** — `label`, `quantity`, `receivedQty`,
  `receivedAt`, `receivedBy`, unique on `(ticketId, label)`, cascade-deleted
  with the ticket. `label` is a **snapshot** of the option label at request
  time, so renaming or deleting an option never rewrites filed tickets.
  Migration `20260818000000_ticket_equipment`.
- **New `lib/equipment.ts`** (pure): `normalizeSelection()` (trims, clamps
  1..99, merges duplicates, validates against the live option list),
  `clampReceived()`, `outstandingOf()`, `equipmentProgress()`,
  `aggregateShortage()`, `formatSupplierText()`.
- **New routes:** `POST/PATCH/DELETE /api/tickets/[id]/equipment` and
  `GET /api/admin/equipment?includeClosed=1`.
- `POST /api/tickets` accepts `equipment: [{label, quantity}]` on any ticket.
  The option lookup is skipped entirely when the payload asks for nothing.
- `FieldOption` gains the `equipment` field. Seeding now also back-fills
  individual labels into already-populated fields (`REQUIRED_LABELS`), which is
  how "עובד חדש" reaches a live database. DELETE refuses that category — the UI
  keys off the exact label.
- `ticketRevision()` folds in each line's `receivedQty`, so a technician ticking
  an item off moves the polling signature; an ids-only signature would not.

### Testing

- 437 tests passing across 30 suites (81 new tests; 3 new suites).
- New `__tests__/equipment.test.ts` (39) — payload normalisation, clamping,
  per-line and per-ticket progress, shortage aggregation and supplier text.
- New `__tests__/EquipmentAPI.test.ts` (27) — the full authorization matrix
  above, partial deliveries, closed-ticket freezing, and the shortage endpoint.
- New `__tests__/FieldOptionsSeed.test.ts` (9) — seeding an empty field,
  back-filling "עובד חדש" into an already-populated one, and the DELETE guard.
  The back-fill uses `createMany`+`skipDuplicates`, never a bare `create`:
  every signed-in page load hits this endpoint, so two first-loads racing would
  collide on the `(field, label)` unique index and 500 every dropdown.
- `TicketsAPI.test.tsx` gains 6 creation-path cases, including equipment on an
  ordinary (non-onboarding) ticket.

---

## v3.57 — חיפוש לפי מספר פנייה (HDTC-N)

**Typing a ticket number now always finds the ticket — open or closed.**

Staff quote `HDTC-494` on the phone and in mail, but typing `494` into any
search box returned "לא נמצאו פניות": the ticket number was not a searchable
field on the staff pages, and a closed ticket stayed hidden behind the
"פתוחות" toggle and the stat-card filters even when it was named outright.

### What changed for users

- **Every ticket search box matches the ticket number.** Admin queue, staff
  "כל הפניות", the read-only viewer page and the personal dashboard.
- **Accepted forms:** `494`, `HDTC-494`, `hdtc-494`, `hdtc 494`, `hdtc494`,
  `#494`, `HDTC-0494`. Partial numbers still filter as substrings, so `49`
  keeps showing HDTC-49, HDTC-494 and HDTC-495.
- **An exact number wins over the filters.** Searching a number surfaces that
  ticket even when it is closed and the view is scoped to "פתוחות", or when a
  stat card (דחוף / בטיפול / סגורות …) would have excluded it.
- **A suggestion card** appears above the list for an exact hit — ticket
  number, subject and current status — linking straight to the ticket. The row
  is also pinned to the top of the list so it is never missed.
- Search placeholders now say so: "חיפוש לפי מספר פנייה (HDTC-123), …".

### What changed for developers

- New `lib/ticketSearch.ts` — pure, shared by all four pages:
  - `parseTicketNumberQuery(q)` — the query as a ticket number, or `null`
  - `matchesTicketNumber(n, q)` — substring match on the number or `HDTC-N`
  - `findByTicketNumber(tickets, q)` — exact hit across the **unfiltered** set
  - `withNumberSuggestion(list, tickets, q)` — `{ list, suggestion }`, pinning
    the exact hit onto the filtered list without duplicating it
- The exact-match lookup deliberately runs against the full ticket set, never
  the filtered one — that is what makes status scoping unable to hide a hit.
- `app/dashboard/page.tsx` dropped its inline `String(t.ticketNumber)` check in
  favour of the shared helper, so all four pages agree on what a number means.

### Testing

- 356 tests passing across 27 suites (35 new tests; 1 new suite).
- New `__tests__/ticketSearch.test.ts` — 31 cases covering query parsing
  (prefixes, separators, `#`, leading zeros, rejection of free text / `0` /
  decimals), substring matching, exact lookup, and the pinning contract
  (closed ticket behind an open-only filter, stat-card exclusion, no
  duplication, list untouched for free text).
- `__tests__/dashboardSearch.test.ts` mirrors the new predicate and adds 4
  cases for number search overriding the status card.

---

## v3.56 — פתיחת פנייה בשם משתמש אחר

**Admins can now open a ticket in another employee's name.**

Until now an admin taking a phone call or a walk-up had to either ask the caller
to file the ticket themselves, or open it under the admin's own name — which put
the ticket on the wrong dashboard and sent the confirmation email to the wrong
person. Now the admin picks the caller and the ticket lands where it belongs.

### What changed for users

- **Admins only.** A new "פתיחת פנייה בשם" picker appears at the top of the
  "+ פנייה חדשה" form. Regular users see the form exactly as before.
- The picker lists **every registered user**, plus **"➕ משתמש חדש…"** for
  someone who has never signed in — pick it and type their email (and optionally
  their name).
- Picking an existing user **pre-fills the phone and computer name from THEIR
  saved profile**, not the admin's.
- The ticket is **owned by the named person**: it shows on their dashboard, the
  "פנייתך התקבלה" confirmation email goes to them, and staff see them as the
  submitter.
- The picker resets to "— בשמי —" after each submit, so the next ticket never
  silently inherits the previous caller's identity.

### Audit trail

The ticket records both parties, so it is always clear who actually filed it:

- **History** — the `created` entry names the **admin** who clicked.
- **Internal note** (staff-only) — `הפנייה נפתחה בשם <owner> על ידי <admin>`.

### What changed for developers

- `POST /api/tickets` accepts two new optional fields:
  - `onBehalfOfEmail` — the address the ticket should belong to
  - `onBehalfOfName` — display name, used only when that address has no `User`
    row yet
- **Authorization is server-side.** A non-admin sending `onBehalfOfEmail` gets
  **403**; the client-side `isAdmin` prop only controls whether the picker is
  drawn. Sending your own address is treated as an ordinary self-opened ticket.
- The target address is **upserted**, so an admin can file for a new hire before
  their first Google login — the `User` row is waiting for them when they arrive.
- The address is trimmed and lower-cased before lookup, so casing and stray
  spaces still resolve to the same person.

### Testing

- 321 tests passing across 26 suites (13 new tests; no new suites).
- New coverage: 6 API cases in `TicketsAPI.test.tsx` (ownership, new-user
  upsert, email normalisation, audit note, non-admin 403, self-selection) and
  7 component cases in `TicketForm.test.tsx` (picker hidden for non-admins,
  roster rendering, payload shape, profile pre-fill, new-user inputs, reset).

### Files touched

| File | Change |
|---|---|
| `app/api/tickets/route.ts` | `onBehalfOfEmail`/`onBehalfOfName` handling, admin check, upsert, audit note, owner-addressed emails |
| `components/TicketForm.tsx` | `isAdmin` prop, user roster fetch, behalf picker, new-user inputs, profile pre-fill |
| `app/dashboard/page.tsx` | Passes `isAdmin` to `TicketForm` |
| `lib/version.ts` | 3.55 → 3.56 |

### No migration needed

Schema is unchanged — this release reuses the existing `User` and `TicketNote`
tables.
