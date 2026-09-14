/**
 * lib/storeAttachment.ts — save one attachment: the bytes to disk, the row to the DB.
 *
 * Shared by the upload route and mail ingestion (v3.83), so both obey the same
 * rules and neither can leave half a record behind: if the row cannot be
 * written, the file that was just written is removed again.
 *
 * Nothing user-controlled reaches the filesystem. The on-disk name is a UUID
 * (buildAttachmentName); the original filename is kept in the DB row only,
 * after cleanFilename() has taken out paths, control characters and quotes —
 * it is later written into a Content-Disposition header.
 */

import { prisma } from "@/lib/db"
import { buildAttachmentName, saveAttachmentFile, deleteAttachmentFile } from "@/lib/attachmentStorage"
import { MAX_ATTACHMENT_BYTES, isAllowedType } from "@/lib/attachmentTypes"

/** "C:\\scans\\טופס.pdf" → "טופס.pdf". Null when nothing usable is left. */
export function cleanFilename(name?: string | null): string | null {
  const base = (name ?? "").split(/[\\/]/).pop() ?? ""
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 200)
  return clean || null
}

export async function storeAttachment(
  ticketId: string,
  file: { buffer: Buffer; mimeType: string; filename?: string | null },
) {
  // The callers check these first and give the person a reason; these are
  // the last line, so nothing unlisted or oversized is ever written.
  if (!isAllowedType(file.mimeType)) throw new Error(`attachment type not allowed: ${file.mimeType}`)
  if (file.buffer.length === 0 || file.buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`attachment size out of range: ${file.buffer.length}`)
  }

  const storedName = buildAttachmentName(file.mimeType)
  await saveAttachmentFile(storedName, file.buffer)
  try {
    return await prisma.ticketAttachment.create({
      data: {
        ticketId,
        storedName,
        mimeType: file.mimeType,
        size: file.buffer.length,
        filename: cleanFilename(file.filename),
      },
    })
  } catch (err) {
    // The row failed — do not leave an orphan file on disk.
    await deleteAttachmentFile(storedName)
    throw err
  }
}
