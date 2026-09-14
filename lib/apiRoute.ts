/**
 * lib/apiRoute.ts — what every /api/v1 route shares (v3.88): finding a ticket
 * by any of its names, and the error every unexpected failure becomes.
 */

import { logError } from "@/lib/logError"
import { apiError } from "@/lib/apiKeys"
import { ticketRefWhere } from "@/lib/ticketType"

/** HDTC-597, REQ-601, 597 or the internal id — all name the same ticket. */
export function refWhere(ref: string): { ticketNumber: number } | { id: string } {
  const r = decodeURIComponent(ref).trim()
  return /^\d{1,9}$/.test(r) ? { ticketNumber: Number(r) } : ticketRefWhere(r)
}

/** Log the failure and answer 500 in the API's error shape. */
export async function serverError(err: unknown, source: string) {
  const e = err instanceof Error ? err : new Error(String(err))
  await logError(e.message, source, e.stack)
  return apiError(500, "server_error", "Something went wrong on our side. It has been logged.")
}
