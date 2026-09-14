/**
 * lib/sla.ts — the SLA per ticket type, as admins set it (v3.87). Server only.
 *
 * Stored in AppSetting as "sla.ticket" and "sla.request" (workdays). A missing
 * or unusable value falls back to DEFAULT_SLA in lib/ticketType.ts, so a fresh
 * database behaves exactly like the defaults — 4 workdays for a ticket, 10 for
 * a request.
 */

import { prisma } from "@/lib/db"
import { DEFAULT_SLA, TICKET_TYPES, parseSlaWorkdays, type Sla } from "@/lib/ticketType"

const keyFor = (type: string) => `sla.${type}`

export async function getSla(): Promise<Sla> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: TICKET_TYPES.map(keyFor) } } })
  const sla: Sla = { ...DEFAULT_SLA }
  for (const type of TICKET_TYPES) {
    const value = parseSlaWorkdays(rows.find(r => r.key === keyFor(type))?.value)
    if (value !== null) sla[type] = value
  }
  return sla
}

export async function setSla(sla: Sla): Promise<Sla> {
  await prisma.$transaction(TICKET_TYPES.map(type => prisma.appSetting.upsert({
    where:  { key: keyFor(type) },
    create: { key: keyFor(type), value: String(sla[type]) },
    update: { value: String(sla[type]) },
  })))
  return getSla()
}
