# Release Notes

Newest first. Versions before 3.56 are recorded in the version table in
[HANDOFF.md](HANDOFF.md) and in `git log --oneline`.

---

## v3.81 — משויכות אליי: הפניות שבטיפולכם, בלוח האישי

**Staff see the tickets assigned to them on the dashboard again — in a section
of their own, apart from the tickets they opened.**

Reported from production: *"I can't see open tickets that are assigned to me"*
on `/dashboard`. Checked read-only against the database: **22 open tickets
assigned to `alon@` — 5 פתוח, 11 בטיפול, 6 בהמתנה — none of them opened by
him, and none on his dashboard.**

The cause is v3.72. It made `GET /api/tickets` answer "mine" —
`where: { userId }` — for every role, which was right: an admin's לוח אישי had
been an unlabelled copy of the entire queue. But before that change, the only
reason a technician saw the tickets *assigned* to them there was that they saw
*every* ticket. Removing the flood removed the signal with it. v3.72's commit
message never mentions assigned tickets; this was an oversight, not a decision.

### What changed for users

- **Staff get "משויכות אליי" at the top of their dashboard** — every ticket
  assigned to them that is not closed, on-hold included, each card naming whose
  ticket it is, with a link through to כל הפניות. "Staff" means admins and
  `STAFF_EMAILS`, the same rule as everywhere else. When nothing is assigned the
  section is not drawn.
- **A divider separates the two lists** — a line with the brand's lime dot at
  its centre, between the tickets you are handling and the tickets you opened.
  A plain hairline would not have done it: every card on the page already has
  one, so the break between two lists has to be a different kind of line.
- **Employees see no change**, and their browser never asks for the list.
- **The new cards have no close or reopen button.** On the dashboard those
  buttons are the *owner's* — close anytime, reopen within four weeks. A ticket
  you are handling is worked from its own page, where closing it assigns and
  compound-closes as staff.

### What changed for developers

- **New `GET /api/tickets/assigned`** — staff only (403 for employees *and*
  viewers, unlike `/api/tickets/all`: nobody assigns work to a read-only
  observer), `assignedTo` equal to the caller case-insensitively, `status` not
  סגור, owner included.
- **A route of its own, not an `OR` in `/api/tickets`.** The two lists take
  different actions, and `/api/tickets` keeps the v3.72 guarantee its tests
  assert — every call scoped by owner. Those tests are untouched.
- **The stat cards, search and HDTC-number suggestion still cover only the
  caller's own tickets.** They count *your requests*; folding in *your work*
  would make "פתוחות: 27" mean nothing in particular.
- **The docs were wrong about this endpoint before this release.** ARCHITECTURE's
  route table and authorization matrix still said `GET /api/tickets` returns
  every ticket to an admin — false since v3.72. Corrected, and the new route
  added to the table, the matrix and the diagram.
- **New `__tests__/AssignedTicketsAPI.test.ts`** (12 tests) — who may ask, and
  exactly what comes back. **New `__tests__/DashboardAssigned.test.tsx`**
  (9 tests) drives the real page: the reported case, the divider and its
  position between the two lists, the owner's name on each card, no close button on assigned cards while your own ticket keeps its one,
  no request at all from an employee, and a failed request — the maintenance
  page mid-deploy — leaving the rest of the page intact.
- **`/` no longer crashes when auth is misconfigured.** `app/page.tsx` checked
  `if (!session)` and then read `session.user.isAdmin`. With `AUTH_SECRET`
  missing, `auth()` returns a truthy object with no `user`, so the root page
  threw *"Cannot read properties of undefined (reading 'isAdmin')"* instead of
  sending the visitor to /login. It now checks `session?.user`. Found on a dev
  server started in a git worktree, which has no `.env` / `.env.local` — both
  are gitignored. New `__tests__/RootRedirect.test.ts` (5 tests).
- **The other errors reported with it were the same failure, seen from other
  places.** NextAuth's `MissingSecret` / `assertConfig` and the browser's
  `ClientFetchError` are the missing `AUTH_SECRET` itself. React's *"Encountered
  a script tag while rendering React component"*, pointing at the v3.80 theme
  script in `app/layout.tsx`, is downstream too: it fires only because the
  server render had already failed and React rebuilt the whole tree on the
  client. With the secret in place a fresh tab's console is empty. The layout
  was not changed.
- No migration.

---

## v3.80 — מצב כהה, עם מתג שזוכר

**The app now has a dark theme and a switch on the top bar. Light stays the
default: nobody gets dark until they ask for it, including on a laptop that is
set to dark.**

### What changed for users

