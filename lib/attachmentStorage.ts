/**
 * lib/attachmentStorage.ts — Ticket image attachment storage (server filesystem)
 *
 * Since v3.48 ticket attachments live on the server filesystem, exactly like
 * printer drivers (lib/printerStorage.ts): the DB row (TicketAttachment) holds
 * only metadata, the bytes live under <cwd>/uploads/ticket-attachments/.
 * `uploads/` is NOT part of the deploy archive nor the `rm -rf` list in
 * deploy.sh, so attachments persist across deploys. `uploads/` is git-ignored.
 *
 * Pre-v3.48 rows stored the image inline as a base64 `dataUrl` column; those
 * are still served by GET /api/attachments/[id] as a fallback and are moved
 * to disk by scripts/migrate-attachments-to-disk.js.
 *
 * The wire format from the client is unchanged: uploads still POST a
 * { dataUrl, filename } JSON body (this is what the paste/drag handlers
 * naturally produce) — the server decodes it and writes bytes to disk.
 *
 * The pure helpers (parseImageDataUrl / extensionForMime / buildAttachmentName)
 * are unit-tested; the fs helpers wrap them.
 */

import { mkdir, writeFile, readFile, unlink } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"

/** Hard cap on a single upload, measured on the base64 data-URL string.
 *  (Matches the pre-v3.48 limit so client behavior is unchanged.) */
export const MAX_ATTACHMENT_DATAURL_LENGTH = 3 * 1024 * 1024 // ~3MB of base64

/** Maps the image MIME types we accept to an on-disk extension. */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/png":     "png",
  "image/jpeg":    "jpg",
  "image/jpg":     "jpg",
  "image/gif":     "gif",
  "image/webp":    "webp",
  "image/bmp":     "bmp",
  "image/svg+xml": "svg",
  "image/avif":    "avif",
}

/** On-disk extension for a MIME type ("bin" for anything unrecognized). */
export function extensionForMime(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType?.toLowerCase()] ?? "bin"
}

/**
 * Parses an image data URL ("data:image/png;base64,....") into its MIME type
 * and decoded bytes. Returns null for anything that isn't a base64 image
 * data URL — callers treat that as a 400.
 */
export function parseImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const m = /^data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ""))
  if (!m) return null
  const mimeType = m[1].toLowerCase()
  const buffer = Buffer.from(m[2], "base64")
  if (buffer.length === 0) return null
  return { mimeType, buffer }
}

/** Build a unique on-disk name: "<uuid>.<ext>". The original filename is kept
 *  in the DB row only — nothing user-controlled ever reaches the filesystem. */
export function buildAttachmentName(mimeType: string): string {
  return `${randomUUID()}.${extensionForMime(mimeType)}`
}

/** Absolute path to the directory that holds attachment files. */
export function attachmentsDir(): string {
  return path.join(process.cwd(), "uploads", "ticket-attachments")
}

/** Absolute disk path for a stored attachment, guarded against traversal. */
export function attachmentDiskPath(storedName: string): string {
  return path.join(attachmentsDir(), path.basename(storedName))
}

/** Write an attachment file to disk (creates the directory if needed). */
export async function saveAttachmentFile(storedName: string, data: Buffer): Promise<void> {
  await mkdir(attachmentsDir(), { recursive: true })
  await writeFile(attachmentDiskPath(storedName), data)
}

/** Read an attachment file from disk. Returns null when the file is missing. */
export async function readAttachmentFile(storedName: string): Promise<Buffer | null> {
  try {
    return await readFile(attachmentDiskPath(storedName))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null
    throw err
  }
}

/** Delete an attachment file from disk. Missing files are ignored. */
export async function deleteAttachmentFile(storedName: string): Promise<void> {
  try {
    await unlink(attachmentDiskPath(storedName))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
  }
}
