/**
 * lib/contactDetails.ts — the best phone and machine we know for a person
 *
 * WHY THIS EXISTS
 * ───────────────
 * An admin filing a ticket for someone else needs THAT person's phone number
 * and workstation, not their own. The obvious source is the user's profile —
 * but almost nobody visits /profile, so for most people those columns are
 * null, and the picker was blanking the fields with nothing to put back.
 *
 * The details are not actually missing. Every ticket a person has ever opened
 * carries the phone and machine they typed at the time, because both fields
 * are required on the form. So there are two sources, in order of authority:
 *
 *   profile   what the person deliberately saved about themselves
 *   ticket    what they last typed on a ticket of their own
 *
 * Resolved FIELD BY FIELD, not as a pair: someone may have saved a phone
 * number and never a machine name, and the answer for the machine is then the
 * ticket, not nothing.
 *
 * `app/api/tickets` also writes a ticket's values back into any profile field
 * that is still empty, so this fallback shrinks over time rather than being a
 * permanent crutch.
 */

/** Where a value came from. `none` means we genuinely do not know it. */
export type ContactSource = "profile" | "ticket" | "none"

export type KnownContact = {
  phone: string
  station: string
  phoneFrom: ContactSource
  stationFrom: ContactSource
}

/** Trim, and treat whitespace-only as absent — a space is not a phone number. */
function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : ""
}

/**
 * Pick the best value for each field.
 *
 * `profile` is what the User row holds; `ticket` is what their most recent
 * ticket that actually filled the field holds.
 */
export function resolveContact(
  profile: { phone?: string | null; station?: string | null } | null | undefined,
  ticket: { phone?: string | null; computerName?: string | null } | null | undefined,
): KnownContact {
  const pick = (a: string, b: string): [string, ContactSource] =>
    a ? [a, "profile"] : b ? [b, "ticket"] : ["", "none"]

  const [phone, phoneFrom] = pick(clean(profile?.phone), clean(ticket?.phone))
  const [station, stationFrom] = pick(clean(profile?.station), clean(ticket?.computerName))
  return { phone, station, phoneFrom, stationFrom }
}

/**
 * One Hebrew line telling the admin what just happened to the two fields they
 * did not touch. Silence here is the actual bug being fixed: a form that
 * quietly rewrites — or quietly empties — two required fields is a form whose
 * output nobody can trust.
 */
export function contactSummary(c: KnownContact): string {
  if (c.phoneFrom === "none" && c.stationFrom === "none") {
    return "אין פרטי טלפון ומחשב שמורים למשתמש זה — יש למלא אותם ידנית."
  }
  const from = (s: ContactSource) => (s === "profile" ? "מהפרופיל" : s === "ticket" ? "מפנייה קודמת" : "")
  const parts: string[] = []
  if (c.phoneFrom !== "none") parts.push(`טלפון ${from(c.phoneFrom)}`)
  if (c.stationFrom !== "none") parts.push(`שם מחשב ${from(c.stationFrom)}`)
  const filled = parts.join(", ")
  const missing =
    c.phoneFrom === "none" ? " יש להשלים את הטלפון ידנית."
    : c.stationFrom === "none" ? " יש להשלים את שם המחשב ידנית."
    : ""
  return `הפרטים מולאו אוטומטית: ${filled}.${missing}`
}

/**
 * Read a KnownContact off a row from GET /api/users?withContact=1.
 *
 * The values there are already resolved, so re-running resolveContact on them
 * would work but would report every value as coming from the profile — losing
 * exactly the distinction the endpoint went to the trouble of computing. The
 * source labels are optional so a response from an older build (or the endpoint
 * without the flag) degrades to "profile" rather than throwing.
 */
export function contactFromRow(row: {
  phone?: string | null
  station?: string | null
  phoneFrom?: ContactSource
  stationFrom?: ContactSource
}): KnownContact {
  const phone = clean(row.phone)
  const station = clean(row.station)
  return {
    phone,
    station,
    phoneFrom: phone ? row.phoneFrom ?? "profile" : "none",
    stationFrom: station ? row.stationFrom ?? "profile" : "none",
  }
}