- **A switch in the top bar**, next to the copy-link button, at every width.
  It shows which mode you are in rather than which one you could switch to, and
  it is a real `switch` for a screen reader, not a button.
- **The choice sticks.** It survives a reload, a new tab, and tomorrow morning.
  Change it in one tab and the others follow.
- **No flash.** The page is already the right colour on the first frame, not
  after a beat of white.
- **Notification email is unchanged and stays light.** An email should look the
  same in everybody's inbox, and it will not follow the switch.

### The obstacle, and the shape of the fix

Every page here styles itself inline (rule 2), and **an inline style cannot be
re-targeted**. There is no stylesheet to override `style="color:#374151"` from
— not with a media query, not with a `[data-theme]` selector. The one thing
that does reach inside an inline style is a CSS custom property, so:

- **New `lib/palette.ts`** holds every colour twice, light and dark, and emits
  them as two blocks of custom properties (`:root` and
  `:root[data-theme="dark"]`). `DARK` is typed against `LIGHT`, so a token
  added to one and forgotten in the other is a compile error, not a colour that
  vanishes in one mode.
- **`lib/theme.ts` keeps its shape.** `T`, `HDR`, `STATUS`, `URGENCY` all still
  exist with the same names; their values are now `var(--c-…)` instead of
  hexes. No call site had to change.
- **Toggling re-paints without re-rendering.** The theme is one attribute on
  `<html>`; React is not involved in the colour change at all.

### 1,521 colours were typed inline

The token system covered about a fifth of the app's colour. The rest — 1,521
literals across 27 files — was typed in place, and every one had to be found
and given a token, because a hex that stays behind is a hex that stays *light*
when the lights go out.

The replacement was property-aware, because the same literal meant opposite
things in different places: `background: "#fff"` is a surface and becomes
`#191C22` in dark mode, while `color: "#fff"` is text on something dark and
becomes near-black. `T.dark` had the same problem in the other direction — it
was both the ink you write with and the dark block you write *on*, so it is
gone, replaced by `T.text` and the `T.inverseBg` / `T.inverseText` pair. Its 22
call sites were decided one at a time.

**`__tests__/Palette.test.ts` now refuses a raw hex anywhere under `app/` or
`components/`**, which is what stops the problem growing back. Google's own
sign-in mark is the one exemption — their brand, not our palette.

### Light mode did not move

This was meant to add a theme, not to restyle the app people already use, so
the historical values are pinned in a test, token by token. The one place that
took real care: **the app has always had two grey ramps** — the warm one on `T`
(`#5B6260`, `#9AA09C`) and a cooler, darker one typed inline (`#374151`,
`#6B7280`). An early pass folded them together, which shifted every secondary
label in the app and was caught by the mail test. They are now kept apart:
`T.text2` is still the warm grey it always was, and the cool one has its own
tokens (`T.ink`, `T.inkMuted`, `T.inkFaint`, `T.inkFainter`).

Near-duplicates *within* a role were consolidated — five near-white fills onto
one, four Tailwind border greys onto two. Those shifts are at most a couple of
RGB steps and are listed by the migration's own report.

### Things that deliberately do not flip

- **The top bar** was always dark; in dark mode it sits a step *above* the page
  so it still reads as a bar.
- **The raw-log console** on /admin. A console is dark in both themes.
- **The login page's panel**, which is dark by design rather than by theme.
- **The white chip behind the logo** — the JPEG has a baked-in white
  background, and a themed chip would put a bright rectangle around it.
- **Text on the lime green** (`T.onGreen`), because the lime is light in both.

### What changed for developers

- **New `lib/themeBoot.ts`** — theme constants, `themeBootScript()`,
  `applyTheme()`. Deliberately *not* a client module: `app/layout.tsx` is a
  Server Component and has to call `themeBootScript()` from there. Splitting
  this out is what fixes "attempted to call themeBootScript() from the server".
- **New `lib/useTheme.ts`** (client) — `useSyncExternalStore` over the `<html>`
  attribute rather than `useState`, so every switch on a page agrees with every
  other one without sharing a parent, and cross-tab changes land too.
- **New `components/ThemeToggle.tsx`** — the knob travels with
  `inset-inline-start`, not `translateX`: a positive `translateX` is toward the
  physical right whatever the direction is, which on this RTL page would drive
  the knob off the end of the rail. Motion is dropped under
  `prefers-reduced-motion`.
- **`app/layout.tsx`** renders the palette in a `<style precedence>` (React 19
  hoists it into `<head>`) and the boot script inline as the first thing in
  `<body>`. `suppressHydrationWarning` on `<html>` is required: the server
  cannot know the visitor's choice, so the attribute is deliberately outside
  React's control.
