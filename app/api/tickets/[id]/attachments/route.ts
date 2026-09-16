/**
 * app/api/tickets/[id]/attachments/route.ts — attach a file to a ticket
 *
 * The client posts { dataUrl, filename } — what the paste, drop and picker
 * handlers produce. What may be attached is decided in one place,
 * lib/attachmentTypes.ts: raster images and PDF / Office / text files, up to
 * MAX_ATTACHMENT_BYTES. The type is the one mimeForFile() settles on from the
 * data URL's declared type and the filename, so a .csv that Windows calls
 * vnd.ms-excel, or a PDF the browser could not type, is still accepted.
 *
 * FAILURES THE PAGE CAN SHOW (v3.84)
 * ──────────────────────────────────
 *   413 — too large           415 — type not allowed
 *   400 — no file, or not a base64 data URL
 * each with a Hebrew { error }. Until v3.84 anything but an image was a bare
 * 400, and the pages did not look at the answer: the person was told the
 * upload worked.
 *
 * The bytes go to uploads/ticket-attachments/ and the row to the DB through
 * storeAttachment(), shared with mail ingestion. Files are served by
 * GET /api/attachments/[id].
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { MAX_ATTACHMENT_DATAURL_LENGTH, decodeDataUrl } from "@/lib/attachmentStorage"
import { MAX_ATTACHMENT_BYTES, formatBytes, mimeForFile } from "@/lib/attachmentTypes"
import { storeAttachment } from "@/lib/storeAttachment"
import { canSeeTicket, PARTICIPANTS_SELECT } from "@/lib/ticketAccess"
import { mergedError } from "@/lib/ticketType"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const TOO_LARGE = `הקובץ גדול מדי (עד ${formatBytes(MAX_ATTACHMENT_BYTES)})`

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const body = (await req.json().catch(() => null)) as { dataUrl?: unknown; filename?: unknown } | null
    const dataUrl = body?.dataUrl
    const filename = typeof body?.filename === "string" ? body.filename : null

    if (typeof dataUrl !== "string") return NextResponse.json({ error: "לא התקבל קובץ" }, { status: 400 })
    if (dataUrl.length > MAX_ATTACHMENT_DATAURL_LENGTH) return NextResponse.json({ error: TOO_LARGE }, { status: 413 })

    const decoded = decodeDataUrl(dataUrl)
    if (!decoded) return NextResponse.json({ error: "הקובץ ריק או פגום" }, { status: 400 })

    const mimeType = mimeForFile(filename, decoded.declared)
    if (!mimeType) return NextResponse.json({ error: "סוג הקובץ אינו נתמך" }, { status: 415 })
    if (decoded.buffer.length > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: TOO_LARGE }, { status: 413 })

    // Staff, the owner, or a participant (v3.92) — and never onto a merged
    // ticket, whose files have moved to the one it was merged into.
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true, user: { select: { email: true } }, participants: PARTICIPANTS_SELECT,
        mergedInto: { select: { ticketNumber: true, type: true } },
      },
    })
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!canSeeTicket(ticket, session.user.email, isStaff)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (ticket.mergedInto) return NextResponse.json({ error: mergedError(ticket.mergedInto) }, { status: 409 })

    const attachment = await storeAttachment(id, { buffer: decoded.buffer, mimeType, filename })
    return NextResponse.json(attachment)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/attachments POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
