/**
 * lib/attachmentTypes.ts — what may be attached to a ticket, in one place.
 *
 * Client-safe (no fs, no Node APIs). The file picker, the paste handler, the
 * upload and serving routes and mail ingestion all read these lists, so a type
 * the picker offers is a type the server accepts, and the reverse.
 *
 * TWO KINDS (v3.83)
 * ─────────────────
 * Raster images are shown inline: a thumbnail on the ticket, a lightbox on
 * click. Everything else on the list — PDF, Office documents, plain text, CSV
 * — is a file: a named chip on the ticket, always served as a download and
 * never rendered by the browser.
 *
 * NOT ON THE LIST, DELIBERATELY
 * ─────────────────────────────
 * SVG. It is an image format that is also a document: it can carry <script>,
 * and served from this origin it runs with the viewer's session. Until v3.83
 * it was accepted and served inline — a stored-XSS hole that any signed-in
 * user could plant and a staff member trigger by opening the image in a tab.
 * HTML, executables and archives are out for the same reason or worse. HEIC is
 * out because no desktop browser except Safari can show it; iPhones convert to
 * JPEG when uploading through a browser anyway.
 */

/**
 * The largest attachment, in bytes. Uploads travel as base64 inside JSON, so
 * on the wire that is ~4/3 of this plus a little — inside the 10 MB body limit
 * configured on nginx in v3.83 (`client_max_body_size 10m`). Before that nginx
 * was on its 1 MB default and silently rejected anything over ~750 KB.
 */
export const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024

/** Raster images — shown inline. MIME type → on-disk extension. */
export const INLINE_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/gif":  "gif",
  "image/webp": "webp",
  "image/bmp":  "bmp",
  "image/avif": "avif",
}

/** Files — always a download. MIME type → on-disk extension. */
export const FILE_TYPES: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
}

/** Extension → the MIME type it is stored under. */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", avif: "image/avif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
}

const lower = (s?: string | null) => (s ?? "").toLowerCase().split(";")[0].trim()

export function isInlineImageType(mime?: string | null): boolean {
  return lower(mime) in INLINE_IMAGE_TYPES
}

export function isAllowedType(mime?: string | null): boolean {
  const m = lower(mime)
  return m in INLINE_IMAGE_TYPES || m in FILE_TYPES
}

/** "Invoice.PDF" → "pdf"; "" when there is none. */
export function extensionOf(filename?: string | null): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec((filename ?? "").trim())
  return m ? m[1].toLowerCase() : ""
}

/**
 * The MIME type to store a file under, or null when it may not be attached.
 *
 * The declared type wins when it names an allowed type. When it is missing or
 * generic — mail clients love application/octet-stream — the extension
 * decides. One known lie is corrected: Windows labels .csv files as
 * application/vnd.ms-excel. A declared type on neither list is refused even
 * when the extension looks harmless: an "invoice.pdf" that says text/html is
 * not a PDF, and would not be served as one.
 */
export function mimeForFile(filename?: string | null, declared?: string | null): string | null {
  const type = lower(declared)
  const byExt = BY_EXTENSION[extensionOf(filename)] ?? null
  if (!type || type === "application/octet-stream" || type === "binary/octet-stream") return byExt
  if (type === "application/vnd.ms-excel" && byExt === "text/csv") return "text/csv"
  if (!isAllowedType(type)) return null
  return type === "image/jpg" ? "image/jpeg" : type
}

/** For the picker's `accept`: types AND extensions, so every browser offers the same list. */
export const ACCEPT_ATTRIBUTE = [
  ...Object.keys(INLINE_IMAGE_TYPES),
  ...Object.keys(FILE_TYPES),
  ...Object.keys(BY_EXTENSION).map(ext => `.${ext}`),
].join(",")

/** 812 KB, 3.4 MB, 7 MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`
}

/** Icon and short label for a file chip. */
export function fileKind(mime?: string | null): { icon: string; label: string } {
  const m = lower(mime)
  if (m === "application/pdf") return { icon: "📄", label: "PDF" }
  if (m === "application/msword" || m.includes("wordprocessingml")) return { icon: "📝", label: "Word" }
  if (m === "text/csv") return { icon: "📊", label: "CSV" }
  if (m === "application/vnd.ms-excel" || m.includes("spreadsheetml")) return { icon: "📊", label: "Excel" }
  if (m === "application/vnd.ms-powerpoint" || m.includes("presentationml")) return { icon: "📽️", label: "PowerPoint" }
  if (m === "text/plain") return { icon: "🗒️", label: "טקסט" }
  if (isInlineImageType(m)) return { icon: "🖼️", label: "תמונה" }
  return { icon: "📎", label: "קובץ" }
}

// ── Shrinking photos before upload ──────────────────────────────────────────

/** Longest side, in pixels, an image is shrunk to. Plenty for a screenshot. */
export const SHRINK_MAX_SIDE = 2000
/** Images above this size are re-encoded even when small in pixels. */
export const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024

const SHRINKABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/bmp"])

/**
 * Whether, and to what, to shrink an image before upload — null to send it as
 * it is. The Aug 23 failure was a 2.8 MB phone photo; at 2000px it would have
 * been a few hundred KB.
 *
 * Only still images a canvas can re-encode reliably. Not GIF (it would lose
 * its animation) and not AVIF (encoder support is patchy). PNG stays PNG —
 * those are screenshots, and text in them must stay sharp — while photos and
 * BMPs become JPEG.
 */
export function shrinkPlan(
  width: number, height: number, bytes: number, mime: string,
): { width: number; height: number; mime: string } | null {
  const m = lower(mime)
  if (!SHRINKABLE.has(m) || width <= 0 || height <= 0) return null
  const longSide = Math.max(width, height)
  if (longSide <= SHRINK_MAX_SIDE && bytes <= SHRINK_ABOVE_BYTES) return null
  const scale = Math.min(1, SHRINK_MAX_SIDE / longSide)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    mime: m === "image/png" ? "image/png" : "image/jpeg",
  }
}

// ── When an upload fails ────────────────────────────────────────────────────

/**
 * Why an upload failed, in words for the person who tried. `status` is null
 * for a network failure. nginx answers 413 with an HTML page, not JSON, so the
 * status is what matters there — never assume a failed response has a body.
 */
export function describeUploadFailure(status: number | null, serverMessage?: string | null): string {
  if (status === null) return "שגיאת רשת — נסו שוב"
  if (status === 413) return `הקובץ גדול מדי (עד ${formatBytes(MAX_ATTACHMENT_BYTES)})`
  if (status === 415) return "סוג הקובץ אינו נתמך"
  if (status === 401 || status === 403) return "אין הרשאה לצרף קבצים לפנייה הזו"
  const msg = (serverMessage ?? "").trim()
  if (msg && status >= 400 && status < 500) return msg
  return `שגיאה בהעלאה (${status})`
}
