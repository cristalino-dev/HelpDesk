"use client"
/**
 * lib/useSla.ts — the SLA per ticket type, for a page's overdue markers (v3.87).
 *
 * Starts on the defaults and swaps in the admins' values once
 * GET /api/settings/sla answers. Fetched once per page load and shared by
 * every component that asks; a failed fetch simply leaves the defaults.
 */

import { useEffect, useState } from "react"
import { DEFAULT_SLA, type Sla } from "@/lib/ticketType"

let cached: Sla | null = null
let pending: Promise<Sla> | null = null

function load(): Promise<Sla> {
  if (cached) return Promise.resolve(cached)
  // No fetch (an old browser, or a test environment): the defaults it is.
  if (typeof fetch !== "function") return Promise.resolve(DEFAULT_SLA)
  pending ??= fetch("/api/settings/sla")
    .then(r => (r.ok ? r.json() : null))
    .then((s: Partial<Sla> | null) => (cached = { ...DEFAULT_SLA, ...(s ?? {}) }))
    .catch(() => DEFAULT_SLA)
  return pending
}

export function useSla(): Sla {
  const [sla, setSla] = useState<Sla>(cached ?? DEFAULT_SLA)
  useEffect(() => {
    let live = true
    void load().then(s => { if (live) setSla(s) })
    return () => { live = false }
  }, [])
  return sla
}

/** Forget the stored values — after an admin saves new ones, so the next read fetches them. */
export function forgetSla() {
  cached = null
  pending = null
}
