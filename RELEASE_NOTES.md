# Release Notes

Newest first. Versions before 3.56 are recorded in the version table in
[HANDOFF.md](HANDOFF.md) and in `git log --oneline`.

---

## v3.67 — הפנייה החדשה במייל: מספר פנייה, מסגרת וצבעי המותג

**The staff notification for a new ticket shipped for a long time without the
one field a technician actually needs to act on it: the ticket number. Not in
the body, not in the subject.** Someone reading `🎫 פנייה חדשה נפתחה` on a
phone had the subject, the reporter and the description, and no way to say
*which* ticket it was without opening the app and searching for it. This
release puts `HDTC-<n>` in both mails and rebuilds them on the app's own
palette.

### What changed for users

The subject line now leads with the number, so the queue is scannable straight
from the inbox list:

```
פנייה חדשה HDTC-528: פתיחת עובדים חדשים
פנייתך התקבלה — HDTC-528
```

The message itself is no longer a stack of bare paragraphs. It is a 600px card
on the page grey, with a dark `#16181D` header bar carrying the `helpdesk`
wordmark and a green `HDTC-528` chip, a 4px `#74C53A` accent rule under it, the
ticket details in a bordered label/value panel, the description in its own
panel with a green right-border, and a dark call-to-action button that opens
the ticket. The submitter's confirmation leads with a hero block — *מספר הפנייה
שלך* over `HDTC-528` at 24px — because that number is the whole reason they
would keep the mail.

The header chip is on all nine ticket templates, not just the two new-ticket
ones, so every mail about a ticket says which ticket it is. The daily digest
covers many tickets at once and deliberately has no chip.

### What changed for developers

`wrap()` in [`lib/mail.ts`](lib/mail.ts) takes an optional second argument:

```ts
function wrap(body: string, ticketNumber?: number): string
```

Pass the number and the header renders the chip; omit it (the digest) and the
header is the wordmark alone. Three inline-styled helpers — `details()`,
`badge()` and `button()` — build the repeated pieces, so a template is a list
of parts rather than a wall of `<td style="…">`.

**The colours are derived from [`lib/theme.ts`](lib/theme.ts), not copied out of
it.** `URGENCY_COLOR` and `STATUS_COLOR` are built with `Object.fromEntries`
over the app's own maps, so a re-brand reaches the mail without anyone
remembering that the mail exists.

Three constraints shape every line of this markup, and none of them are
negotiable:

- **Gmail strips `dir` from `<html>` and `<body>`, and drops the `<style>`
  block's body rules.** Hebrew renders left-to-right unless `dir="rtl"` and
  `direction:rtl;text-align:right` are inline on the content elements
  themselves. They are, and a test asserts it.
- **Outlook renders through Word.** No flex, no grid — the frame is nested
  tables with inline styles.
- **Subjects and descriptions are free text.** `esc()` escapes `&`, `<` and `>`
  on every interpolation; an unescaped `<` in a ticket subject truncates the
  rest of the message in most readers.

### Tests

[`__tests__/ticketMail.test.ts`](__tests__/ticketMail.test.ts) — 14 tests in
four groups: the number renders in both mails and in the header chip (the
regression this file exists for), free text cannot break the message, empty
optional fields fall back to an em dash rather than an empty row, and the brand
colours and RTL markers are present. The suite is 596 tests across 38.

One existing test needed changing: `TicketsAPI.test.tsx` matched the
confirmation mail by `subject === "פנייתך התקבלה"`, which the number broke. It
now matches by prefix.

---

## v3.66 — מסד הנתונים אוכף חשבון אחד לכל אדם

**v3.65 removed every duplicate the application could produce and said so
plainly: the remaining hole was in the schema, and only the database could
close it. This closes it.**

