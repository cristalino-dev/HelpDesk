/**
 * lib/attachmentStorage.ts — Ticket attachment storage (server filesystem)
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
 * The wire format from the client is unchanged: uploads POST a
 * { dataUrl, filename } JSON body — the server decodes it and writes bytes to
 * disk.
 *
 * v3.83: files as well as images (the lists are in lib/attachmentTypes.ts),
 * a 7 MB limit instead of ~2.25 MB, and responses that can no longer be turned
 * against the viewer — see attachmentResponseHeaders().
 *
 * The pure helpers are unit-tested; the fs helpers wrap them.
 */

import { mkdir, writeFile, readFile, unlink } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"
import {
  MAX_ATTACHMENT_BYTES, INLINE_IMAGE_TYPES, FILE_TYPES,
  isAllowedType, isInlineImageType, extensionOf,
} from "@/lib/attachmentTypes"

/**
 * Hard cap on a single upload, measured on the base64 data-URL string: the
 * base64 length of MAX_ATTACHMENT_BYTES plus room for the "data:…;base64,"
 * prefix of the longest MIME type on the list.
 */
export const MAX_ATTACHMENT_DATAURL_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 256

/** On-disk extension for a MIME type ("bin" for anything unrecognized). */
export function extensionForMime(mimeType: string): string {
  const m = (mimeType ?? "").toLowerCase()
  return INLINE_IMAGE_TYPES[m] ?? FILE_TYPES[m] ?? "bin"
}

/**
 * Parses an image data URL ("data:image/png;base64,....") into its MIME type
 * and decoded bytes. Kept for LEGACY rows only — pre-v3.48 attachments stored
 * inline. New uploads go through parseAttachmentDataUrl, which checks the
 * allow-list; this does not, because what it reads was written years ago.
 */
export function parseImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const m = /^data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ""))
  if (!m) return null
  const mimeType = m[1].toLowerCase()
  const buffer = Buffer.from(m[2], "base64")
  if (buffer.length === 0) return null
  return { mimeType, buffer }
}

/**
 * Parses an upload's data URL, accepting only the types in
 * lib/attachmentTypes.ts. Null for anything else — malformed, empty, or a type
 * that is not on the list (SVG among them).
 */
export function parseAttachmentDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl ?? ""))
  if (!m) return null
  const declared = m[1].toLowerCase()
  if (!isAllowedType(declared)) return null
  const buffer = Buffer.from(m[2], "base64")
  if (buffer.length === 0) return null
  return { mimeType: declared === "image/jpg" ? "image/jpeg" : declared, buffer }
}

/**
 * Splits any base64 data URL into the type it declares and its bytes — "" for
 * the type when it declares none (FileReader writes "data:application/octet-stream"
 * or bare "data:" for a file the OS could not type). Whether that type may be
 * attached is the caller's decision: mimeForFile() weighs it against the
 * filename. Null for anything that is not a non-empty base64 data URL.
 */
export function decodeDataUrl(dataUrl: string): { declared: string; buffer: Buffer } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*);base64,([A-Za-z0-9+/=\s]*)$/.exec(String(dataUrl ?? ""))
  if (!m) return null
  const buffer = Buffer.from(m[3], "base64")
  if (buffer.length === 0) return null
  return { declared: m[1].trim().toLowerCase(), buffer }
}

/**
 * Content-Disposition for serving an attachment. Raster images are inline —
 * the ticket shows them in <img>. Everything else is an attachment: the
 * browser downloads it rather than rendering it.
 *
 * The filename goes out twice: RFC 5987 `filename*` for the real, often
 * Hebrew, name, and a plain ASCII `filename` for clients that ignore the
 * first. Quotes and control characters are stripped, so a crafted filename
 * cannot break out of the header.
 */
export function contentDispositionFor(mimeType: string, filename?: string | null): string {
  const kind = isInlineImageType(mimeType) ? "inline" : "attachment"
  const name = (filename ?? "").replace(/[\u0000-\u001f\u007f"\\]/g, "").trim()
  const ext = extensionOf(name) || extensionForMime(mimeType)
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/[;,]/g, "_")
  const fallback = /[a-z0-9]/i.test(ascii.replace(/\.[^.]*$/, "")) ? ascii : `attachment.${ext}`
  if (!name) return `${kind}; filename="${fallback}"`
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/**
 * Every header an attachment is served with.
 *
 * Until v3.83 an attachment went out with only its stored Content-Type — so an
 * uploaded SVG, served as image/svg+xml from this origin and opened in a tab,
 * ran its script with the viewer's session. Now:
 *   • a type not on today's list (a legacy SVG among them) is served as
 *     application/octet-stream, as a download;
 *   • nosniff stops the browser second-guessing the type into something it
 *     will execute;
 *   • the CSP sandbox means that even a document the browser did choose to
 *     render would get no script, no same-origin access, nothing.
 */
export function attachmentResponseHeaders(
  mimeType: string | null | undefined, filename: string | null | undefined, length: number,
): Record<string, string> {
  const type = isAllowedType(mimeType) ? String(mimeType).toLowerCase() : "application/octet-stream"
  return {
    "Content-Type": type,
    "Content-Length": String(length),
    "Content-Disposition": contentDispositionFor(type, filename),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Content never changes for a given id — let the browser keep it.
    "Cache-Control": "private, max-age=31536000, immutable",
  }
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
