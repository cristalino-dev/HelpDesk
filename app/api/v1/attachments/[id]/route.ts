/**
 * GET /api/v1/attachments/{id} — an attachment's bytes, for other programs (v3.88).
 *
 * Read key. The ids come from a ticket's detail (GET /api/v1/tickets/{ref}).
 * Served with the same headers as the site's own download route
 * (attachmentResponseHeaders — rule 62): a raster image inline, anything else
 * as a download under its real name, nothing a browser would execute.
 */

import { prisma } from "@/lib/db"
import { authenticateApi, apiError } from "@/lib/apiKeys"
import { serverError } from "@/lib/apiRoute"
import { attachmentResponseHeaders, parseImageDataUrl, readAttachmentFile } from "@/lib/attachmentStorage"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateApi(req, "read")
    if ("response" in auth) return auth.response
    const { id } = await params

    const attachment = await prisma.ticketAttachment.findUnique({
      where: { id },
      select: { storedName: true, mimeType: true, dataUrl: true, filename: true },
    })
    if (!attachment) return apiError(404, "not_found", `No attachment ${id}.`)

    let body: Buffer | null = null
    let mimeType = attachment.mimeType
    if (attachment.storedName) body = await readAttachmentFile(attachment.storedName)
    if (!body && attachment.dataUrl) {
      const parsed = parseImageDataUrl(attachment.dataUrl)
      if (parsed) { body = parsed.buffer; mimeType = parsed.mimeType }
    }
    if (!body) return apiError(404, "file_missing", `Attachment ${id} has no file on the server.`)

    return new NextResponse(new Uint8Array(body), { headers: attachmentResponseHeaders(mimeType, attachment.filename, body.length) })
  } catch (err) {
    return serverError(err, "/api/v1/attachments/[id] GET")
  }
}
