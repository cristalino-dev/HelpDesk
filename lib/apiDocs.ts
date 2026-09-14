/**
 * lib/apiDocs.ts — the API's front door and its documentation page (v3.89).
 *
 * Both are generated from lib/openapi.ts — the contract itself — so neither can
 * drift from what the routes do:
 *   - GET /api/v1 hands a program the index: where the documentation is, and
 *     every endpoint with the key it needs. A browser is sent to the page.
 *   - GET /api/v1/docs is the same contract as a page a developer can read —
 *     the link to give another program's developers.
 * Server only. No data, no key; static text under a script-less CSP.
 */

import { openApiDocument } from "@/lib/openapi"
import { RATE_LIMIT_PER_MINUTE } from "@/lib/apiKeys"
import { themeCss } from "@/lib/palette"
import { T } from "@/lib/theme"
import { VERSION } from "@/lib/version"

type Schema = {
  $ref?: string
  type?: string | string[]
  format?: string
  enum?: readonly unknown[]
  default?: unknown
  description?: string
  items?: Schema
  properties?: Record<string, Schema>
  required?: string[]
  allOf?: Schema[]
  oneOf?: Schema[]
  maxLength?: number
  minimum?: number
  maximum?: number
  examples?: unknown[]
  additionalProperties?: boolean
  minProperties?: number
}
type Parameter = { name: string; in: string; required?: boolean; description?: string; schema?: Schema; example?: unknown }
type Media = { schema?: Schema }
type Operation = {
  summary: string
  operationId: string
  description?: string
  security?: unknown[]
  parameters?: Parameter[]
  requestBody?: { required?: boolean; content: Record<string, Media> }
  responses: Record<string, { description: string; content?: Record<string, Media> }>
}
type Doc = ReturnType<typeof openApiDocument>

/** What an endpoint needs: nothing, a read key, or a write key. */
export type KeyNeeded = "none" | "read" | "write"
export type ApiOperation = { method: string; path: string; summary: string; key: KeyNeeded; op: Operation }

const METHODS = ["get", "post", "put", "patch", "delete"] as const

/** Every operation in the document, in its order, with the key it needs. */
export function apiOperations(doc: Doc = openApiDocument()): ApiOperation[] {
  const paths = doc.paths as unknown as Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>
  return Object.entries(paths).flatMap(([path, item]) =>
    METHODS.flatMap(m => {
      const op = item[m]
      if (!op) return []
      const key: KeyNeeded = Array.isArray(op.security) && op.security.length === 0 ? "none" : m === "get" ? "read" : "write"
      return [{ method: m.toUpperCase(), path, summary: op.summary, key, op }]
    }))
}

/** GET /api/v1 for a program: where the documentation is, and every endpoint. */
export function apiIndex(doc: Doc = openApiDocument()) {
  const base = doc.servers[0].url
  return {
    name: doc.info.title,
    version: "v1",
    appVersion: VERSION,
    documentation: `${base}/api/v1/docs`,
    openapi: `${base}/api/v1/openapi.json`,
    authentication:
      "Send the key an admin created for your program (admin console → API) as 'Authorization: Bearer <key>' " +
      "or 'X-Api-Key: <key>'. Endpoints whose key is \"none\" need no key.",
    endpoints: apiOperations(doc).map(({ method, path, summary, key }) => ({ method, path, summary, key })),
  }
}

/** A browser asks for HTML first; curl, Postman and HTTP libraries send `*\/*` or JSON. */
export function wantsHtml(accept: string | null): boolean {
  return !!accept && /\btext\/html\b/i.test(accept)
}

export const DOCS_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // Static text with inline styles: nothing to run, nothing to load, nothing to frame it.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "public, max-age=300",
}

// ── The page ─────────────────────────────────────────────────────────────────

const ERROR_CODES: [string, string, string][] = [
  ["400", "invalid_query / invalid_body", "Something was not understood. The message names every problem at once."],
  ["401", "unauthorized", "No key, or an unknown or revoked one."],
  ["403", "forbidden", "A read key tried to write."],
  ["404", "not_found / file_missing", "No such ticket or attachment, or the attachment's file is gone."],
  ["409", "conflict", "The change breaks a rule — for example closing a leaving-employee ticket with equipment still out."],
  ["429", "rate_limited", `More than ${RATE_LIMIT_PER_MINUTE} requests a minute with this key. Retry-After says when to try again.`],
  ["500", "server_error", "A failure on our side. It has been logged."],
]

