/**
 * lib/openapi.ts — the public API, /api/v1, described in OpenAPI 3.1 (v3.88).
 *
 * Served at GET /api/v1/openapi.json. docs/API.md is the same contract in
 * prose, with examples. __tests__/openapi.test.ts reads every route under
 * app/api/v1 and fails when one — or one of its methods — is missing here, so
 * the description cannot quietly fall behind the code.
 */

import { MAX_LIMIT, DEFAULT_LIMIT, SORT_FIELDS } from "@/lib/ticketQuery"
import { RATE_LIMIT_PER_MINUTE } from "@/lib/apiKeys"

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: object) => ({ "application/json": { schema } })
const err = (description: string) => ({ description, content: json(ref("Error")) })

const ERRORS = {
  "401": err("No key, or an unknown or revoked one."),
  "429": err(`More than ${RATE_LIMIT_PER_MINUTE} requests a minute with this key. Retry-After says when to try again.`),
  "500": err("A failure on the server; it has been logged."),
}
const WRITE_ERRORS = { ...ERRORS, "403": err("The key is read-only.") }

const REF_PARAM = {
  name: "ref", in: "path", required: true,
  description: "The ticket: HDTC-597, REQ-601, 597, or its id.",
  schema: { type: "string" }, example: "HDTC-597",
}

const listParam = (name: string, description: string, schema: object = { type: "string" }) =>
  ({ name, in: "query", required: false, description, schema })

