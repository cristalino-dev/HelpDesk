/**
 * app/api/attachments/[id]/route.ts — Serve a ticket attachment
 *
 * Attachment bytes live on the server filesystem since v3.48 (see
 * lib/attachmentStorage.ts); the ticket detail payload carries only metadata
 * and the client renders <img src="/api/attachments/<id>"> for an image, a
 * download link for anything else.
 *
 * Legacy rows uploaded before v3.48 may still hold an inline base64 dataUrl —
 * those are decoded and served the same way, so nothing breaks while (or if)
 * the disk migration script hasn't run.
 *
 * AUTHORIZATION: staff sees everything; a regular user only attachments that
 * belong to their own tickets — same rule as the ticket detail endpoint.
 *
 * HEADERS (v3.84): attachmentResponseHeaders(). Until then a file went out
 * with nothing but its stored Content-Type, so an uploaded SVG opened in a tab
 * ran its script with the viewer's session. Now a raster image is served
 * inline and everything else as a download under its original name; a type
 * not on today's list (a legacy SVG) goes out as application/octet-stream;
 * nosniff and a CSP sandbox keep the browser from executing any of it.
 * Content never changes for a given id, so responses are marked immutable.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { canSeeTicket, PARTICIPANTS_SELECT } from "@/lib/ticketAccess"
import { attachmentResponseHeaders, parseImageDataUrl, readAttachmentFile } from "@/lib/attachmentStorage"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const attachment = await prisma.ticketAttachment.findUnique({
      where: { id },
      select: {
        storedName: true, mimeType: true, dataUrl: true, filename: true,
        ticket: { select: { user: { select: { email: true } }, participants: PARTICIPANTS_SELECT } },
      },
    })
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!canSeeTicket(attachment.ticket, session.user.email, isStaff)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: Buffer | null = null
    let mimeType = attachment.mimeType

    if (attachment.storedName) {
      body = await readAttachmentFile(attachment.storedName)
    }
    if (!body && attachment.dataUrl) {
      // Legacy inline base64 row (pre-v3.48), or disk file missing.
      const parsed = parseImageDataUrl(attachment.dataUrl)
      if (parsed) { body = parsed.buffer; mimeType = parsed.mimeType }
    }
    if (!body) return NextResponse.json({ error: "File missing" }, { status: 404 })

    return new NextResponse(new Uint8Array(body), {
      headers: attachmentResponseHeaders(mimeType, attachment.filename, body.length),
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/attachments/[id] GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