const AUTH = `-H "Authorization: Bearer $HELPDESK_KEY"`
const JSON_BODY = `${AUTH} -H "Content-Type: application/json"`
/** One runnable example per operation, keyed by operationId. */
const EXAMPLES: Record<string, (base: string) => string> = {
  listTickets: b => `curl -s "${b}/api/v1/tickets?open=true&type=request&sort=updatedAt" \\\n  ${AUTH}`,
  createTicket: b =>
    `curl -s -X POST "${b}/api/v1/tickets" \\\n  ${JSON_BODY} \\\n` +
    `  -d '{ "type": "request", "subject": "מסך נוסף", "description": "צריך מסך שני לעמדה",\n        "ownerEmail": "employee@cristalino.co.il" }'`,
  getTicket: b => `curl -s "${b}/api/v1/tickets/REQ-601" \\\n  ${AUTH}`,
  updateTicket: b =>
    `curl -s -X PATCH "${b}/api/v1/tickets/REQ-601" \\\n  ${JSON_BODY} \\\n` +
    `  -d '{ "status": "בטיפול", "assignedTo": "alon@cristalino.co.il", "note": "הוזמן מהספק" }'`,
  addMessage: b => `curl -s -X POST "${b}/api/v1/tickets/REQ-601/messages" \\\n  ${JSON_BODY} \\\n  -d '{ "content": "המסך הוזמן ויגיע ביום ראשון" }'`,
  addNote: b => `curl -s -X POST "${b}/api/v1/tickets/REQ-601/notes" \\\n  ${JSON_BODY} \\\n  -d '{ "content": "הוזמן מספק X, הזמנה 1234" }'`,
  getAttachment: b => `curl -s -OJ "${b}/api/v1/attachments/<id>" \\\n  ${AUTH}`,
  getOptions: b => `curl -s "${b}/api/v1/options" \\\n  ${AUTH}`,
  getOpenApi: b => `curl -s "${b}/api/v1/openapi.json"`,
  getApiIndex: b => `curl -s "${b}/api/v1"`,
}

const KEY_LABEL: Record<KeyNeeded, string> = { none: "no key", read: "read key", write: "write key" }

