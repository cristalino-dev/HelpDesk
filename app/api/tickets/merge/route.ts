/**
 * app/api/tickets/merge/route.ts — merging tickets (v3.92). Staff only.
 *
 * GET  ?refs=HDTC-12,HDTC-15,…  → { tickets: MergePreviewTicket[], notFound: string[] }
 *      What the merge dialog shows before anyone confirms: each ticket's
 *      subject, owner, participants and how much it carries, and — for each of
 *      them as the one that stays — why the merge could not go ahead
 *      (`problems`, empty when it can). A ref is HDTC-N, REQ-N, N or an id.
 *
 * POST { targetId, sourceIds[] } → { ok, target, merged[], participantsAdded[] }
 *      Merges the sources into the target — the rules are in
 *      lib/ticketMerge.ts. All or nothing: 409 with `problems` when any source
 *      cannot be merged, and nothing is written. The mail goes out in after().
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { ticketLabel, ticketRefWhere } from "@/lib/ticketType"
import { MAX_MERGE, MERGE_INCLUDE, mergeProblems, mergeTickets, type MergeTicket } from "@/lib/ticketMerge"
import type { MergePreviewTicket } from "@/types/ticket"
import { NextRequest, NextResponse, after } from "next/server"

function refWhere(ref: string) {
  const r = ref.trim().replace(/^#/, "")
  return /^\d{1,9}$/.test(r) ? { ticketNumber: Number(r) } : ticketRefWhere(r)
}

function preview(t: MergeTicket, all: MergeTicket[]): MergePreviewTicket {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    type: t.type,
    label: ticketLabel(t),
    subject: t.subject,
    status: t.status,
    urgency: t.urgency,
    createdAt: t.createdAt.toISOString(),
    owner: { name: t.user.name, email: t.user.email },
    participants: t.participants.map(p => ({ name: p.user.name, email: p.user.email })),
    counts: { messages: t._count.messages, notes: t._count.notes, attachments: t._count.attachments, equipment: t._count.equipment },
    mergedInto: t.mergedInto ? ticketLabel(t.mergedInto) : null,
    problems: mergeProblems(t, all.filter(o => o.id !== t.id)).map(p => p.error),
  }
}

async function staffSession() {
  const session = await auth()
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
  if (!isStaff) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { session }
}

export async function GET(req: NextRequest) {
  try {
    const gate = await staffSession()
    if ("response" in gate) return gate.response

    const refs = [...new Set((req.nextUrl.searchParams.get("refs") ?? "").split(",").map(r => r.trim()).filter(Boolean))]
    if (refs.length === 0) return NextResponse.json({ error: "לא נבחרו פניות" }, { status: 400 })
    if (refs.length > MAX_MERGE) return NextResponse.json({ error: `ניתן למזג עד ${MAX_MERGE} פניות בבת אחת` }, { status: 400 })

    const found: MergeTicket[] = []
    const notFound: string[] = []
    for (const ref of refs) {
      const t = await prisma.ticket.findUnique({ where: refWhere(ref), include: MERGE_INCLUDE })
      if (!t) notFound.push(ref)
      else if (!found.some(f => f.id === t.id)) found.push(t)
    }

    return NextResponse.json({ tickets: found.map(t => preview(t, found)), notFound })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/merge GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await staffSession()
    if ("response" in gate) return gate.response
    const { session } = gate

    const body = (await req.json().catch(() => null)) as { targetId?: unknown; sourceIds?: unknown } | null
    const targetId = typeof body?.targetId === "string" ? body.targetId : ""
    const sourceIds = Array.isArray(body?.sourceIds)
      ? [...new Set(body.sourceIds.filter((s): s is string => typeof s === "string" && s !== ""))]
      : []
    if (!targetId) return NextResponse.json({ error: "לא נבחרה הפנייה שנשארת" }, { status: 400 })
    if (sourceIds.length === 0) return NextResponse.json({ error: "לא נבחרו פניות למיזוג" }, { status: 400 })
    if (sourceIds.length + 1 > MAX_MERGE) {
      return NextResponse.json({ error: `ניתן למזג עד ${MAX_MERGE} פניות בבת אחת` }, { status: 400 })
    }

    const target = await prisma.ticket.findUnique({ where: { id: targetId }, include: MERGE_INCLUDE })
    if (!target) return NextResponse.json({ error: "הפנייה שנשארת לא נמצאה" }, { status: 404 })
    const sources: MergeTicket[] = []
    for (const id of sourceIds) {
      const s = await prisma.ticket.findUnique({ where: { id }, include: MERGE_INCLUDE })
      if (!s) return NextResponse.json({ error: "אחת הפניות למיזוג לא נמצאה" }, { status: 404 })
      sources.push(s)
    }

    const actor = { name: session.user.name ?? session.user.email ?? "צוות", email: session.user.email ?? "" }
    const result = await mergeTickets({ target, sources, actor })
    if (!result.ok) {
      return NextResponse.json({ error: result.problems.map(p => p.error).join(" · "), problems: result.problems }, { status: 409 })
    }
    // The response reports the merge, written above; the mail is after() (rule 41).
    if (result.mails.length > 0) after(async () => { await Promise.all(result.mails) })

    return NextResponse.json({
      ok: true,
      target: { id: result.target.id, ticketNumber: result.target.ticketNumber, type: result.target.type, label: ticketLabel(result.target) },
      merged: result.merged.map(s => ({ id: s.id, ticketNumber: s.ticketNumber, type: s.type, label: ticketLabel(s) })),
      participantsAdded: result.participantsAdded.map(p => ({ name: p.name, email: p.email })),
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/merge POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