export function openApiDocument() {
  const server = process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.cristalino.co.il"
  return {
    openapi: "3.1.0",
    info: {
      title: "Cristalino HelpDesk API",
      version: "1.0.0",
      description:
        "Read, open and change helpdesk tickets and requests from another program.\n\n" +
        "Authenticate with the key an admin created for your program (admin console → API): " +
        "`Authorization: Bearer <key>` or `X-Api-Key: <key>`. A read key lists and reads; a write key may also " +
        "open tickets, change them, and add messages and notes. Every change is recorded in the ticket's history " +
        "as \"API: <key name>\", and sends the same mail the site does unless the request says `\"notify\": false`.\n\n" +
        "Errors always look like `{ \"error\": { \"code\": \"...\", \"message\": \"...\" } }`. " +
        `At most ${RATE_LIMIT_PER_MINUTE} requests a minute per key. Within v1 fields are only ever added.`,
    },
    servers: [{ url: server }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Authorization: Bearer hdk_…" },
        apiKeyHeader: { type: "apiKey", in: "header", name: "X-Api-Key" },
      },
      schemas: {
        Error: {
          type: "object", required: ["error"],
          properties: { error: { type: "object", required: ["code", "message"], properties: {
            code: { type: "string", examples: ["invalid_body", "not_found", "conflict"] },
            message: { type: "string" },
          } } },
        },
        Person: { type: "object", properties: { name: { type: ["string", "null"] }, email: { type: "string" } } },
        Ticket: {
          type: "object",
          properties: {
            id: { type: "string" },
            number: { type: "integer", examples: [597] },
            label: { type: "string", description: "HDTC-N for a ticket, REQ-N for a request.", examples: ["HDTC-597"] },
            type: { type: "string", enum: ["ticket", "request"] },
            subject: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["פתוח", "בטיפול", "בהמתנה", "סגור"] },
            holdReason: { type: ["string", "null"], description: "Why it is בהמתנה." },
            urgency: { type: "string", description: "One of GET /api/v1/options → urgency." },
            category: { type: "string" },
            platform: { type: "string" },
            assignedTo: { type: ["string", "null"], description: "The handling technician's email." },
            owner: { oneOf: [ref("Person"), { type: "null" }], description: "Who the ticket belongs to." },
            phone: { type: ["string", "null"] },
            computerName: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            url: { type: "string", description: "The ticket's page on the site." },
          },
        },
        TicketDetail: {
          allOf: [ref("Ticket"), { type: "object", properties: {
            messages: { type: "array", items: ref("Message") },
            notes: { type: "array", items: ref("Note") },
            history: { type: "array", items: ref("HistoryEntry") },
            attachments: { type: "array", items: ref("Attachment") },
            equipment: { type: "array", items: { type: "object", properties: {
              label: { type: "string" }, quantity: { type: "integer" }, received: { type: "integer" },
            } } },
          } }],
        },
        Message: {
          type: "object", description: "The conversation with the owner.",
          properties: {
            id: { type: "string" }, content: { type: "string" }, createdAt: { type: "string", format: "date-time" },
            author: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: ["staff", "user"] } } },
          },
        },
        Note: {
          type: "object", description: "Internal — staff only; the owner never sees it.",
          properties: {
            id: { type: "string" }, content: { type: "string" }, createdAt: { type: "string", format: "date-time" },
            author: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } } },
          },
        },
        HistoryEntry: {
          type: "object",
          properties: {
            field: { type: "string", examples: ["created", "status", "urgency", "assignedTo", "owner", "type", "edited"] },
            from: { type: ["string", "null"] }, to: { type: ["string", "null"] },
            at: { type: "string", format: "date-time" },
            by: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } } },
          },
        },
        Attachment: {
          type: "object",
          properties: {
            id: { type: "string" }, filename: { type: ["string", "null"] }, mimeType: { type: ["string", "null"] },
            size: { type: ["integer", "null"] }, createdAt: { type: "string", format: "date-time" },
            url: { type: "string", description: "GET /api/v1/attachments/{id}, with the key." },
          },
        },
        Page: {
          type: "object",
          properties: { number: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, pages: { type: "integer" } },
        },
        CreateTicket: {
          type: "object", required: ["subject", "description", "ownerEmail"], additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["ticket", "request"], default: "ticket" },
            subject: { type: "string", maxLength: 300 },
            description: { type: "string", maxLength: 20000 },
            ownerEmail: { type: "string", format: "email", description: "Whose ticket it is. An account is created if they have none." },
            ownerName: { type: "string", description: "Used only when the account is new." },
            urgency: { type: "string", default: "בינוני" },
            category: { type: "string", default: "אחר" },
            platform: { type: "string", default: "מחשב אישי" },
            phone: { type: "string" },
            computerName: { type: "string" },
            assignedTo: { type: "string", format: "email" },
            notify: { type: "boolean", default: true, description: "false: send no mail." },
          },
        },
        UpdateTicket: {
          type: "object", additionalProperties: false, minProperties: 1,
          description: "Only what is sent changes. The rules of a staff edit apply: closing sets urgency נמוך; בהמתנה needs holdReason; a leaving-employee ticket with gear still out does not close (409).",
          properties: {
            status: { type: "string", enum: ["פתוח", "בטיפול", "בהמתנה", "סגור"] },
            holdReason: { type: "string" },
            urgency: { type: "string" }, category: { type: "string" }, platform: { type: "string" },
            type: { type: "string", enum: ["ticket", "request"] },
            assignedTo: { type: "string", description: "An email, or \"\" to unassign." },
            subject: { type: "string" }, description: { type: "string" },
            phone: { type: "string" }, computerName: { type: "string" },
            note: { type: "string", description: "An internal note added with the change." },
            notify: { type: "boolean", default: true },
          },
        },
        Entry: {
          type: "object", required: ["content"], additionalProperties: false,
          properties: {
            content: { type: "string", maxLength: 20000 },
            authorName: { type: "string", description: "Shown as the author; default \"API: <key name>\"." },
            notify: { type: "boolean", default: true },
          },
        },
        Options: {
          type: "object",
          properties: {
            status: { type: "array", items: { type: "string" } },
            type: { type: "array", items: { type: "string" } },
            urgency: { type: "array", items: { type: "string" } },
            category: { type: "array", items: { type: "string" } },
            platform: { type: "array", items: { type: "string" } },
            sla: { type: "object", description: "Workdays before an open one is overdue.",
              properties: { ticket: { type: "integer" }, request: { type: "integer" } } },
          },
        },
      },
    },
    paths: {
      "/api/v1/tickets": {
        get: {
          summary: "List tickets", operationId: "listTickets",
          description: "Filters combine with AND; a comma inside one means \"any of\".",
          parameters: [
            listParam("status", "e.g. פתוח,בטיפול"),
            listParam("type", "ticket or request (or both, comma-separated)"),
            listParam("open", "true: anything but סגור; false: only סגור", { type: "boolean" }),
            listParam("urgency", "e.g. דחוף,גבוה"),
            listParam("category", "exact values"),
            listParam("platform", "exact values"),
            listParam("assignedTo", "the technician's email"),
            listParam("owner", "the owner's email"),
            listParam("number", "HDTC-12, REQ-12 or 12"),
            listParam("q", "text in the subject or description"),
            listParam("createdFrom", "ISO date or date-time", { type: "string", format: "date-time" }),
            listParam("createdTo", "a bare date means the whole day", { type: "string", format: "date-time" }),
            listParam("updatedFrom", "ISO date or date-time", { type: "string", format: "date-time" }),
            listParam("updatedTo", "a bare date means the whole day", { type: "string", format: "date-time" }),
            listParam("sort", "the field to sort by", { type: "string", enum: [...SORT_FIELDS], default: "createdAt" }),
            listParam("order", "", { type: "string", enum: ["asc", "desc"], default: "desc" }),
            listParam("page", "from 1", { type: "integer", minimum: 1, default: 1 }),
            listParam("limit", "", { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT }),
          ],
          responses: {
            "200": { description: "A page of tickets.", content: json({ type: "object", properties: { data: { type: "array", items: ref("Ticket") }, page: ref("Page") } }) },
            "400": err("A parameter was not understood; the message names it."),
            ...ERRORS,
          },
        },
        post: {
          summary: "Open a ticket or request", operationId: "createTicket",
          requestBody: { required: true, content: json(ref("CreateTicket")) },
          responses: {
            "201": { description: "Opened.", content: json({ type: "object", properties: { data: ref("Ticket") } }) },
            "400": err("The body was not valid; the message lists every problem."),
            ...WRITE_ERRORS,
          },
        },
      },
      "/api/v1/tickets/{ref}": {
        get: {
          summary: "One ticket, with its messages, notes, history and attachments", operationId: "getTicket",
          parameters: [REF_PARAM],
          responses: {
            "200": { description: "The ticket.", content: json({ type: "object", properties: { data: ref("TicketDetail") } }) },
            "404": err("No such ticket."),
            ...ERRORS,
          },
        },
        patch: {
          summary: "Change a ticket", operationId: "updateTicket",
          parameters: [REF_PARAM],
          requestBody: { required: true, content: json(ref("UpdateTicket")) },
          responses: {
            "200": { description: "Changed.", content: json({ type: "object", properties: { data: ref("Ticket") } }) },
            "400": err("The body was not valid."),
            "404": err("No such ticket."),
            "409": err("The change breaks a rule — for example closing a leaving-employee ticket with gear still out."),
            ...WRITE_ERRORS,
          },
        },
      },
      "/api/v1/tickets/{ref}/messages": {
        post: {
          summary: "Write to the ticket's owner", operationId: "addMessage",
          description: "Appears in the ticket's conversation as from staff; the owner is mailed unless notify is false.",
          parameters: [REF_PARAM],
          requestBody: { required: true, content: json(ref("Entry")) },
          responses: {
            "201": { description: "Added.", content: json({ type: "object", properties: { data: ref("Message") } }) },
            "400": err("The body was not valid."),
            "404": err("No such ticket."),
            ...WRITE_ERRORS,
          },
        },
      },
      "/api/v1/tickets/{ref}/notes": {
        post: {
          summary: "Add an internal note", operationId: "addNote",
          parameters: [REF_PARAM],
          requestBody: { required: true, content: json(ref("Entry")) },
          responses: {
            "201": { description: "Added.", content: json({ type: "object", properties: { data: ref("Note") } }) },
            "400": err("The body was not valid."),
            "404": err("No such ticket."),
            ...WRITE_ERRORS,
          },
        },
      },
      "/api/v1/attachments/{id}": {
        get: {
          summary: "Download an attachment", operationId: "getAttachment",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "From a ticket's attachments." }],
          responses: {
            "200": { description: "The file; Content-Disposition carries its name.", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
            "404": err("No such attachment, or its file is missing."),
            ...ERRORS,
          },
        },
      },
      "/api/v1/options": {
        get: {
          summary: "The values a ticket's fields may take, and the SLA", operationId: "getOptions",
          responses: {
            "200": { description: "The lists the web form uses.", content: json({ type: "object", properties: { data: ref("Options") } }) },
            ...ERRORS,
          },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          summary: "This document", operationId: "getOpenApi", security: [],
          responses: { "200": { description: "OpenAPI 3.1.", content: json({ type: "object" }) } },
        },
      },
    },
  }
}
