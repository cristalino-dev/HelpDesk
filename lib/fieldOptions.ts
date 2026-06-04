/**
 * lib/fieldOptions.ts — Shared field-option defaults and fetch helper.
 *
 * Ticket dropdown fields (category, platform, urgency) are configurable from
 * the admin "שדות מערכת" tab. This module provides the hardcoded defaults used
 * as the initial/fallback values, and a fetch helper for client components.
 */

export const DEFAULT_CATEGORIES = ["חומרה", "תוכנה", "רשת", "מדפסת", "אחר"]
export const DEFAULT_PLATFORMS  = ["comax", "comax sales tracker", "אנדרואיד", "אייפד", "מחשב אישי"]
export const DEFAULT_URGENCIES  = ["נמוך", "בינוני", "גבוה", "דחוף"]

/**
 * Urgency values that are used by business logic (compound-close, sweep, sort)
 * and must not be removed — the DELETE endpoint enforces this server-side too.
 */
export const PROTECTED_URGENCIES = new Set(["נמוך", "בינוני", "גבוה", "דחוף"])

export type FieldOptions = {
  category: string[]
  platform: string[]
  urgency:  string[]
}

export const DEFAULT_FIELD_OPTIONS: FieldOptions = {
  category: DEFAULT_CATEGORIES,
  platform: DEFAULT_PLATFORMS,
  urgency:  DEFAULT_URGENCIES,
}

/** Fetch all field options from the server. Falls back to defaults on any error. */
export async function fetchFieldOptions(): Promise<FieldOptions> {
  try {
    const res = await fetch("/api/admin/field-options")
    if (!res.ok) return DEFAULT_FIELD_OPTIONS
    return res.json()
  } catch {
    return DEFAULT_FIELD_OPTIONS
  }
}
