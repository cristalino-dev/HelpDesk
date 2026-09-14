# Cristalino HelpDesk API — v1

Read, open and change helpdesk tickets and requests from another program.

- **Documentation page:** [`https://helpdesk.cristalino.co.il/api/v1/docs`](https://helpdesk.cristalino.co.il/api/v1/docs)
  — this contract as a web page, generated from the OpenAPI document. The link to send a developer (v3.89).
- **Base address:** `https://helpdesk.cristalino.co.il/api/v1` — in a browser it leads to the documentation page;
  a program gets a JSON index of every endpoint (no key needed for either)
  (for trying things out, the dev copy: `https://dev-helpdesk.cristalino.co.il/api/v1` — a copy of production's
  data with its own keys; its mail goes only to IT, never to the people on the tickets)
- **Machine-readable description:** [`/api/v1/openapi.json`](https://helpdesk.cristalino.co.il/api/v1/openapi.json)
  (OpenAPI 3.1 — load it into Postman, Swagger UI or a client generator; no key needed)
- **Since:** HelpDesk v3.88. Within v1 fields are only ever **added** — never renamed or removed.

---

## Keys

An admin creates a key for your program in the admin console → **API** tab. The key is shown **once**;
store it as a secret. Only its hash is kept on the server, so a lost key cannot be recovered — ask for a new
one, and have the old one revoked.

Send it on every request, either way:

```
Authorization: Bearer hdk_…
X-Api-Key: hdk_…
```

| Scope | May |
|---|---|
| `read` | list and read tickets, with their messages, internal notes, history and attachments; read the option lists |
| `write` | all of the above, and open tickets, change them, add messages and notes |

Every change made with a key is recorded in the ticket's history as **`API: <key name>`**.

**Rate limit:** 120 requests a minute per key. Over it: `429` with a `Retry-After` header (seconds).

---

## Errors

Always the same shape, with an HTTP status that means what it says:

```json
{ "error": { "code": "invalid_body", "message": "subject is required; ownerEmail is not an email address" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `invalid_query` / `invalid_body` | something was not understood — the message names every problem at once |
| 401 | `unauthorized` | no key, or an unknown or revoked one |
| 403 | `forbidden` | a read key tried to write |
| 404 | `not_found` / `file_missing` | no such ticket or attachment |
| 409 | `conflict` | the change breaks a rule — e.g. closing a leaving-employee ticket with equipment still out |
| 429 | `rate_limited` | over 120 requests a minute |
| 500 | `server_error` | our failure; it has been logged |

Unknown fields and unknown query parameters are errors, not silently ignored.

---

## Tickets and requests

A **ticket** is a fault (labelled `HDTC-597`); a **request** is something wanted — equipment, a permission,
an account (labelled `REQ-601`). One number sequence for both. Anywhere a ticket is named in a path —
`{ref}` — `HDTC-597`, `REQ-601`, `597` and the ticket's `id` all work.

```json
{
  "id": "cmsoeiaek00nocwn37bbmpffj",
  "number": 601,
  "label": "REQ-601",
  "type": "request",
  "subject": "מסך נוסף",
  "description": "צריך מסך שני לעמדה",
  "status": "פתוח",
  "holdReason": null,
  "urgency": "בינוני",
  "category": "אחר",
  "platform": "מחשב אישי",
  "assignedTo": "helpdesk@cristalino.co.il",
  "owner": { "name": "דנה לוי", "email": "dana@cristalino.co.il" },
  "phone": "050-1234567",
  "computerName": "PC-DANA",
  "createdAt": "2026-09-14T08:00:00.000Z",
  "updatedAt": "2026-09-14T08:00:00.000Z",
  "url": "https://helpdesk.cristalino.co.il/tickets/REQ-601"
}
```

`status` is one of `פתוח` · `בטיפול` · `בהמתנה` · `סגור`. The allowed `urgency`, `category` and `platform`
values are whatever admins configured — read them from `GET /options`.

---

## Endpoints

### `GET /tickets` — list (read)

| Parameter | Meaning |
|---|---|
| `status`, `urgency`, `category`, `platform` | exact values; a comma means "any of" — `status=פתוח,בטיפול` |
| `type` | `ticket`, `request`, or both |
| `open` | `true` — anything but `סגור`; `false` — only `סגור` |
| `assignedTo`, `owner` | an email (case-insensitive) |
| `number` | `HDTC-12`, `REQ-12` or `12` |
| `q` | text in the subject or description |
| `createdFrom`, `createdTo`, `updatedFrom`, `updatedTo` | ISO dates or date-times; a bare date in `…To` means the whole day |
| `sort` | `createdAt` (default), `updatedAt`, `ticketNumber` |
| `order` | `desc` (default), `asc` |
| `page`, `limit` | from 1; `limit` 1–200, default 50 |

```bash
curl -s "https://helpdesk.cristalino.co.il/api/v1/tickets?open=true&type=request&sort=updatedAt" \
  -H "Authorization: Bearer $HELPDESK_KEY"
```

→ `{ "data": [Ticket, …], "page": { "number": 1, "limit": 50, "total": 7, "pages": 1 } }`

### `POST /tickets` — open a ticket or request (write)

| Field | |
|---|---|
| `subject`, `description`, `ownerEmail` | **required** |
| `type` | `ticket` (default) or `request` |
| `ownerName` | used only when the owner has no account yet (one is created) |
| `urgency`, `category`, `platform` | from `GET /options`; default `בינוני`, `אחר`, `מחשב אישי` |
| `phone`, `computerName`, `assignedTo` | optional |
| `notify` | `true` (default) sends the mail the web form sends — to staff, and "received" to the owner |

```bash
curl -s -X POST "https://helpdesk.cristalino.co.il/api/v1/tickets" \
  -H "Authorization: Bearer $HELPDESK_KEY" -H "Content-Type: application/json" \
  -d '{ "type": "request", "subject": "מסך נוסף", "description": "צריך מסך שני לעמדה",
        "ownerEmail": "dana@cristalino.co.il", "urgency": "בינוני" }'
```

→ `201 { "data": Ticket }`

### `GET /tickets/{ref}` — one ticket, in full (read)

The ticket plus `messages` (the conversation with the owner), `notes` (internal — the owner never sees
them), `history`, `attachments` (with a `url` to download each) and `equipment` lines.

### `PATCH /tickets/{ref}` — change a ticket (write)

Send only what changes: `status` (+ `holdReason`), `urgency`, `category`, `platform`, `type`, `assignedTo`
(`""` unassigns), `subject`, `description`, `phone`, `computerName`, and optionally a `note` recorded with
the change. The rules of a staff edit on the site apply:

- `"status": "סגור"` also sets urgency to `נמוך`, and asks the owner to rate the service;
- `"status": "בהמתנה"` requires `holdReason`;
- a leaving-employee ticket with equipment not yet returned does not close → `409`.

The same mail goes out as for a staff edit on the site, unless `"notify": false`.

```bash
curl -s -X PATCH "https://helpdesk.cristalino.co.il/api/v1/tickets/REQ-601" \
  -H "Authorization: Bearer $HELPDESK_KEY" -H "Content-Type: application/json" \
  -d '{ "status": "בטיפול", "assignedTo": "alon@cristalino.co.il", "note": "הוזמן מהספק" }'
```

→ `{ "data": Ticket }`

### `POST /tickets/{ref}/messages` — write to the owner (write)

`{ "content": "…", "authorName": "מערכת ההזמנות" }` → `201 { "data": Message }`. It appears in the
ticket's conversation as from staff, and the owner is mailed unless `"notify": false`.

### `POST /tickets/{ref}/notes` — internal note (write)

`{ "content": "…" }` → `201 { "data": Note }`. Staff only; nobody is mailed.

### `GET /attachments/{id}` — download a file (read)

The ids come from a ticket's `attachments`. The response carries the file's name in `Content-Disposition`.

### `GET /options` — allowed values (read)

→ `{ "data": { "status": […], "type": ["ticket", "request"], "urgency": […], "category": […], "platform": […],
"sla": { "ticket": 4, "request": 10 } } }` — `sla` is the number of workdays (Sunday–Thursday) before an open
ticket or request is overdue.

### `GET /` — the index, and `GET /docs` — the documentation page (no key)

`GET /api/v1` returns `{ name, version, appVersion, documentation, openapi, authentication, endpoints }`, where each
endpoint is `{ method, path, summary, key }` and `key` is `none`, `read` or `write`. A browser (`Accept: text/html`)
is redirected to `/api/v1/docs` instead — this document as a page.

---

## A typical integration

1. `GET /options` once, to know the allowed values.
2. `POST /tickets` when your system needs something from IT; keep the returned `label`.
3. Poll `GET /tickets?updatedFrom=<last poll>&sort=updatedAt&order=asc` for changes.
4. `POST /tickets/{ref}/messages` to tell the person something; `PATCH /tickets/{ref}` to move it along.