const esc = (value: unknown) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
/** Escaped, with `code` spans — the only markup the document's own text uses. */
const inline = (text = "") => esc(text).replace(/`([^`]+)`/g, "<code>$1</code>")
const paras = (text = "") => text.split(/\n{2,}/).filter(Boolean).map(p => `<p>${inline(p)}</p>`).join("")
const schemaName = (ref: string) => ref.replace("#/components/schemas/", "")
const objLink = (name: string) => `<a href="#obj-${esc(name)}">${esc(name)}</a>`
const table = (head: string[], rows: string) =>
  `<div class="tbl"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`

function typeOf(s?: Schema): string {
  if (!s) return ""
  if (s.$ref) return objLink(schemaName(s.$ref))
  if (s.oneOf) return s.oneOf.map(typeOf).join(" | ")
  if (s.allOf) return s.allOf.map(typeOf).join(" + ")
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : []
  const label = types.map(t => (t === "array" ? `array of ${typeOf(s.items) || "values"}` : esc(t))).join(" | ")
  return s.format ? `${label} <span class="fmt">(${esc(s.format)})</span>` : label
}

function notes(s: Schema = {}, required = false, description = s.description): string {
  const bits: string[] = []
  if (required) bits.push(`<span class="req">required</span>`)
  if (description) bits.push(inline(description))
  if (s.enum) bits.push(`one of ${s.enum.map(v => `<code>${esc(v)}</code>`).join(", ")}`)
  if (s.default !== undefined) bits.push(`default <code>${esc(JSON.stringify(s.default))}</code>`)
  if (s.maxLength !== undefined) bits.push(`at most ${s.maxLength} characters`)
  if (s.minimum !== undefined && s.maximum !== undefined) bits.push(`${s.minimum}–${s.maximum}`)
  else if (s.minimum !== undefined) bits.push(`at least ${s.minimum}`)
  if (s.examples?.length) bits.push(`e.g. ${s.examples.map(v => `<code>${esc(v)}</code>`).join(", ")}`)
  return bits.join(" · ")
}

/** One row per field; a nested object's fields follow as `parent.child`. */
function fieldRows(s: Schema, prefix = ""): string {
  const required = new Set(s.required ?? [])
  return Object.entries(s.properties ?? {}).map(([name, p]) => {
    const row = `<tr><td><code>${esc(prefix + name)}</code></td><td>${typeOf(p)}</td><td>${notes(p, required.has(name))}</td></tr>`
    const nested = p.properties ? fieldRows(p, `${prefix}${name}.`)
      : p.items?.properties ? fieldRows(p.items, `${prefix}${name}[].`) : ""
    return row + nested
  }).join("")
}

const fieldsTable = (s: Schema) => table(["Field", "Type", "Notes"], fieldRows(s))

function rulesOf(s: Schema): string {
  const bits: string[] = []
  if (s.additionalProperties === false) bits.push("A field not listed here is refused (400).")
  if (s.minProperties) bits.push(`Send at least ${s.minProperties === 1 ? "one field" : `${s.minProperties} fields`}.`)
  return bits.length ? `<p class="fmt">${bits.join(" ")}</p>` : ""
}

function objectBlock(name: string, s: Schema): string {
  const head = `<h3 id="obj-${esc(name)}">${esc(name)}</h3>${paras(s.description)}`
  if (s.allOf) {
    const bases = s.allOf.filter(x => x.$ref).map(x => objLink(schemaName(x.$ref!)))
    const extra = s.allOf.filter(x => !x.$ref && x.properties).map(fieldsTable).join("")
    return `${head}<p>Everything in ${bases.join(", ")}, and:</p>${extra}`
  }
  return head + (s.properties ? fieldsTable(s) : "") + rulesOf(s)
}

/** `{ data: Ticket, page: Page }` for an inline wrapper; the object's name otherwise. */
function bodyShape(s?: Schema): string {
  if (!s) return ""
  if (s.properties && !s.$ref) return `{ ${Object.entries(s.properties).map(([k, v]) => `${esc(k)}: ${typeOf(v)}`).join(", ")} }`
  return typeOf(s)
}

function mediaCell(content?: Record<string, Media>): string {
  if (!content) return ""
  return Object.entries(content)
    .map(([type, m]) => (type === "application/json" ? bodyShape(m.schema) : `<code>${esc(type)}</code>`))
    .join(", ")
}

function operationBlock(o: ApiOperation, base: string, schemas: Record<string, Schema>): string {
  const { op } = o
  const resolve = (s: Schema) => (s.$ref ? schemas[schemaName(s.$ref)] ?? s : s)

  const parameters = op.parameters?.length
    ? "<h4>Parameters</h4>" + table(["Name", "In", "Type", "Notes"], op.parameters.map(p =>
        `<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.in)}</td><td>${typeOf(p.schema)}</td><td>${
          notes({ ...p.schema, examples: p.example !== undefined ? [p.example] : p.schema?.examples }, p.required, p.description)
        }</td></tr>`).join(""))
    : ""

  const media = op.requestBody ? Object.entries(op.requestBody.content)[0] : undefined
  const bodySchema = media?.[1].schema ? resolve(media[1].schema) : undefined
  const body = media
    ? `<h4>Body</h4><p><code>${esc(media[0])}</code> — ${typeOf(media[1].schema)}</p>` +
      (bodySchema ? paras(bodySchema.description) + fieldsTable(bodySchema) + rulesOf(bodySchema) : "")
    : ""

  const responses = "<h4>Responses</h4>" + table(["Status", "Meaning", "Body"], Object.entries(op.responses).map(([code, r]) =>
    `<tr><td><code>${esc(code)}</code></td><td>${inline(r.description)}</td><td>${mediaCell(r.content)}</td></tr>`).join(""))

  const example = EXAMPLES[op.operationId]
  return `<section class="op" id="${esc(op.operationId)}">
<h3><span class="m m-${o.method.toLowerCase()}">${o.method}</span><code>${esc(o.path)}</code><span class="key key-${o.key}">${KEY_LABEL[o.key]}</span></h3>
<p><strong>${esc(op.summary)}</strong></p>${paras(op.description)}${parameters}${body}${responses}${
    example ? `<h4>Example</h4><pre><code>${esc(example(base))}</code></pre>` : ""}
