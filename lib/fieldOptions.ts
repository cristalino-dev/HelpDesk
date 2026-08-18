/**
 * lib/fieldOptions.ts — Shared field-option defaults and fetch helper.
 *
 * Ticket dropdown fields (category, platform, urgency) and the new-employee
 * equipment checklist are configurable from the admin "שדות מערכת" tab. This
 * module provides the hardcoded defaults used as the initial/fallback values,
 * and a fetch helper for client components.
 */

import { NEW_EMPLOYEE_CATEGORY, DEFAULT_EQUIPMENT } from "@/lib/equipment"

export const DEFAULT_CATEGORIES = ["חומרה", "תוכנה", "רשת", "מדפסת", NEW_EMPLOYEE_CATEGORY, "אחר"]
export const DEFAULT_PLATFORMS  = ["comax", "comax sales tracker", "אנדרואיד", "אייפד", "מחשב אישי"]
export const DEFAULT_URGENCIES  = ["נמוך", "בינוני", "גבוה", "דחוף"]

/**
 * Urgency values that are used by business logic (compound-close, sweep, sort)
 * and must not be removed — the DELETE endpoint enforces this server-side too.
 */
export const PROTECTED_URGENCIES = new Set(["נמוך", "בינוני", "גבוה", "דחוף"])

export type FieldOptions = {
  category:  string[]
  platform:  string[]
  urgency:   string[]
  equipment: string[]
}

export const DEFAULT_FIELD_OPTIONS: FieldOptions = {
  category:  DEFAULT_CATEGORIES,
  platform:  DEFAULT_PLATFORMS,
  urgency:   DEFAULT_URGENCIES,
  equipment: DEFAULT_EQUIPMENT,
}

export async function fetchFieldOptions(): Promise<FieldOptions> {
  try {
    const res = await fetch("/api/admin/field-options")
    if (!res.ok) return DEFAULT_FIELD_OPTIONS
    const data = await res.json()
    if (data && Array.isArray(data.category) && Array.isArray(data.platform) && Array.isArray(data.urgency)) {
      // `equipment` was added in v3.58 — tolerate a server that predates it.
      return { ...data, equipment: Array.isArray(data.equipment) ? data.equipment : DEFAULT_EQUIPMENT } as FieldOptions
    }
    return DEFAULT_FIELD_OPTIONS
  } catch {
    return DEFAULT_FIELD_OPTIONS
  }
}