`User.email` is `String @unique`, which is a btree over the exact bytes.
`dana@cristalino.co.il` and `Dana@Cristalino.co.il` are two distinct legal
values, so the column would hold one person twice no matter how carefully
`lib/users.ts` looked her up first. Two concurrent sign-ins cannot be ordered by
being careful. They can be ordered by a constraint:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email));
```

**Verified against production immediately before writing the migration: 96
users, zero mixed-case addresses, zero case-duplicates — and every other
email-bearing column (`Ticket.assignedTo`, `TicketMessage.authorEmail`,
`TicketNote.authorEmail`, `TicketHistory.actorEmail`,
`TicketReview.submitterEmail`, `TicketEquipment.receivedBy`) already entirely
lowercase.** That last check is what made the `auth.ts` half of this change
safe; see below.

### What changed for users

Nothing visible, and that is the intent. The bug this forecloses never fired —
a duplicate account would have split one person's tickets across two rows, only
one of which they can sign in to. Sign-in, ticket ownership, and the ticket
history are unchanged.

### What changed for developers

- **New migration `20260824000000_user_email_case_insensitive`** — raw SQL,
  because Prisma has no syntax for a functional index. The plain
  `User_email_key` btree **stays**: Prisma needs it for
  `findUnique({ where: { email } })`, and a dozen call sites use one. The new
  index is strictly additional.
- **`prisma migrate dev` will report the index as drift.** That is expected and
  is not a signal to reset the database. `prisma/schema.prisma` carries a
  comment on `User.email` pointing at the migration so the next person meets
  the explanation before they meet the drift warning.
- **`IF NOT EXISTS` is load-bearing, not decoration.** `deploy.sh` runs
  `prisma migrate deploy` *inside* the swap window — pm2 stopped, maintenance
  page up, `set -e` armed — so a migration that fails there does not abort
  cleanly, it leaves the site down. **Create the index by hand first, against
  the running app**, where a duplicate fails at zero cost:

  ```sql
  SELECT lower(email), count(*) FROM "User" GROUP BY 1 HAVING count(*) > 1;
  CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email));
  ```

  The in-window run is then a guaranteed no-op. If it does fail, the Postgres
  error names the offender (`Key (lower(email))=(…) is duplicated`); merge the
  two accounts before retrying, and do not weaken the index.
- **`auth.ts` now goes through `lib/users.ts` too** — it was the last direct
  `prisma.user.findUnique`/`create` on an email, and the one that wrote Google's
  casing verbatim. The index alone would have turned that write into a P2002 at
  sign-in; normalising on write makes the index a backstop rather than the only
  guard, which is the right order of the two.
- **The session carries the *stored* address, not the one Google sent.** This is
  the load-bearing half of the `auth.ts` change. Some thirty places match
  `session.user.email` against a stored email exactly — ticket ownership,
  message authorship, the self-notification filter, `STAFF_EMAILS` membership.
  Normalising the row while leaving the session on Google's casing would have
  locked a mixed-case user out of their own ticket. The invariant is now stated
  at the top of `auth.ts`: **`session.user.email` is the address as the database
  stores it.** It is why the audit of the other email columns above mattered —
  a lowercased session email must still match every address already on file.
- **`resolveUserByEmail()` takes an optional `image`**, applied on create only,
  like `name`. Only `auth.ts` has one to pass; without it the change would have
  silently stopped storing Google profile photos.
- **Normalising before the `upsert` is what keeps a race harmless.** Both racers
  insert the identical string, so they collide on `User_email_key` — the
  constraint `upsert` targets and absorbs. Upserting the raw address would
  collide on the new functional index instead, which `upsert` does not target,
  and the loser would throw P2002 at the caller. `__tests__/resolveUser.test.ts`
  pins the `where` and the `create` to the same normalised value.
- **New `__tests__/AuthSession.test.ts`** (6 tests) drives the real session
  callback — auth.ts is imported and the config it hands to NextAuth captured —
  rather than restating what it ought to do. Its prisma mock exposes only
  `findFirst` and `upsert`, so a regression back to a direct `findUnique` fails
  loudly instead of quietly reintroducing v3.65's bug.
- **New `__tests__/EmailIndexMigration.test.ts`** (5 tests) holds the migration
  to the properties the design assumes: unique over `lower(email)`,
  `IF NOT EXISTS`, no `DROP` of the exact-email constraint, and no rewriting of
  existing rows.
- **Rule 45 is now fully satisfied** — every email→User resolution in the
  codebase goes through `lib/users.ts`, and the database enforces what it
  promises. The remaining `prisma.user.findUnique({ where: { email:
  session.user.email } })` call sites (`/api/profile`, `/api/tickets`,
  `/api/users`, ticket messages) are self-lookups, and the session invariant
  above guarantees they hit.

---

## v3.65 — חשבון אחד לכל אדם

**Three places could quietly give one person a second account. They now all ask
the same question, in one place, and ask it case-insensitively.**

v3.64 fixed a case-sensitive lookup on the מגיש picker and named a second
instance of the same root cause without fixing it. That instance was worse than
the one that got fixed, and there turned out to be a third.

`auth.ts` writes the `User` row with `session.user.email` exactly as Google
handed it over, so a row can carry capitals. Every *other* entry point
normalises the address it is given — a value picked from a dropdown, an inbound
`From:` header — and then matched the row exactly. The miss was not a 404. It
was an `upsert` whose `where` found nothing, so it **inserted**: one person, two
rows, tickets split between them, and only one of the two is the account they
can actually sign in to.

**Verified against production before and after: 96 users, zero mixed-case
addresses, zero case-duplicates.** The bug never fired. It was one capitalised
Google account, or one email from a mixed-case sender, away from firing.

### What changed for users

- **Filing a ticket on somebody's behalf finds their real account**, whatever
  case their address is stored in, instead of creating a parallel one that
  collects the ticket while their own dashboard stays empty.
- **A ticket emailed in lands on the sender's real account.** This is the one
  that would have hurt most: it runs unattended every two minutes, so a single
  mixed-case sender would have accumulated ticket after ticket on an account
  nobody was watching.
- **Deleting a user reassigns their tickets to the real helpdesk account**, not
  to a second one — which would have "reassigned" the tickets and lost them in
  the same breath.

### What changed for developers

- **New `lib/users.ts`** — `findUserByEmail()` (case-insensitive, no create) and
  `resolveUserByEmail()` (find-or-create). Three call sites now share them:
  `POST /api/tickets` (`onBehalfOfEmail`), `POST /api/admin/ingest-mail`
  (the reporter), and `DELETE /api/users` (the helpdesk fallback). v3.64's
  inline `findFirst` in `PATCH /api/tickets` moved onto the same helper.
- **Which helper you want is a real decision.** Use `resolveUserByEmail` where
  the caller may legitimately name somebody who has never signed in. Use
  `findUserByEmail` where they must already exist — the מגיש picker offers the
  roster, so an address off it is a mistake, and 400 says so.
- **Creating still goes through `upsert`, not `create`**, so two requests naming
  the same brand-new address at once collide harmlessly on the unique index
  rather than throwing P2002 at one of the callers.
- **An existing row is never renamed.** The name argument applies on create
  only: a person's own profile edit outranks whatever a mail header or a
  typed-in form field claims they are called.
- **`mode: "insensitive"` was verified against the real database**, not just
  asserted as an argument shape in a mock. `findFirst` matched
  `MORIN@CRISTALINO.CO.IL` to the stored `morin@cristalino.co.il`; `findUnique`
  on the same needle matched nothing. That is the v3.64 fix, observed.
- **This is not a complete fix, and the remaining hole is in the schema.** Two
  addresses differing only in case are still two legal values of a
  `String @unique` column, so a row created concurrently by `auth.ts` with
  capitals can still land beside one of ours. Closing it means a unique index on
  `lower(email)` — raw SQL, run inside the deploy swap window, and its own
  change. What shipped here removes every duplicate the *application* can
  produce.
- **New `__tests__/resolveUser.test.ts`** (8 tests) plus endpoint-level
  regressions in `TicketsAPI` and `UsersAPI`. The onBehalf one was verified
  failing against the old `upsert`.

---

## v3.64 — ליטוש של שינוי המגיש

**A review pass over v3.63. Three things it got wrong or left expensive, and a
bug older than it that it had made inconsistent.**

### What changed for users

- **A ticket no longer costs a full user-table read to look at.** v3.63 fetched
  the roster on every visit to every ticket, for every admin. The picker it
  feeds only exists inside the edit form, and most visits never open it — so
  the fetch now happens on the first עריכה and once per page, not per view.
- **ביטול now actually cancels.** Editing the subject, pressing ביטול, then
  opening עריכה again used to show the discarded text still sitting there —
  and שמור would write it. This predates v3.63; v3.63 made it worse by
  clearing the מגיש field on cancel and nothing else, so half the form reset
  and half did not. The whole form is now restored from the ticket.
- **The confirmation dialog describes the move you are actually making.** After
  staging one change it named the saved owner as the "from" rather than the one
  on screen, so a second pick read as a transition that was not the one about to
  happen.

### What changed for developers

- **The owner lookup is case-insensitive.** `auth.ts` writes `session.user.email`
  from Google verbatim, so a `User` row can carry capitals. v3.63 lowercased the
  incoming address and matched it with `findUnique`, which would answer "המשתמש
  המבוקש אינו רשום במערכת" about somebody plainly registered. Now
  `findFirst` + `mode: "insensitive"` — `findUnique` has no `mode`.
  - **The same latent bug is in v3.56's `onBehalfOfEmail`**, which upserts on a
    lowercased address and would create a second row rather than 400. Not
    touched here: it is a different endpoint with a different failure, and it
    deserves its own change.
- **`editFormFrom(ticket)` is now the one projection** from a ticket payload to
  the edit form, shared by the load path and by cancel. The duplicate inline
  object was how the two drifted apart in the first place.
- **The roster fetch is guarded by a ref, not by `users.length`** — keying the
  effect on the state it sets is how you get a re-run per render.
- **Three regression tests**, each verified failing against the code it
  describes: the roster is not requested before edit mode and is requested once;
  cancel discards a subject edit as well as a staged owner move; the lookup
  goes out case-insensitively.

---

## v3.63 — שינוי המגיש של פנייה

**A ticket filed against the wrong person can now be moved to the right one,
from the edit form, after confirming who it goes to.**

מגיש was the one field on the ticket that could not be corrected. Everything
else — נושא, טלפון, שם מחשב, קטגוריה, פלטפורמה, דחיפות, סטטוס, מוקצה ל — has been
editable for versions; the owner was fixed at the moment the ticket was filed.
That is the field that decides whose dashboard the ticket sits on, so a ticket
opened under the wrong name (an email-ingested ticket that matched the sender
rather than the person it is about, a ticket opened on behalf of the wrong
employee) stayed wrong, and the only way out was to close it and open another.

### What changed for users

- **מגיש is a dropdown while editing.** It lists every registered user, the same
  roster as the "פתיחת פנייה בשם" picker.
- **Choosing somebody asks first.** A dialog names both sides — "המגיש ישונה
  מ*דנה לוי* ל*יוסי כהן*" — and spells out what follows the ticket: it moves to
  that person's ticket list, and the updates about it, including the service
  rating request when it closes, go to them.
- **Nothing moves until you confirm, and nothing saves until you press שמור.**
  ביטול on the dialog leaves the field where it was. Confirming stages the
  change into the edit form like any other field.
- **Only admins see the picker.** Other staff see מגיש as they always have, and
  can still edit every other field.
- **The move is in the ticket's history**, by name: "המגיש שונה: דנה לוי ← יוסי
  כהן", with the admin who did it as the actor.
- **A failed save now says so.** The edit form used to just stay open.

### What changed for developers

- **`PATCH /api/tickets` accepts `ownerEmail`.** Admin-only — a non-admin
  sending one that differs from the current owner gets a 403, and this is the
  only PATCH field gated on `isAdmin` rather than `isStaff`.
- **It does not create users.** `POST`'s `onBehalfOfEmail` upserts, because
  opening a ticket for a new hire before their account exists is real. Correcting
  an existing ticket is not: the picker offers the roster, so an address that is
  not on it is a mistake, and it comes back 400 rather than quietly creating a
  user nobody will ever sign in as.
- **Sending the current owner's address is a no-op**, compared case- and
  whitespace-insensitively. The client's edit form always holds an `ownerEmail`,
  so without this every ordinary staff edit would 403 and every admin edit would
  write a history row saying nothing changed. `saveEdit()` also only puts the
  field on the wire when it actually differs — belt and braces, because either
  side alone is a trap for the next caller.
- **User-facing mail follows the new owner.** The closure/review request, the
  בטיפול notice and the re-open notice are addressed to the post-move owner, and
  `submitterName`/`submitterEmail` in the mail payload come from them too. A
  review request sent to the previous owner would ask the wrong person to rate a
  service they never received. `before.user` is still what the history row
  records — that is the half that is about who it *used* to be.
- **The confirmation is a staged pick, not a post-hoc undo.** `onChange` writes
  to `ownerConfirm`, never to `editForm`; only אישור copies it across. The
  regression tests assert exactly that — that the select still reads the old
  owner while the dialog is open, and that ביטול leaves the save with no
  `ownerEmail` on it. Both fail against a picker that writes through and merely
  shows a dialog; verified failing.
- **New `__tests__/TicketOwnerChange.test.tsx`** renders the real ticket page.
  `__tests__/TicketsAPI.test.tsx` covers the server half: the move, the history
  row, the 403, the 400, the no-op, and the closure mail landing on the new
  owner.

---

## v3.62 — סגירה אוטומטית ששומרת את מה שהיא מדווחת ששמרה

**An automation close that sent a message and a note returned 200 and saved
neither. Both are now written before the response is sent.**

`POST /api/automation/close` created the `TicketNote` and the `TicketMessage`
with `void prisma...create(...)` — started, never awaited. The handler returned
its response and the request context tore down while those writes were still in
flight, so they were abandoned. The status change and the history rows survived
only because they *were* awaited.

Seen in production on 2026-08-23: ticket 523 was closed through the endpoint
with both a `message` and a `note`. The call returned 200, the status and
urgency were correct, both `TicketHistory` rows were there — and there were zero
`TicketMessage` and zero `TicketNote` rows. Both had to be inserted by hand
afterwards.

### What changed for users

- **A closing message from automation actually reaches the ticket.** It appears
  in the chat thread, from staff, where the owner can see it.
- **A technician note from automation is actually kept.** The internal record of
  *why* a ticket was closed by a script stops disappearing.
- **Closure emails are no longer at risk of being dropped.** The review request
  to the owner, the update to the assigned technician and the new-message notice
  were fired the same un-awaited way, so a send still in flight when the request
  ended went nowhere.

### What changed for developers

- **The note and message writes are awaited before the response.** A 200 from
  this endpoint now means the rows are on disk. This is the whole fix: the
  response was making a promise the handler had not kept.
- **The emails and the urgency sweep moved to `after()`** (`next/server`). They
  still do not block the caller, but Next.js now keeps the invocation alive
  until they settle instead of nobody waiting for them. Fully supported under
  `next start`, which is how this deploys; the drain on `SIGTERM` finishes
  pending callbacks before PM2 swaps the process.
- **The distinction that matters:** `after()` is for work whose result the
  response does not claim. A row the response reports as written is not that —
  it has to be awaited. The two `void`s in this file were on the wrong side of
  that line.
- **`__tests__/AutomationClose.test.ts` now drives the real handler.** Every
  test in it was a pure re-statement of the route's logic, which is why a suite
  covering this endpoint could be green while the endpoint silently dropped
  half its writes. The added block imports `POST`, mocks Prisma and mail, and
  asserts on the writes themselves.
- **The regression test gates on ordering, not on invocation.** Asserting that
  `create()` was *called* passes against `void` too. The test holds the note
  create unresolved and asserts the handler has not answered yet — the only
  shape of assertion that fails on the old code. Verified failing against it.

---

## v3.61 — נוהל עזיבת עובד

**A leaving employee now gets a full return checklist, and the ticket refuses to
close until every line on it has been dealt with.**

Offboarding was done from memory. The laptop came back because someone
remembered to ask for it; the second screen at home and the Zoho seat we kept
paying for did not, because nobody remembered they existed. The ticket could be
closed at any point, so "closed" meant "we stopped thinking about it".

### What changed for users

- **A new "עובד עוזב" category.** Choosing it opens the ticket with a checklist
  of **every item on the gear list** — laptop, screen, docking station, and the
  account items too (חשבון Gmail, חשבון Zoho, משתמש קומקס).
- **It is not a selection.** Nobody is asked what the leaver has, and nothing is
  queried from Google or Zoho to find out. The whole list is put in front of the
  technician, because the item that gets forgotten is the one nobody thought to
  ask about. An item this person never had is **removed** from the list by
  staff — a decision someone made, rather than one nobody made.
- **The ticket cannot be closed while a line is open.** The close button is
  disabled and says why, and the checklist card shows what is left. Emptying the
  list entirely is allowed: that is an explicit "there is nothing to return".
- **The card reads for returns, not requests** — "📤 החזרת ציוד וסגירת חשבונות",
  "3 מתוך 12 פריטים טופלו", "טרם טופל" — and ticking a line means the gear came
  back or the account was closed.
- **Refused closes now explain themselves** everywhere, not just on the ticket
  page: closing from the admin queue, the staff list or the dashboard shows the
  server's reason instead of a dropdown that silently snaps back.

### What changed for developers

- **New `lib/offboarding.ts`** (pure): `LEAVING_EMPLOYEE_CATEGORY`,
  `isOffboarding()`, `offboardingChecklist()` (whole option list, deduped,
  one each), `offboardingBlockers()`, `canCloseTicket()`, `blockerMessage()`.
- **No new model.** The checklist is ordinary `TicketEquipment` rows, so the
  tick-off UI, the partial quantities and the polling signature all come for
  free. No migration.
- `POST /api/tickets` builds the checklist **server-side** from the live option
  list and ignores whatever the form sent — a checklist that can arrive short is
  not a checklist.
- **The close guard is server-side in both close paths:** `PATCH /api/tickets`
  returns 400 and `POST /api/automation/close` returns 409, each with the
  blocking labels in `blockers`. A machine caller is not a way around a
  procedure a human is held to. The disabled button is a courtesy.
- **The shortage report excludes offboarding tickets entirely** — gear coming
  back is not gear to buy, and a fresh return checklist would swamp the supplier
  order.
- New `setTicketStatusOrError()` in `lib/ticketApi.ts` (returns the server's
  message instead of a boolean) and `components/ErrorToast.tsx`.
- `FieldOption` seeding back-fills the new category and the DELETE endpoint
  refuses it, same as "עובד חדש".

### Testing

- 530 tests passing across 33 suites (33 new tests; 1 new suite).
- New `__tests__/offboarding.test.ts` (21) — checklist construction and
  deduplication, blocker detection, and the close rule including the
  emptied-list and ordinary-ticket cases.
- `TicketsAPI` gains 9 (the checklist is built from the option list and ignores
  the payload, the 400 with its `blockers`, closing once ticked, non-closure
  status changes untouched, ordinary tickets never even read the checklist);
  `EquipmentAPI` and `FieldOptionsSeed` gain the exclusion and protection cases.

---

## v3.60 — מחיקת פנייה (מנהלים)

**An admin can now delete a ticket outright, after confirming what disappears
with it.**

Test tickets, duplicates and ones opened by mistake had no way out — closing
them left them in the archive and in every count. Deleting straight from the
database meant leaving orphaned attachment files on disk.

### What changed for users

- **A small red "🗑 מחק" button** in the ticket header, next to "העתק קישור".
  **Admins only** — non-admin staff still close and edit, they do not erase.
- **It always asks first.** The dialog names the ticket and spells out what goes
  with it — history, notes, messages, attachments and equipment requests — and
  points at "סגור פנייה" for a ticket that was merely handled. There is no undo,
  so the confirmation is a stop, not a toast.

### What changed for developers

- **New `DELETE /api/tickets/[id]`** — admin-only (401 / 403 / 404 / 200).
  Accepts both `HDTC-N` and a raw id, like the GET beside it.
- **Attachment bytes are removed first.** Child rows are covered by
  `onDelete: Cascade`, but attachment files have lived on disk since v3.48. A
  file that is already missing is swallowed rather than stranding the ticket.
- **New `logInfo()` in `lib/logError.ts`** (level `info`, same table). The
  ticket's own `TicketHistory` cascades away with it, so the deletion itself is
  recorded in the log: who deleted which ticket, and when.

### Testing

- 497 tests passing across 32 suites (12 new tests; 1 new suite).
- New `__tests__/TicketDeleteAPI.test.ts` — the authorization matrix (anonymous,
  owner, non-admin staff, admin), HDTC-N and raw-id lookup, on-disk file removal
  including the already-missing case, and the audit entry (plus the absence of
  one when the delete itself fails).

---

## v3.59 — פרטי העובד החדש נדרשים בפנייה

**A ticket for a new employee now collects the hire's first name, last name,
phone and job description — and writes them into the description.**

An onboarding ticket is really an account-creation request, but nothing forced
it to say *who* the account is for. "צריך לפתוח משתמשים לעובד חדש" arrived with
no name, no phone and no role, and the technician's first move was always to
reply asking for the three facts they needed before they could start.

### What changed for users

- **Picking the "עובד חדש" category reveals four required fields** — שם פרטי,
  שם משפחה, טלפון העובד, תיאור תפקיד. The ticket cannot be sent until all four
  are filled. Change the category back and they disappear.
- **The details are added to the description**, as a labelled block under the
  free text. That means they travel with every notification email, the reply
  chain and anything else that already carries the description — nowhere new to
  look.
- **The ticket page shows them as their own card** ("🧑‍💼 פרטי העובד החדש")
  rather than as raw text in the middle of the description.
- **The shared /open page catches up.** It had a hardcoded category list, so
  every category added since it was written — "עובד חדש" among them — was
  invisible there. It now reads the live admin-managed list, and it gained the
  equipment checklist that the dashboard form got in v3.58.

### What changed for developers

- **New `lib/newEmployee.ts`** (pure): `normalizeNewEmployee()` (trims, collapses
  a pasted multi-line value to one line, caps at 200 chars),
  `missingNewEmployeeFields()` / `missingFieldLabels()`,
  `formatNewEmployeeBlock()`, `withNewEmployeeDetails()` (idempotent — rewriting
  replaces the block rather than stacking a second one),
  `stripNewEmployeeBlock()`, `parseNewEmployeeBlock()`.
- **No migration.** The details live in `Ticket.description` behind the header
  line `── פרטי העובד החדש ──`, one `label: value` line per field. The text is
  authoritative; parsing is best-effort for display, so a technician editing the
  block by hand is showing everyone exactly what they typed.
- `POST /api/tickets` accepts `newEmployee: { firstName, lastName, phone,
  jobTitle }` and **rejects an onboarding ticket with 400** when a field is
  blank, listing the missing Hebrew labels in `missing`. The browser's
  `required` is not the enforcement — a lone space satisfies it.
- **New `components/NewEmployeeFields.tsx`**, shared by the dashboard form and
  /open; input and label styles come in as props because the two hosts style
  their controls differently.
- `PATCH /api/tickets` is deliberately unchanged: staff editing a ticket into
  the onboarding category are not blocked, and the block they edit by hand is
  kept verbatim.

### Testing

- 485 tests passing across 31 suites (48 new tests; 1 new suite).
- New `__tests__/newEmployee.test.ts` (34) — normalisation, whitespace-only
  detection, round-tripping the block, idempotent rewrite, and stripping.
- `TicketsAPI` gains 8 tests (folding into the description, the 400 and its
  `missing` list, ordinary tickets left alone, details reaching the emails);
  `TicketForm` gains 6 (fields appear and disappear with the category, payload,
  whitespace-only guard).

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