</section>`
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:${T.bg};color:${T.text};font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 20px 72px}
a{color:${T.greenInk}}
h1{margin:0 0 6px;font-size:1.7rem;color:${T.ink}}
h2{margin:44px 0 12px;padding-top:12px;border-top:1px solid ${T.line};font-size:1.25rem;color:${T.ink}}
h3{margin:0 0 6px;font-size:1.02rem;color:${T.ink}}
h4{margin:16px 0 6px;font-size:.76rem;text-transform:uppercase;letter-spacing:.05em;color:${T.inkFaint}}
p{margin:6px 0}
code{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:.86em;background:${T.codeBg};padding:1px 5px;border-radius:4px}
pre{background:${T.consoleBg};color:${T.consoleFg};padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:.85em;line-height:1.5}
pre code{background:none;padding:0;font-size:1em;color:inherit}
.lead{color:${T.text2};font-size:1.02rem}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;background:${T.card2};border:1px solid ${T.line};font-size:.82rem}
nav{background:${T.card};border:1px solid ${T.line};border-radius:12px;padding:12px 18px;margin:20px 0}
nav ol{margin:4px 0;padding-left:20px}
nav li{margin:2px 0}
.op{background:${T.card};border:1px solid ${T.line};border-radius:12px;padding:16px 18px;margin:16px 0;box-shadow:0 1px 2px ${T.shadow1}}
.op h3{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.m{display:inline-block;min-width:58px;text-align:center;font:700 .74rem ui-monospace,Consolas,monospace;padding:3px 8px;border-radius:6px}
.m-get{background:${T.blueBg};color:${T.blueFgDeep}}
.m-post{background:${T.greenSBg};color:${T.greenSFgDeep}}
.m-patch,.m-put{background:${T.amberBg};color:${T.amberFgDeep}}
.m-delete{background:${T.redBg};color:${T.redFgDeep}}
.key{margin-left:auto;font-size:.74rem;font-weight:600;padding:2px 10px;border-radius:999px;border:1px solid ${T.line};color:${T.inkMuted}}
.key-write{border-color:${T.amberBorder};color:${T.amberFgDeep}}
.key-none{border-color:${T.greenSBorder};color:${T.greenSFgDeep}}
.tbl{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid ${T.line};vertical-align:top}
th{font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:${T.inkFaint};font-weight:600}
td:first-child{white-space:nowrap}
.req{font-size:.72rem;font-weight:700;color:${T.redFg}}
.fmt{color:${T.inkFaint}}
footer{margin-top:48px;color:${T.inkFaint};font-size:.82rem}
`

/** GET /api/v1/docs: the whole contract as one self-contained page. */
export function apiDocsHtml(doc: Doc = openApiDocument()): string {
  const base = doc.servers[0].url
  const schemas = doc.components.schemas as unknown as Record<string, Schema>
  const ops = apiOperations(doc)
  const statuses = schemas.Ticket?.properties?.status?.enum ?? []
  const lead = doc.info.description.split(/\n{2,}/)[0]
  const toc = ops.map(o =>
    `<li><a href="#${esc(o.op.operationId)}"><code>${o.method} ${esc(o.path)}</code></a> — ${esc(o.summary)}</li>`).join("")

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(doc.info.title)} — v1</title>
<style>
${themeCss()}
${CSS}
</style>
</head>
<body>
<main>
<header>
<h1>${esc(doc.info.title)} — v1</h1>
<p class="lead">${inline(lead)}</p>
<div class="pills">
<span class="pill">Base URL <code>${esc(base)}/api/v1</code></span>
<span class="pill">OpenAPI 3.1: <a href="/api/v1/openapi.json">/api/v1/openapi.json</a></span>
<span class="pill">HelpDesk ${esc(VERSION)}</span>
</div>
</header>

<nav aria-label="Contents"><strong>Contents</strong><ol>
<li><a href="#start">Quick start</a></li>
<li><a href="#auth">Keys and authentication</a></li>
<li><a href="#errors">Errors</a></li>
<li><a href="#conventions">Tickets, requests and conventions</a></li>
<li><a href="#endpoints">Endpoints</a><ol>${toc}</ol></li>
<li><a href="#objects">Objects</a></li>
<li><a href="#integration">A typical integration</a></li>
</ol></nav>

