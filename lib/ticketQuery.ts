/**
 * lib/ticketQuery.ts — the /api/v1/tickets query string, checked and turned
 * into a Prisma query (v3.88). Pure: tested without a database.
 *
 * Filters — all optional, combined with AND; a comma means "any of":
 *   status, urgency, category, platform   exact values, e.g. status=פתוח,בטיפול
 *   type          ticket | request
 *   open          true (anything but סגור) | false (only סגור)
 *   assignedTo    an email, case-insensitive; "" never matches — use open/status
 *   owner         the owner's email, case-insensitive
 *   number        HDTC-12, REQ-12 or 12
 *   q             text in the subject or description, case-insensitive
 *   createdFrom, createdTo, updatedFrom, updatedTo
 *                 ISO dates or date-times; a bare date in *To means the whole day
 * Sort:   sort=createdAt | updatedAt | ticketNumber (default createdAt)
 *         order=asc | desc (default desc)
 * Paging: page (from 1, default 1), limit (1–200, default 50)
 *
 * Anything malformed is an error naming the parameter — an integration is
 * easier to write against a server that says what it did not understand than
 * one that quietly ignores it.
 */

import type { Prisma } from "@prisma/client"
import { parseTicketNumberQuery } from "@/lib/ticketSearch"

export const MAX_LIMIT = 200
export const DEFAULT_LIMIT = 50
export const SORT_FIELDS = ["createdAt", "updatedAt", "ticketNumber"] as const
type SortField = typeof SORT_FIELDS[number]

/** Every parameter the list understands; any other is refused. */
export const LIST_PARAMS = [
  "status", "urgency", "category", "platform", "type", "open", "assignedTo", "owner", "number", "q",
  "createdFrom", "createdTo", "updatedFrom", "updatedTo", "sort", "order", "page", "limit",
] as const

export type TicketListQuery = {
  where: Prisma.TicketWhereInput
  orderBy: Prisma.TicketOrderByWithRelationInput[]
  skip: number
  take: number
  page: number
  limit: number
}

const values = (v: string | null) => (v ?? "").split(",").map(s => s.trim()).filter(Boolean)
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function dateRange(params: URLSearchParams, from: string, to: string, errors: string[]) {
  const range: { gte?: Date; lt?: Date; lte?: Date } = {}
  const a = params.get(from)
  if (a) {
    const d = new Date(a)
    if (Number.isNaN(d.getTime())) errors.push(`${from} is not a date: ${a}`)
    else range.gte = d
  }
  const b = params.get(to)
  if (b) {
    const d = new Date(b)
    if (Number.isNaN(d.getTime())) errors.push(`${to} is not a date: ${b}`)
    else if (DATE_ONLY.test(b)) range.lt = new Date(d.getTime() + 24 * 60 * 60 * 1000)   // the whole day
    else range.lte = d
  }
  return Object.keys(range).length ? range : null
}

function wholeNumber(v: string | null, name: string, min: number, max: number, fallback: number, errors: string[]) {
  if (v === null || v === "") return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${name} must be a whole number from ${min} to ${max}`)
    return fallback
  }
  return n
}

export function parseTicketListQuery(params: URLSearchParams): TicketListQuery | { errors: string[] } {
  const errors: string[] = []
  const and: Prisma.TicketWhereInput[] = []

  for (const name of params.keys()) {
    if (!(LIST_PARAMS as readonly string[]).includes(name)) errors.push(`unknown parameter: ${name}`)
  }

  for (const field of ["status", "urgency", "category", "platform"] as const) {
    const wanted = values(params.get(field))
    if (wanted.length) and.push({ [field]: { in: wanted } })
  }

  const types = values(params.get("type"))
  if (types.length) {
    const bad = types.filter(t => t !== "ticket" && t !== "request")
    if (bad.length) errors.push(`type must be ticket or request, not: ${bad.join(", ")}`)
    else and.push({ type: { in: types } })
  }

  const open = params.get("open")
  if (open !== null) {
    if (open === "true") and.push({ status: { not: "סגור" } })
    else if (open === "false") and.push({ status: "סגור" })
    else errors.push("open must be true or false")
  }

  const assignedTo = params.get("assignedTo")?.trim()
  if (assignedTo) and.push({ assignedTo: { equals: assignedTo, mode: "insensitive" } })

  const owner = params.get("owner")?.trim()
  if (owner) and.push({ user: { email: { equals: owner, mode: "insensitive" } } })

  const number = params.get("number")
  if (number) {
    const n = parseTicketNumberQuery(number)
    if (n === null) errors.push(`number is not a ticket number: ${number}`)
    else and.push({ ticketNumber: n })
  }

  const q = params.get("q")?.trim()
  if (q) {
    and.push({ OR: [
      { subject: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ] })
  }

  const created = dateRange(params, "createdFrom", "createdTo", errors)
  if (created) and.push({ createdAt: created })
  const updated = dateRange(params, "updatedFrom", "updatedTo", errors)
  if (updated) and.push({ updatedAt: updated })

  const sort = params.get("sort") ?? "createdAt"
  if (!(SORT_FIELDS as readonly string[]).includes(sort)) errors.push(`sort must be one of: ${SORT_FIELDS.join(", ")}`)
  const order = params.get("order") ?? "desc"
  if (order !== "asc" && order !== "desc") errors.push("order must be asc or desc")

  const limit = wholeNumber(params.get("limit"), "limit", 1, MAX_LIMIT, DEFAULT_LIMIT, errors)
  const page = wholeNumber(params.get("page"), "page", 1, 1_000_000, 1, errors)

  if (errors.length) return { errors }
  const direction = order as "asc" | "desc"
  return {
    where: and.length ? { AND: and } : {},
    // The number breaks ties, so paging is stable when many rows share a time.
    orderBy: sort === "ticketNumber"
      ? [{ ticketNumber: direction }]
      : [{ [sort as SortField]: direction }, { ticketNumber: direction }],
    skip: (page - 1) * limit,
    take: limit,
    page,
    limit,
  }
}
