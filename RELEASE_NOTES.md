# Release Notes

Newest first. Versions before 3.56 are recorded in the version table in
[HANDOFF.md](HANDOFF.md) and in `git log --oneline`.

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
