/**
 * lib/apiV1.ts — the public API's ticket, as other programs see it, and the
 * checks on what they send (v3.88).
 *
 * The shape is a contract, decoupled from the database row: within v1 fields
 * may be added, never renamed or removed (rule 69). Internal columns —
 * sourceMessageId, userId — never leave the server.
 */

import { ticketLabel, normalizeType, TICKET_TYPES } from "@/lib/ticketType"
import type { TicketChanges } from "@/lib/ticketChanges"

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://helpdesk.cristalino.co.il"

export const STATUSES = ["פתוח", "בטיפול", "בהמתנה", "סגור"] as const

type Row = {
  id: string; ticketNumber: number; type: string; subject: string; description: string
  status: string; holdReason: string | null; urgency: string; category: string; platform: string
  assignedTo: string; phone: string; computerName: string; createdAt: Date; updatedAt: Date
  user?: { name: string | null; email: string } | null
  /** v3.92 — the ticket this one was merged into; the routes include it. */
  mergedInto?: { ticketNumber: number; type: string } | null
}

export function toApiTicket(t: Row) {
  const label = ticketLabel(t)
  return {
    id: t.id,
    number: t.ticketNumber,
    label,
    type: normalizeType(t.type),
    subject: t.subject,
    description: t.description,
    status: t.status,
    holdReason: t.holdReason ?? null,
    urgency: t.urgency,
    category: t.category,
    platform: t.platform,
    assignedTo: t.assignedTo || null,
    owner: t.user ? { name: t.user.name ?? null, email: t.user.email } : null,
    // v3.92: the label of the ticket this one was merged into — it is closed and
    // takes no more changes; the conversation goes on there. null otherwise.
    mergedInto: t.mergedInto ? ticketLabel(t.mergedInto) : null,
    phone: t.phone || null,
    computerName: t.computerName || null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    url: `${APP_URL()}/tickets/${label}`,
  }
}

export type ApiTicket = ReturnType<typeof toApiTicket>

type DetailRow = Row & {
  messages: { id: string; content: string; authorName: string; authorEmail: string; authorRole: string; createdAt: Date }[]
  notes: { id: string; content: string; authorName: string; authorEmail: string; createdAt: Date }[]
  history: { field: string; oldValue: string | null; newValue: string | null; actorName: string; actorEmail: string; changedAt: Date }[]
  attachments: { id: string; filename: string | null; mimeType: string | null; size: number | null; createdAt: Date }[]
  equipment: { label: string; quantity: number; receivedQty: number }[]
  participants?: { user: { name: string | null; email: string } }[]
}

export function toApiTicketDetail(t: DetailRow) {
  return {
    ...toApiTicket(t),
    messages: t.messages.map(m => ({
      id: m.id, content: m.content, createdAt: m.createdAt.toISOString(),
      author: { name: m.authorName, email: m.authorEmail, role: m.authorRole },
    })),
    notes: t.notes.map(n => ({
      id: n.id, content: n.content, createdAt: n.createdAt.toISOString(),
      author: { name: n.authorName, email: n.authorEmail },
    })),
    history: t.history.map(h => ({
      field: h.field, from: h.oldValue, to: h.newValue, at: h.changedAt.toISOString(),
      by: { name: h.actorName, email: h.actorEmail },
    })),
    attachments: t.attachments.map(a => ({
      id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt.toISOString(),
      url: `${APP_URL()}/api/v1/attachments/${a.id}`,
    })),
    equipment: t.equipment.map(e => ({ label: e.label, quantity: e.quantity, received: e.receivedQty })),
    // v3.92: people who follow the ticket without owning it — usually the
    // owners of tickets merged into it. They see it and are mailed about it.
    participants: (t.participants ?? []).map(p => ({ name: p.user.name ?? null, email: p.user.email })),
  }
}

// ── What callers send ────────────────────────────────────────────────────────

export type TicketOptions = { urgency: string[]; category: string[]; platform: string[] }

export type CreateInput = {
  type: "ticket" | "request"
  subject: string
  description: string
  ownerEmail: string
  ownerName: string | null
  urgency: string
  category: string
  platform: string
  phone: string
  computerName: string
  assignedTo: string | null
  notify: boolean
}

const CREATE_FIELDS = ["type", "subject", "description", "ownerEmail", "ownerName", "urgency", "category",
  "platform", "phone", "computerName", "assignedTo", "notify"]
const UPDATE_FIELDS = ["status", "holdReason", "urgency", "category", "platform", "type", "assignedTo",
  "subject", "description", "phone", "computerName", "note", "notify"]

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(body: Record<string, unknown>, name: string, errors: string[], opts: { required?: boolean; max?: number } = {}) {
  const v = body[name]
  if (v === undefined || v === null) {
    if (opts.required) errors.push(`${name} is required`)
    return undefined
  }
  if (typeof v !== "string") { errors.push(`${name} must be a string`); return undefined }
  const s = v.trim()
  if (opts.required && !s) { errors.push(`${name} must not be empty`); return undefined }
  if (opts.max && s.length > opts.max) { errors.push(`${name} is longer than ${opts.max} characters`); return undefined }
  return s
}

function oneOf(body: Record<string, unknown>, name: string, allowed: readonly string[], errors: string[]) {
  const v = text(body, name, errors)
  if (v === undefined) return undefined
  if (!allowed.includes(v)) { errors.push(`${name} must be one of: ${allowed.join(", ")}`); return undefined }
  return v
}

