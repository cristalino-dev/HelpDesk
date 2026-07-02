/**
 * app/api/attachments/[id]/route.ts — Serve a ticket image attachment
 *
 * Attachment bytes live on the server filesystem since v3.48 (see
 * lib/attachmentStorage.ts); the ticket detail payload carries only metadata
 * and the client renders <img src="/api/attachments/<id>">.
 *
 * Legacy rows uploaded before v3.48 may still hold an inline base64 dataUrl —
 * those are decoded and served the same way, so nothing breaks while (or if)
 * the disk migration script hasn't run.
 *
 * AUTHORIZATION: staff sees everything; a regular user only attachments that
 * belong to their own tickets — same rule as the ticket detail endpoint.
 *
 * Attachment content never changes for a given id, so responses are marked
 * immutable — the browser won't re-download images on every detail-page visit.
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { parseImageDataUrl, readAttachmentFile } from "@/lib/attachmentStorage"
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
        storedName: true, mimeType: true, dataUrl: true,
        ticket: { select: { user: { select: { email: true } } } },
      },
    })
    if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff && attachment.ticket.user.email !== session.user.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: Buffer | null = null
    let mimeType = attachment.mimeType ?? "application/octet-stream"

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
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(body.length),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/attachments/[id] GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