- **`lib/mail.ts` imports `LIGHT` directly**, not `T`. Email clients have no
  `:root` of ours and Gmail and Outlook have no custom properties at all, so
  `var(--c-card)` in an inbox is simply an unresolved colour.
- **`__tests__/ThemeToggle.test.tsx`** (14 tests) covers the default, the boot
  script as the string it actually is, persistence in both directions,
  keyboard operation, two switches staying in step, and localStorage throwing
  in private mode.

1,014 tests / 51 suites green. No migration.

---

## v3.78 — למה יש פניות סגורות בלי תאריך סגירה

Reported as "the export sometimes has no closing date". It is real, there are
three distinct causes, and **one of them was still happening**.

### Where a closing date comes from

`Ticket` has no `closedAt` column. The date is derived from the ticket's
history: the latest `TicketHistory` row with `field = "status"` and
`newValue = "סגור"`. No row, no date — anywhere, for good.

### Cause 1 — the writes were not atomic *(fixed)*

`PATCH /api/tickets` and `/api/automation/close` each did this:

```ts
await prisma.ticket.update(...)          // the ticket is now closed
// ...
await prisma.ticketHistory.createMany(...) // and now we record it
```

Two round trips, **no transaction anywhere in the application**. Anything
interrupting the process between them — a deploy, a pm2 restart, a dropped
connection — persisted the closure and lost its record. The ticket is closed;
nothing says when; nothing is logged. It is invisible until someone opens a
spreadsheet weeks later.

Both are now a single `$transaction`: the status and the row that records it,
or neither. `__tests__/TicketsAPI.test.tsx` asserts it, and that assertion was
mutation-tested by splitting them apart again — two tests go red. Without it,
every test passes either way, which is exactly how this survived so long.

### Cause 2 — tickets closed before the history table existed *(not fixable)*

Tickets date from migration `20260407073347_init`. `TicketHistory` arrived in
`20260426071446_add_ticket_history`, nineteen days later. Anything closed in
that window has no row and never can: the information was never recorded.

### Cause 3 — closed outside the API *(not fixable retroactively)*

Direct database edits and one-off scripts. Not a hypothesis: the urgency sweep
in `/api/automation/close` already exists to clean up after them, and its own
comment cites "direct DB edits, legacy scripts".

### Counting them

[`scripts/audit-close-dates.mjs`](scripts/audit-close-dates.mjs) — read-only,
run it on the server:

```bash
cd /home/ubuntu/helpdesk
node scripts/audit-close-dates.mjs          # summary by cause
node scripts/audit-close-dates.mjs --list   # every affected ticket
```

It sorts every closed-without-a-date ticket into **LEGACY** (created before the
history table), **LOST WRITE** (has other history but no closure row — the
non-atomic bug) and **NO HISTORY** (no rows at all — closed outside the API),
and says how many LOST WRITE tickets were touched in the last 30 days. That
last number is the one that matters: if it is zero, the fix above has nothing
left to prevent and the rest is archaeology.

### The export no longer hides it

A blank cell was doing two jobs: "still open" and "closed, but nobody recorded
when". The column now has three states, and says the third one out loud —
**נסגרה — התאריך לא תועד**. A reader can tell an incomplete record from a
broken export.

### Tests

8 new tests; 850 across 49 suites.

---

## v3.77 — מספר הפנייה, בידיים של מי שפתח אותה

The ticket number is the only handle anyone has on a ticket. It is what the
support team asks for on the phone, what every email about it leads with, and
what somebody needs when they come back three days later to ask what happened.
Until now the dashboard just closed the form and refreshed a list — the number
existed, but nowhere the person who had just typed the ticket could see it.

Opening a ticket now ends in a confirmation that **hands the number over**:

- `HDTC-565`, large, in the brand green, and selectable with one click;
- **העתק מספר** and **העתק קישור** — the bare number for a phone call, the full
  URL for a message to a colleague;
- and a plain sentence saying they will be asked for it. That line is the
  reason the dialog exists at all; showing a number nobody knows to keep is the
  same as not showing it.

### One card, two placements

[`components/TicketCreated.tsx`](components/TicketCreated.tsx) is the content;
`TicketCreatedDialog` is that card in a modal. The dashboard uses the modal,
because its form sits on a page that still has everything else on it. `/open`
renders the card inline, replacing the block it had hand-rolled — on that page
the confirmation *is* the page, and a modal over an empty background is a
dialog about nothing. Either way the wording and the copy buttons come from one
place and cannot drift.

### A copy button that never lies