function unknownFields(body: Record<string, unknown>, known: string[], errors: string[]) {
  for (const k of Object.keys(body)) if (!known.includes(k)) errors.push(`unknown field: ${k}`)
}

export function parseCreate(body: unknown, options: TicketOptions): { input: CreateInput } | { errors: string[] } {
  if (!isObject(body)) return { errors: ["the body must be a JSON object"] }
  const errors: string[] = []
  unknownFields(body, CREATE_FIELDS, errors)
  const subject = text(body, "subject", errors, { required: true, max: 300 })
  const description = text(body, "description", errors, { required: true, max: 20_000 })
  const ownerEmail = text(body, "ownerEmail", errors, { required: true, max: 320 })
  if (ownerEmail && !EMAIL.test(ownerEmail)) errors.push("ownerEmail is not an email address")
  const assignedTo = text(body, "assignedTo", errors, { max: 320 })
  if (assignedTo && !EMAIL.test(assignedTo)) errors.push("assignedTo is not an email address")
  const type = oneOf(body, "type", TICKET_TYPES, errors)
  const urgency = oneOf(body, "urgency", options.urgency, errors)
  const category = oneOf(body, "category", options.category, errors)
  const platform = oneOf(body, "platform", options.platform, errors)
  if (body.notify !== undefined && typeof body.notify !== "boolean") errors.push("notify must be true or false")
  const ownerName = text(body, "ownerName", errors, { max: 200 })
  const phone = text(body, "phone", errors, { max: 50 })
  const computerName = text(body, "computerName", errors, { max: 100 })
  if (errors.length) return { errors }
  return {
    input: {
      type: normalizeType(type),
      subject: subject!, description: description!, ownerEmail: ownerEmail!.toLowerCase(),
      ownerName: ownerName || null,
      urgency: urgency ?? "בינוני", category: category ?? "אחר", platform: platform ?? "מחשב אישי",
      phone: phone ?? "", computerName: computerName ?? "",
      assignedTo: assignedTo ? assignedTo.toLowerCase() : null,
      notify: body.notify !== false,
    },
  }
}

export function parseUpdate(body: unknown, options: TicketOptions): { changes: TicketChanges; notify: boolean } | { errors: string[] } {
  if (!isObject(body)) return { errors: ["the body must be a JSON object"] }
  const errors: string[] = []
  unknownFields(body, UPDATE_FIELDS, errors)
  const changes: TicketChanges = {}
  const status = oneOf(body, "status", STATUSES, errors)
  if (status !== undefined) changes.status = status
  const holdReason = text(body, "holdReason", errors, { max: 500 })
  if (holdReason !== undefined) changes.holdReason = holdReason
  const urgency = oneOf(body, "urgency", options.urgency, errors)
  if (urgency !== undefined) changes.urgency = urgency
  const category = oneOf(body, "category", options.category, errors)
  if (category !== undefined) changes.category = category
  const platform = oneOf(body, "platform", options.platform, errors)
  if (platform !== undefined) changes.platform = platform
  const type = oneOf(body, "type", TICKET_TYPES, errors)
  if (type !== undefined) changes.type = type
  if (body.assignedTo !== undefined) {
    const a = text(body, "assignedTo", errors, { max: 320 })
    if (a !== undefined) {
      if (a && !EMAIL.test(a)) errors.push("assignedTo is not an email address (send \"\" to unassign)")
      else changes.assignedTo = a.toLowerCase()
    }
  }
  const subject = body.subject !== undefined ? text(body, "subject", errors, { required: true, max: 300 }) : undefined
  if (subject !== undefined) changes.subject = subject
  const description = body.description !== undefined ? text(body, "description", errors, { required: true, max: 20_000 }) : undefined
  if (description !== undefined) changes.description = description
  const phone = text(body, "phone", errors, { max: 50 })
  if (phone !== undefined) changes.phone = phone
  const computerName = text(body, "computerName", errors, { max: 100 })
  if (computerName !== undefined) changes.computerName = computerName
  const note = text(body, "note", errors, { max: 20_000 })
  if (note) changes.note = note
  if (body.notify !== undefined && typeof body.notify !== "boolean") errors.push("notify must be true or false")
  if (changes.status === "בהמתנה" && !changes.holdReason) errors.push("holdReason is required when status is בהמתנה")
  if (!errors.length && Object.keys(changes).length === 0) errors.push("nothing to change")
  if (errors.length) return { errors }
  return { changes, notify: body.notify !== false }
}

/** { content, authorName? } for a message or a note. */
export function parseEntry(body: unknown): { content: string; authorName: string | null; notify: boolean } | { errors: string[] } {
  if (!isObject(body)) return { errors: ["the body must be a JSON object"] }
  const errors: string[] = []
  unknownFields(body, ["content", "authorName", "notify"], errors)
  const content = text(body, "content", errors, { required: true, max: 20_000 })
  const authorName = text(body, "authorName", errors, { max: 200 })
  if (body.notify !== undefined && typeof body.notify !== "boolean") errors.push("notify must be true or false")
  if (errors.length) return { errors }
  return { content: content!, authorName: authorName || null, notify: body.notify !== false }
}
