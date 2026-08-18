/**
 * lib/newEmployee.ts — Mandatory details for a new-employee ticket
 *
 * A ticket opened under the "עובד חדש" category is really an account-creation
 * request, and it is useless to the technician without four facts: the new
 * hire's first name, last name, phone number and what the job is. Those are
 * collected as their own form fields, and then FOLDED INTO THE DESCRIPTION as a
 * labelled block.
 *
 * Why into the description rather than into new columns:
 *   - the description is what every notification email, the mail-ingest reply
 *     chain and the printable ticket already carry, so the details travel with
 *     the ticket everywhere without touching a single template
 *   - no migration, and nothing to keep in sync when the description is edited
 *
 * The block is machine-readable on the way back out (parseNewEmployeeBlock), so
 * the ticket page can still render the details as a tidy card instead of raw
 * text. The description text stays authoritative: if a technician edits the
 * block by hand, what they typed is what everyone sees.
 *
 * Every value is collapsed to a single line on the way in. That keeps the block
 * trivially parseable and re-writable, and none of these four fields is a
 * paragraph — a job description here is "נציג מכירות, סניף מרכז", not an essay.
 *
 * Everything in this module is pure so it can be unit-tested without a DB.
 */

/**
 * The mandatory fields, in the order they are shown and written.
 *
 * `label` is what goes into the description block — inside a block headed
 * "פרטי העובד החדש", a bare "טלפון" is unambiguous. `formLabel` is what the
 * form shows, where the ticket already has a "טלפון" of its own (the caller's)
 * and the two must not read the same.
 */
export const NEW_EMPLOYEE_FIELDS = [
  { key: "firstName", label: "שם פרטי",     formLabel: "שם פרטי",     placeholder: "ישראל" },
  { key: "lastName",  label: "שם משפחה",    formLabel: "שם משפחה",    placeholder: "ישראלי" },
  { key: "phone",     label: "טלפון",       formLabel: "טלפון העובד", placeholder: "050-0000000" },
  { key: "jobTitle",  label: "תיאור תפקיד", formLabel: "תיאור תפקיד", placeholder: "נציג מכירות, סניף מרכז" },
] as const

export type NewEmployeeKey = (typeof NEW_EMPLOYEE_FIELDS)[number]["key"]
export type NewEmployeeDetails = Record<NewEmployeeKey, string>

/** A blank set of details — the form's initial state. */
export const EMPTY_NEW_EMPLOYEE: NewEmployeeDetails = {
  firstName: "", lastName: "", phone: "", jobTitle: "",
}

/**
 * Header line that opens the block inside the description. Distinctive enough
 * that it will not collide with anything a user types, and readable as-is in a
 * plain-text email.
 */
export const NEW_EMPLOYEE_BLOCK_HEADER = "── פרטי העובד החדש ──"

/** Ceiling on a single value — a guard against a pasted wall of text. */
export const MAX_VALUE_LENGTH = 200

const LABEL_BY_KEY = Object.fromEntries(
  NEW_EMPLOYEE_FIELDS.map(f => [f.key, f.label]),
) as Record<NewEmployeeKey, string>

const KEY_BY_LABEL = Object.fromEntries(
  NEW_EMPLOYEE_FIELDS.map(f => [f.label, f.key]),
) as Record<string, NewEmployeeKey>

// ── Normalisation ────────────────────────────────────────────────────────────

/** Collapse a value to a single trimmed, length-capped line. */
function oneLine(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/\s+/g, " ").trim().slice(0, MAX_VALUE_LENGTH)
}

/**
 * Turns an untrusted `newEmployee` payload into storable details. Unknown keys
 * are dropped and missing ones become empty strings, so the result always has
 * exactly the four fields.
 */
export function normalizeNewEmployee(raw: unknown): NewEmployeeDetails {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<NewEmployeeKey, unknown>>
  const details = { ...EMPTY_NEW_EMPLOYEE }
  for (const field of NEW_EMPLOYEE_FIELDS) {
    details[field.key] = oneLine(source[field.key])
  }
  return details
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Which of the four fields are still blank. Empty array means good to go. */
export function missingNewEmployeeFields(details: NewEmployeeDetails): NewEmployeeKey[] {
  return NEW_EMPLOYEE_FIELDS.filter(f => !details[f.key]?.trim()).map(f => f.key)
}

/** True when all four fields carry a value. */
export function isNewEmployeeComplete(details: NewEmployeeDetails): boolean {
  return missingNewEmployeeFields(details).length === 0
}

/** Hebrew labels of the missing fields, for the error shown to the user. */
export function missingFieldLabels(details: NewEmployeeDetails): string[] {
  return missingNewEmployeeFields(details).map(k => LABEL_BY_KEY[k])
}

// ── Rendering into / out of the description ──────────────────────────────────

/** The block on its own, header first, one "label: value" line per field. */
export function formatNewEmployeeBlock(details: NewEmployeeDetails): string {
  return [
    NEW_EMPLOYEE_BLOCK_HEADER,
    ...NEW_EMPLOYEE_FIELDS.map(f => `${f.label}: ${details[f.key] ?? ""}`),
  ].join("\n")
}

/**
 * Removes a previously written block from a description, so re-writing it never
 * stacks up duplicates. Everything the user wrote is preserved.
 */
export function stripNewEmployeeBlock(description: string): string {
  const lines = String(description ?? "").split("\n")
  let start = lines.findIndex(l => l.trim() === NEW_EMPLOYEE_BLOCK_HEADER)
  if (start === -1) return String(description ?? "")

  // The block ends at the first line that is not one of our labelled fields.
  let end = start + 1
  while (end < lines.length && parseFieldLine(lines[end])) end++

  // Take the blank separator line we inserted with it, so removing the block
  // does not leave a hole in the middle of the text.
  while (start > 0 && lines[start - 1].trim() === "") start--

  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").trimEnd()
}

/**
 * The description as it should be stored: what the user wrote, then the block.
 * Idempotent — calling it again with new details replaces the old block rather
 * than appending a second one.
 */
export function withNewEmployeeDetails(description: string, details: NewEmployeeDetails): string {
  const body = stripNewEmployeeBlock(description)
  const block = formatNewEmployeeBlock(details)
  return body.trim() ? `${body.trimEnd()}\n\n${block}` : block
}

/** Parse one "label: value" line into a [key, value] pair, or null. */
function parseFieldLine(line: string): [NewEmployeeKey, string] | null {
  const match = /^\s*([^:]+):\s*(.*)$/.exec(line ?? "")
  if (!match) return null
  const key = KEY_BY_LABEL[match[1].trim()]
  if (!key) return null
  return [key, match[2].trim()]
}

/**
 * Reads the details back out of a description.
 *
 * Returns null when there is no block at all, so the caller can tell "this is
 * not a new-employee ticket" from "it is, but a field was blanked out by hand".
 */
export function parseNewEmployeeBlock(description: string): NewEmployeeDetails | null {
  const lines = String(description ?? "").split("\n")
  const start = lines.findIndex(l => l.trim() === NEW_EMPLOYEE_BLOCK_HEADER)
  if (start === -1) return null

  const details = { ...EMPTY_NEW_EMPLOYEE }
  for (let i = start + 1; i < lines.length; i++) {
    const parsed = parseFieldLine(lines[i])
    if (!parsed) break
    details[parsed[0]] = parsed[1]
  }
  return details
}

/** The new hire's full name, for a heading. Empty when neither part is set. */
export function newEmployeeFullName(details: NewEmployeeDetails): string {
  return [details.firstName, details.lastName].filter(Boolean).join(" ").trim()
}
