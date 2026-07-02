/**
 * app/api/tickets/[id]/attachments/route.ts — Ticket image attachment upload
 *
 * The client wire format is a { dataUrl, filename } JSON body (what the
 * paste/drag/file handlers naturally produce). Since v3.48 the server decodes
 * the base64 payload and writes the bytes to uploads/ticket-attachments/;
 * the DB row holds only metadata. Images are served by GET /api/attachments/[id].
 */

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import {
  MAX_ATTACHMENT_DATAURL_LENGTH, parseImageDataUrl,
  buildAttachmentName, saveAttachmentFile, deleteAttachmentFile,
} from "@/lib/attachmentStorage"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const { dataUrl, filename } = await req.json()

    if (typeof dataUrl !== "string" || dataUrl.length > MAX_ATTACHMENT_DATAURL_LENGTH) {
      return NextResponse.json({ error: "Image too large (max 3MB)" }, { status: 400 })
    }
    const parsed = parseImageDataUrl(dataUrl)
    if (!parsed) return NextResponse.json({ error: "Invalid image" }, { status: 400 })

    // Verify user owns the ticket or is staff
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, user: { select: { email: true } } },
    })
    if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!isStaff && ticket.user.email !== session.user.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const storedName = buildAttachmentName(parsed.mimeType)
    await saveAttachmentFile(storedName, parsed.buffer)

    try {
      const attachment = await prisma.ticketAttachment.create({
        data: {
          ticketId: id,
          storedName,
          mimeType: parsed.mimeType,
          size: parsed.buffer.length,
          filename: filename ?? null,
        },
      })
      return NextResponse.json(attachment)
    } catch (dbErr) {
      // DB write failed — don't leave an orphan file on disk.
      await deleteAttachmentFile(storedName)
      throw dbErr
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/attachments POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
