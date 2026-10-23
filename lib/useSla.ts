"use client"
/**
 * lib/useSla.ts — the SLA per ticket type, for a page's overdue markers (v3.87).
 *
 * Starts on the defaults and swaps in the admins' values once
 * GET /api/settings/sla answers. Fetched once per page load and shared by
 * every component that asks; a failed fetch simply leaves the defaults.
 *
 * usePrioritySla() is the same for the SLA per internal priority (v3.107),
 * from the staff-only GET /api/settings/priority-sla.
 */

import { useEffect, useState } from "react"
import { DEFAULT_SLA, type Sla } from "@/lib/ticketType"
import { DEFAULT_PRIORITY_SLA, type PrioritySla } from "@/lib/internalPriority"

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

let cachedPriority: PrioritySla | null = null
let pendingPriority: Promise<PrioritySla> | null = null

function loadPriority(): Promise<PrioritySla> {
  if (cachedPriority) return Promise.resolve(cachedPriority)
  if (typeof fetch !== "function") return Promise.resolve(DEFAULT_PRIORITY_SLA)
  pendingPriority ??= fetch("/api/settings/priority-sla")
    .then(r => (r.ok ? r.json() : null))
    .then((s: Partial<PrioritySla> | null) => (cachedPriority = { ...DEFAULT_PRIORITY_SLA, ...(s ?? {}) }))
    .catch(() => DEFAULT_PRIORITY_SLA)
  return pendingPriority
}

/**
 * `enabled` false asks nothing — the endpoint is staff-only, and a page a
 * reporter also sees (the dashboard's ticket table) should not draw a 403.
 */
export function usePrioritySla(enabled = true): PrioritySla {
  const [sla, setSla] = useState<PrioritySla>(cachedPriority ?? DEFAULT_PRIORITY_SLA)
  useEffect(() => {
    if (!enabled) return
    let live = true
    void loadPriority().then(s => { if (live) setSla(s) })
    return () => { live = false }
  }, [enabled])
  return sla
}

export function forgetPrioritySla() {
  cachedPriority = null
  pendingPriority = null
}