`navigator.clipboard` is unavailable over plain HTTP and can be **refused** even
over HTTPS. A copy button that quietly does nothing is worse than no button: the
reader walks away believing they have the number. So every press reports what
happened — **הועתק!** on success, **בחר והעתק** on failure, with the text
selected so it can be copied by hand. Both paths are tested, including a browser
with no clipboard API at all.

`onSuccess` on `TicketForm` now receives the created ticket rather than being
called empty. Jest transpiles through SWC and does not typecheck, so a
regression there would not have failed a test — it is asserted directly.

### Tests

17 new tests; 842 across 49 suites.

---

## v3.76 — ייצוא לאקסל

**ייצוא לאקסל** on `/admin/reports`, with three scopes: everything, the range
currently on screen, or a single ticket by number (which takes `HDTC-565` as
readily as `565`).

### It is a real .xlsx, and that is the point

A CSV would have been a tenth of the code and would have quietly corrupted this
dataset. Excel strips the leading zero from `0528287036` the moment it decides
a column is numeric, and Hebrew arrives as mojibake without a UTF-8 BOM that
half the tools downstream then choke on. A workbook lets each cell declare its
own type, so a phone number stays the string it is.

[`lib/xlsx.ts`](lib/xlsx.ts) writes one, in about 200 lines and with **no new
dependency**. A single-sheet workbook is a zip of five small XML files; the
alternatives are large, and one of them is no longer published to npm at all.
Every zip entry is **stored, not deflated**, so no compression code is needed
and the same writer runs in the browser and on the server.

Verified by reading the output back, not by trusting the code that wrote it:
the test suite parses it with its own zip reader, and the file was additionally
opened with `openpyxl` — an independent OOXML implementation — which returns
`'0528287036'` as a string and `565` as an int.

### What is in it

Sixteen columns, including the ones the reports page deliberately does **not**
carry: subject, description, reporter, their phone, hours to close. That is why
the export has its own endpoint rather than reusing the page's data — the page
fetches the whole history on every load and every byte is paid for by everyone,
while an export is a deliberate act that happens once and can afford a round
trip.

The sheet opens right-to-left with the header row frozen and a filter on.
Dates are `YYYY-MM-DD HH:mm` in Israel time as text, which sorts
chronologically without the `styles.xml` machinery real Excel serial dates
require.

`closedAt` is resolved exactly as the reports route resolves it — the latest
transition to `סגור`, only for tickets closed now. Asserted, because if the two
ever disagree the spreadsheet and the chart above the button tell different
stories about the same day, and the spreadsheet is the one people forward.

### Each option is a link

Not a scripted navigation: an anchor is the element that means "download", it
can be opened in a new tab or copied, and there is no blob or object URL to
leak. The single-ticket option renders no anchor at all until a number is
typed — a link to an export of nothing is worse than no link.

### Tests

52 new tests; 825 across 48 suites. The zip signature and entry list, the cell
types (that phone number above all), the escaping, sheet-name sanitising, every
scope including the malformed ones, the download headers, and the menu's links
carrying the scope the reader actually chose.

---

## v3.75 — מייל אחד, מדריך אחד, ומסמך מסירה

### Every mail wears the same face

v3.67 rebuilt the two new-ticket templates on the Cristalino palette and left
the other eight carrying Tailwind's default greys and a blue accent. The frame
was branded; the contents were not. Which design you got depended on which mail
it was — a status change looked like a different product from the one that
opened the ticket.

39 colour values across the remaining templates now resolve from
[`lib/theme.ts`](lib/theme.ts) rather than being hardcoded, so a re-brand
reaches all ten. The status oranges and reds in the daily digest are deliberately
**not** in that sweep: they carry meaning (⏰ stale, 🔴 overdue).

**And a real defect, found by rendering them:** the eight older templates
interpolated free text unescaped. A `<` in a ticket subject or a reply truncates
the rest of the message in most clients — the same bug v3.67 fixed in the two it
touched. 23 interpolations now go through `esc()`.

### One manual

