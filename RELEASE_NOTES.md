# Release Notes

Newest first. Versions before 3.56 are recorded in the version table in
[HANDOFF.md](HANDOFF.md) and in `git log --oneline`.

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