<h2 id="start">Quick start</h2>
<ol>
<li>Ask a helpdesk admin for a key for your program. They create it in the admin console → <strong>API</strong>, and see
it only once: keep it secret, like a password.</li>
<li>Send it with every request, and try one:
<pre><code>${esc(EXAMPLES.getOptions(base))}</code></pre></li>
<li>Read the endpoints below — or load <a href="/api/v1/openapi.json">openapi.json</a> into Postman, Swagger UI or a
client generator.</li>
</ol>

<h2 id="auth">Keys and authentication</h2>
<p>Either header works:</p>
<pre><code>Authorization: Bearer hdk_…
X-Api-Key: hdk_…</code></pre>
${table(["Key", "May"],
    "<tr><td><code>read</code></td><td>List and read tickets, with their messages, internal notes, history and attachments; read the allowed values.</td></tr>" +
    "<tr><td><code>write</code></td><td>Everything a read key may, and open tickets, change them, write to their owners and add notes.</td></tr>")}
<p>Every change is recorded in the ticket's history as <strong>API: &lt;key name&gt;</strong>, and sends the same mail the
site sends for that change — unless the request says <code>"notify": false</code>.</p>
<p>At most <strong>${RATE_LIMIT_PER_MINUTE} requests a minute</strong> per key; beyond that, <code>429</code> with a
<code>Retry-After</code> header in seconds. A revoked key is refused at once (<code>401</code>).</p>

<h2 id="errors">Errors</h2>
<p>Always this shape, with an HTTP status that means what it says:</p>
<pre><code>${esc('{ "error": { "code": "invalid_body", "message": "subject is required; ownerEmail is not an email address" } }')}</code></pre>
${table(["Status", "Code", "When"], ERROR_CODES.map(([status, codes, when]) =>
    `<tr><td><code>${status}</code></td><td>${codes.split(" / ").map(c => `<code>${esc(c)}</code>`).join(" / ")}</td><td>${esc(when)}</td></tr>`).join(""))}
<p>Unknown fields and unknown query parameters are errors, never silently ignored — a typo does not go unnoticed.</p>

<h2 id="conventions">Tickets, requests and conventions</h2>
<ul>
<li>A <strong>ticket</strong> is a fault, labelled <code>HDTC-597</code>; a <strong>request</strong> is something wanted —
equipment, a permission, an account — labelled <code>REQ-601</code>. One number sequence for both.</li>
<li>Wherever a path says <code>{ref}</code>, <code>HDTC-597</code>, <code>REQ-601</code>, <code>597</code> and the ticket's
<code>id</code> all work.</li>
<li><code>status</code> is one of ${statuses.map(s => `<code>${esc(s)}</code>`).join(" · ")}. The allowed
<code>urgency</code>, <code>category</code> and <code>platform</code> values are whatever the admins configured — read
them from <a href="#getOptions"><code>GET /api/v1/options</code></a>.</li>
<li>JSON in UTF-8 both ways. Times are ISO 8601 in UTC; a bare date in a filter is a UTC day.</li>
<li>Within v1 fields are only ever <strong>added</strong> — never renamed or removed. Ignore fields you do not know.</li>
</ul>

<h2 id="endpoints">Endpoints</h2>
${ops.map(o => operationBlock(o, base, schemas)).join("\n")}

<h2 id="objects">Objects</h2>
${Object.entries(schemas).map(([name, s]) => objectBlock(name, s)).join("\n")}

<h2 id="integration">A typical integration</h2>
<ol>
<li><code>GET /api/v1/options</code> once, to know the allowed values.</li>
<li><code>POST /api/v1/tickets</code> when your system needs something from IT; keep the <code>label</code> it returns.</li>
<li>Poll <code>GET /api/v1/tickets?updatedFrom=&lt;last poll&gt;&amp;sort=updatedAt&amp;order=asc</code> for changes.</li>
<li><code>POST /api/v1/tickets/{ref}/messages</code> to tell the person something; <code>PATCH /api/v1/tickets/{ref}</code>
to move it along.</li>
</ol>

<footer>Generated from <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> — the contract itself. Cristalino HelpDesk ${esc(VERSION)}.</footer>
</main>
</body>
</html>
`
}