There were three pages: `/help` (a user guide), `/manual` (a second, printable
user guide saying much the same) and `/admin-manual` (the support team's).
Whether you found the page that answered your question depended on which link
you happened to click, and one of the three was always the least up to date.

`/help` is now the only one. The support team's half is
[`components/AdminGuide.tsx`](components/AdminGuide.tsx), rendered from the
session for admins and `STAFF_EMAILS` — a server component, so a reader who may
not see it is never sent the markup at all. `/manual` and `/admin-manual`
redirect rather than 404: they are bookmarked, printed and linked from old mail.

The page now carries **חזרה למסך הראשי** at the top and bottom. It is long, and
it is the page people reach when they are already stuck.

The two guides keep their own `Section`/`Steps`/`Note` helpers rather than
sharing: both files had `Steps` and `Note` with *different* props, and unifying
them meant rewriting every call site in both — a large diff across
documentation, for nothing a reader would see.

The nav loses its separate מדריך מנהל entry. Two links to one page is how it
drifted apart in the first place.

### A handoff document

[`docs/GEMINI-HANDOFF.md`](docs/GEMINI-HANDOFF.md) — the operational companion
to `ARCHITECTURE.md`: the domain rules that are easy to break, every deploy
path, the release convention, what changed across v3.67–v3.75, and the known
gaps.

**It contains no secret values, and it says so at the top.** This repository is
on GitHub. Every credential is *named and located* — which file on which server,
which console issues a new one — never quoted.

### Tests

17 new tests; 773 across 46 suites. The shared mail identity (including that no
template carries the old greys or blue), the escaping in the templates v3.67 did
not touch, and `/help` showing the support guide to admins and staff while
hiding it from everyone else.

---

## v3.74 — «סגירת משתמש», ומערכת שמציעה אותה בעצמה

### The category is renamed

`עובד עוזב` → **`סגירת משתמש`**, which is what people call it.

The label is not decoration: `lib/offboarding.ts` matches on this exact string
to decide whether a ticket is an offboarding — which is what builds its
checklist and what blocks its closure. So this is a data migration, not a
rename. `20260906120000_rename_leaving_employee_category` moves the dropdown
option **and** the category on every ticket already filed. Without the second
half, existing offboarding tickets would have kept a category nothing matches:
their checklist would have stopped being enforced and they would have become
closable with lines still unticked.

The `FieldOption` update is guarded against the new label already existing —
that table has `UNIQUE (field, label)`, and an unguarded `UPDATE` aborts the
whole migration rather than skipping.

### The form now offers it

The category is a dropdown nobody reads. An offboarding gets filed as `אחר`
with *"סגירת משתמש ליוסי"* in the subject, and the checklist that would have
caught the Zoho seat is never built. So the form watches the text being typed —
subject and description — and when it reads like a user closure, a panel
appears under the subject with a **השתמש בקטגוריה** button that applies it, and
a ✕ that silences it for that ticket.

It **offers, never imposes**. The person may have a reason for their choice,
and a form that rewrites your selections is worse than one that suggests.

Matching is by phrase, not keyword: `סגירה` alone appears in every third ticket
(*"סגירת הפנייה"*, *"סגירת חלון"*), and a hint that fires on noise is one people
learn to dismiss without reading. `OFFBOARDING_PHRASES` carries the wordings
that actually occur — including **`עובד עוזב`**, because that is what this
category was called until today and people will keep typing it for a long time.

### Tests

15 new tests; 756 across 46 suites — the matcher (including the phrases that
must NOT fire) and the button end to end: it appears, it applies the category,
it then gets out of the way, it stays dismissed, and it never changes the
category by itself. The tests that hardcoded the old label now reference
`LEAVING_EMPLOYEE_CATEGORY` instead, so the next rename is one edit; the single
test that pins the literal string does so deliberately, because stored data
depends on it.

---

## v3.73 — מדווח שעות קומקס נכנס לרשימת הסגירה

Closing an employee's accounts is already a ticket type: the **עובד עוזב**
category, which is born with a checklist of every item on the equipment list
and **cannot be closed until every line is ticked** (enforced server-side in
`PATCH /api/tickets` and the automation close endpoint — the disabled button is
a courtesy, not the rule).

That checklist already carried `חשבון Gmail`, `חשבון Zoho` and `משתמש קומקס`
alongside the hardware. One thing was missing, and it is exactly the kind of
item this feature exists to catch: **the Comax time-reporter is a separate seat
from the Comax user, billed separately, and closing the account does not
release it.** It is now line 13.

```
 1. מחשב            8. אוזניות
 2. מחשב נייד       9. טלפון נייד
 3. מסך            10. חשבון Gmail
 4. מסך שני        11. חשבון Zoho
 5. עכבר           12. משתמש קומקס
 6. מקלדת          13. מדווח שעות קומקס   ← new
 7. תחנת עגינה
```

### Why it needed more than one line of code

`DEFAULT_EQUIPMENT` seeds a field **only when that field is empty**, so adding
a value to it reaches new installs and never the running one. The endpoint
already has the mechanism for this — `REQUIRED_LABELS`, which back-fills
individual values into already-populated fields with
`createMany` + `skipDuplicates` (not `create`: every signed-in page load hits
this endpoint, and two first-loads racing would collide on the `(field, label)`
unique index and take out every dropdown in the app). The new line is
registered there, so it appears on the next page load.

It is also an ordinary `FieldOption`, so it can be renamed or removed from
**שדות מערכת** like any other, and an ex-employee who never had the seat has
the line struck off by staff — a decision someone makes, rather than one nobody
makes.

### Tests

2 new tests; 741 across 46 suites. Mutation-tested by deleting the
`REQUIRED_LABELS` entry and confirming the back-fill test went red — without it
the line would have been invisible in production while passing every test.

---

## v3.72 — «לוח אישי» הוא שוב אישי

Three items in the nav did nearly the same thing, and for one group of people
two of them were **identical**: `GET /api/tickets` branched on `isAdmin` and
returned the entire table, so `/dashboard` — the page called *לוח אישי* — showed
an admin every ticket in the system. It was the queue again, drawn as cards
instead of rows, under a name that promised something personal.

### What changed

**`GET /api/tickets` now answers "mine", for everyone.** No role branch. The
whole queue was never in question and is untouched: `GET /api/tickets/all`
serves it to admins, `STAFF_EMAILS` and `VIEWER_EMAILS`, with the *identical*
`orderBy` and `user` include the deleted branch had — which is why `/admin` was
simply repointed at it and its queue tab shows exactly what it did before.

**`/admin` is now `ניהול מערכת`, not `ניהול פניות`.** Only one of its seven tabs
is the queue, and the queue is `כל הפניות`. The rest is users, licences,
printers, missing equipment, system fields and the error log — none of it about
an individual ticket. Its page header said `כל הפניות` too, which had quietly
become the name of a different page.

So the three are now distinct:

| | who | what |
|---|---|---|
| **לוח אישי** | everyone | the tickets you opened |
| **כל הפניות** | admin · staff · viewer | the whole queue, as a working table |
| **ניהול מערכת** | admin | users, licences, printers, equipment, fields, log |

### Also fixed on the way past

The user lookup in that endpoint was a bare `findUnique` on the session
address. Since v3.66 `auth.ts` stores the lowercased address so it worked, but
a row created before that may carry capitals — and a miss here returns an empty
dashboard rather than an error, which is the kind of bug nobody reports. It now
resolves through `lib/users.ts` like every other entry point.

### Tests

5 new tests; 739 across 46 suites. They were mutation-tested by restoring the
`isAdmin` branch and confirming two went red — the previous test for this
endpoint was called *"returns all tickets for admin"* and passed against either
behaviour, because its mock ignored the `where` clause.

---

## v3.71 — למדריך המנהל יש עכשיו שומר

`/admin-manual` was the only page in the application with **no access guard at
all**. Every other admin page redirects a stranger; this one rendered for
anybody who knew the URL — and what it renders is a detailed tour of the admin
panel: which tabs exist, what each one does, which endpoints back them, how the
crons are wired. Its own badge says *Staff Only*.

An audit of all seventeen pages found the other unguarded routes are
deliberately public: `/open` is the link the copy button shares,
`/review/[ticketId]` is reached by an unguessable CUID from a rating email,
`/help` and `/manual` are the end-user documentation, and `/login` cannot
require a session. Only the manual was an oversight.

### The guard is server-side

```ts
const session = await auth()
if (!session?.user) redirect("/login")
if (!session.user.isAdmin && !STAFF_EMAILS.includes(session.user.email ?? "")) redirect("/dashboard")
```

The other admin pages guard in a `useEffect`, which renders the page and *then*
navigates away — the content reaches the DOM either way. This page is a server
component, so it follows [`app/page.tsx`](app/page.tsx) instead and settles the
question before any HTML is sent. The route consequently moves from static
(`○`) to dynamic (`ƒ`) in the build output, which is correct: its output now
depends on who is asking.

Audience is the support team as the page defines it in its own opening line —
admins **and** `STAFF_EMAILS`, the same pair `/admin/logs` admits. The nav was
updated to match, so staff now see מדריך מנהל: the rule that a link must never
lead to a redirect cuts both ways, and a page someone may open should be
reachable.

### Tests

6 new tests; 734 across 46 suites. They were mutation-tested by removing the
guard and confirming four of them went red — a guard test that passes against
an unguarded page is worse than none.

---

## v3.70 — סרגל ניווט אחד

**Which links you saw depended on the page you were standing on, not on who you
are.** The dashboard offered עזרה and צרו קשר but no דוחות. `/admin` offered
דוחות and לוג שגיאות but no כל הפניות. `/admin/reviews` offered a single link
back to the dashboard. Seven pages, seven hand-rolled rows of links, drifting
apart every time one of them gained a feature.

There is now one component — [`components/AppNav.tsx`](components/AppNav.tsx) —
and one list, derived from the session:

| | admin | staff | viewer | user |
|---|---|---|---|---|
| לוח אישי · עזרה · צרו קשר | ✓ | ✓ | ✓ | ✓ |
| כל הפניות | ✓ | ✓ | ✓ (read-only twin) | |
| לוג שגיאות | ✓ | ✓ | | |
| ניהול פניות · דוחות · ביקורות · מדריך מנהל | ✓ | | | |

### The bug inside the bug

The dashboard gated כל הפניות on `STAFF_EMAILS.includes(email)`. The page
behind it admits `isAdmin || STAFF_EMAILS`. So an admin who was not also on the
staff list had no link to the ticket queue anywhere in the interface — the page
would have let them straight in.

That is the failure mode this component is built against, so `navLinksFor()` is
pure and exported, and [`__tests__/AppNav.test.tsx`](__tests__/AppNav.test.tsx)
holds it against the guards on the pages themselves. **A link that leads to a
redirect is worse than no link**, and a page an admin may open but cannot reach
is worse still.

### What else changed

Nine links stop fitting well before a phone, so below 1180px the row folds into
the ☰ menu — rendering *the same list from the same source*, rather than the
parallel mobile menu each page used to carry and forget to update.

Removing the old rows took a duplicate mobile dropdown out of three pages
(unreachable already: nothing set `menuOpen` once its button was gone) and
around a dozen orphaned imports and pieces of state with it.

### Tests

28 new tests; 728 across 45 suites. Four existing suites needed `usePathname`
added to their `next/navigation` mocks, since the shared nav highlights the
current page.

---

## v3.69 — שני תיקונים מיומן השגיאות

Both of these came straight out of `/admin/logs`, and both were silent: one
crashed a page the reader was already looking at, the other lost mail without
telling anyone.

### The reports timeline crashed when the range narrowed

```
Cannot read properties of undefined (reading 'opened')
```

`hover` is an index into the bucket array, and it outlived the buckets it was
taken from. Hover over day 40 of a 90-day range, then switch to חודשי — four
buckets — or drag-zoom into a shorter window, and `buckets[40]` is gone. The
markers for the hovered point read `[key]` straight off it and the chart threw.

Everything now reads a single resolved `hovered` bucket, which is `undefined`
when the index no longer exists. Resetting the index in an effect would not have
helped: an effect runs *after* the render that would already have crashed.
Letting it resolve to `undefined` is also the behaviour you want — the crosshair
lets go until you move the pointer, because it is no longer over the date it was
marking.

### A busy Gmail silently dropped notifications

```
Mail send failed: Invalid greeting. response=421-4.4.5 Server busy, try again
later. (smtp.gmail.com)
```

SMTP splits replies by first digit: 4xx means *temporary, try again*, 5xx means
*permanent, do not*. Gmail reaches for 421 under load. `sendMail` tried once,
logged, and dropped the message — so a ticket was created and nobody was told.

It now retries the failures Gmail itself calls temporary — three attempts, 2s
then 8s apart — and still gives up immediately on the permanent ones, because a
550 for a bad address will reject identically three times and only spam the log.

Classifying that is fiddlier than reading `responseCode`, because the failure in
the log never got that far: it is an `EPROTOCOL` greeting error carrying the
code only in its text. `isTransientMailError()` checks the numeric code, then a
permanent code anywhere in the message (which wins), then a temporary one, then
the connection-level error codes. Anything it cannot classify is not retried —
better one log line than hammering Gmail over something we do not understand.

### Also: deploy.ps1 could not be parsed by Windows PowerShell 5.1

The PowerShell deploy script shipped with em dashes in its comments. **Windows
PowerShell 5.1 reads a `.ps1` with no byte-order mark in the system ANSI
codepage, not UTF-8** — so each em dash arrived as `â€"`, terminated the string
it sat in, and the parser read the rest of that line as code, which is how a
`>` in the OpenSSH message became a redirection operator.

The file is now pure ASCII, which sidesteps the encoding question entirely
rather than depending on a BOM. Verified by decoding it both ways and comparing:
identical, because there is nothing above 0x7F left in it.

Worth knowing for anything else added there: **PowerShell 7 defaults to UTF-8
and parses the broken file happily**, so a syntax check on a modern shell does
not reproduce this. `__tests__/deployScripts.test.ts` asserts it at the byte
level instead, and also pins the two deploy scripts against drift — the archive
they build, their defaults, and their `DEPLOY_*` overrides all have to match, so
a deploy from one can never ship a different tree than a deploy from the other.

### Tests

26 new tests; 700 across 44 suites. The chart test reproduces the crash by
hovering a 90-bucket range and re-rendering with a shorter one — it failed with
the exact production message before the fix. The drift guard was mutation-tested
by adding a file to one script's archive list and confirming it went red.

---

## v3.68 — דוחות: פניות לאורך זמן, לפי סוג, עם תובנות

**The system has recorded every ticket since it went live and could not answer
"how many did we open last month, and what were they?" without exporting to a
spreadsheet.** `/admin/reports` answers it on one screen: a timeline you can
drag, breakdowns by five dimensions, and the numbers read back in plain Hebrew.

### What changed for users

Admins get a **דוחות** link in the admin nav (desktop and mobile). The page has
three parts, all scoped by one filter row:

- **Timeline** — a line for tickets opened, a line for tickets closed, and an
  optional cumulative line for the open queue. Presets (7 / 30 / 90 days, year,
  everything) or explicit dates; day, week or month resolution. **Dragging
  across the chart zooms into that period.** Hovering puts a crosshair on the
  nearest date and reads out every series at once; «הצג כטבלה» shows the same
  numbers as a table.
- **פילוח הפניות** — ranked bars by category, urgency, platform, status or
  assigned technician, each with its count and share.
- **תובנות** — closure rate, median handling time, the dominant category, the
  busiest day, and whether the open queue grew or shrank.

Nothing is written and nothing is emailed; the page only reads.

### What changed for developers

Three files, one idea: **the arithmetic is pure and lives in
[`lib/reports.ts`](lib/reports.ts)** — bucketing, the timeline, breakdowns,
medians and the insight sentences are all plain functions over plain rows, so
they are tested without a database, a session or a browser.

[`/api/admin/reports`](app/api/admin/reports/route.ts) returns one flat row per
ticket **once**, and every control on the page recomputes in the browser. That
is what makes dragging the timeline feel immediate; the cost is a payload of
roughly 150 bytes per ticket, noted in the route's header with the threshold at
which the aggregation should move server-side.

**`Ticket` has no `closedAt` column.** A closure is a `TicketHistory` row
(`field: "status"`, `newValue: "סגור"`), and a reopened ticket has several. The
route takes the *latest* one, and only for tickets that are closed *now*, so
that:

```
cumulative opened − cumulative closed = tickets actually open
```

Counting close *events* instead would double-count reopened tickets and sink
the backlog line below the truth, silently. Tickets closed before history was
recorded have no row; they are counted as opened, excluded from the closure
line, and the page **says so** rather than under-reporting quietly.

Buckets are civil days in **Asia/Jerusalem**, not UTC days — a ticket opened at
01:30 local is opened today, and bucketing on the UTC date would move a whole
night of tickets into the previous column. Weeks start on Sunday.

### The charts

Hand-rolled SVG; the app gains no charting dependency. Two decisions worth
knowing, both made after rendering the thing and looking at it:

- **The backlog gets its own plot.** It is an order of magnitude larger than the
  daily flow, and sharing one y-axis flattened both lines into an unreadable
  band at the baseline. Stacked small multiples over a shared x — never a second
  y-axis.
- **`text-anchor` is logical, not physical.** Inside the RTL page "start" means
  the *right* edge, so every axis label drew backwards off its own end and the
  first and last ticks were clipped. The `<svg>` sets `direction: ltr`; the plot
  is an LTR coordinate space with Hebrew labels laid out correctly inside it.

Series colours are validated categorical slots, not brand colours: the brand
green sits at 2.15:1 on white, too faint to carry a 2px line. Category bars are
nominal, so they all take one hue and length alone carries magnitude; the
urgency and status breakdowns reuse the app's own maps from `lib/theme.ts`.

### Tests

78 new tests across four suites — 674 across 42 in total.
[`reports.test.ts`](__tests__/reports.test.ts) covers the arithmetic including
the reopened-ticket and timezone traps;
[`ReportsAPI.test.ts`](__tests__/ReportsAPI.test.ts) covers close-date
resolution and the admin gate;
[`ReportsPage.test.tsx`](__tests__/ReportsPage.test.tsx) asserts that the page
fetches exactly once and that no control refetches; and
[`ReportsCharts.test.tsx`](__tests__/ReportsCharts.test.tsx) pins the chart
geometry — the LTR coordinate space, the axis rounding, the empty and
single-point ranges, and the visible share labels that keep every value
reachable without hovering.

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
