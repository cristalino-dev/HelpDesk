/**
 * lib/prepareAttachment.ts — turn a picked, dropped or pasted File into
 * something the upload route will accept, or say why not (v3.84).
 *
 * Runs in the browser. Three jobs:
 *   1. Settle the type the way the server will (mimeForFile — the declared
 *      type, then the extension) and refuse what the server would refuse, now,
 *      with a reason the person can read. Until v3.84 anything that was not an
 *      image was dropped without a word.
 *   2. Shrink big photos and 4K screenshots (shrinkPlan). The failure that
 *      started this was a 3.8 MB phone photo; at 2000px it is a few hundred KB.
 *   3. Refuse whatever is still over MAX_ATTACHMENT_BYTES.
 *
 * Where the browser has no createImageBitmap or canvas (jsdom in the tests, a
 * very old browser) the original bytes go as they are. The server's limit
 * holds either way; this is about failing early and kindly.
 */

import type { PendingImage } from "@/components/ImageAttachments"
import {
  MAX_ATTACHMENT_BYTES, SHRINK_ABOVE_BYTES,
  extensionOf, formatBytes, isInlineImageType, mimeForFile, shrinkPlan,
} from "@/lib/attachmentTypes"

export type Prepared =
  | { ok: true; item: PendingImage }
  | { ok: false; name: string; reason: string }

/** How many bytes a base64 data URL decodes to. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",")
  const b64 = comma < 0 ? "" : dataUrl.slice(comma + 1).replace(/\s/g, "")
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** The same data URL, declaring `mime`. FileReader writes whatever the OS said — often nothing useful. */
export function withMime(dataUrl: string, mime: string): string {
  const comma = dataUrl.indexOf(",")
  return comma < 0 ? dataUrl : `data:${mime};base64,${dataUrl.slice(comma + 1)}`
}

/** "shot.png" re-encoded as JPEG becomes "shot.jpg", so the name matches what it now is. */
function renameFor(filename: string, mime: string): string {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : ""
  if (!ext || extensionOf(filename) === ext) return filename
  return /\.[a-z0-9]{1,5}$/i.test(filename) ? filename.replace(/\.[a-z0-9]{1,5}$/i, `.${ext}`) : `${filename}.${ext}`
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(file)
  })
}

/**
 * Re-encode an image following shrinkPlan(). Null when it needs no shrinking,
 * when the browser cannot do it, or when the result would not be smaller.
 */
async function shrink(file: File, mime: string): Promise<{ dataUrl: string; mime: string } | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { return null }
  try {
    const plan = shrinkPlan(bitmap.width, bitmap.height, file.size, mime)
    if (!plan) return null
    const canvas = document.createElement("canvas")
    canvas.width = plan.width
    canvas.height = plan.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    // JPEG has no transparency: without a ground, transparent pixels turn black.
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, plan.width, plan.height)
    ctx.drawImage(bitmap, 0, 0, plan.width, plan.height)

    let outMime = plan.mime
    let out = canvas.toDataURL(outMime, 0.85)
    // A photo that was saved as PNG can stay big after resizing; JPEG it then.
    if (outMime === "image/png" && dataUrlBytes(out) > SHRINK_ABOVE_BYTES) {
      outMime = "image/jpeg"
      out = canvas.toDataURL(outMime, 0.85)
    }
    if (!out.startsWith(`data:${outMime}`) || dataUrlBytes(out) >= file.size) return null
    return { dataUrl: out, mime: outMime }
  } catch {
    return null
  } finally {
    bitmap.close?.()
  }
}

/**
 * Prepare one file for upload. `fallbackName` names a file that has none — a
 * pasted screenshot usually.
 */
export async function prepareAttachment(file: File, fallbackName = "קובץ"): Promise<Prepared> {
  const name = file.name || fallbackName
  const mime = mimeForFile(name, file.type)
  if (!mime) {
    const ext = extensionOf(name)
    return { ok: false, name, reason: ext ? `סוג הקובץ .${ext} אינו נתמך` : "סוג הקובץ אינו נתמך" }
  }
  if (file.size === 0) return { ok: false, name, reason: "הקובץ ריק" }

  const tooLarge = (bytes: number) =>
    ({ ok: false as const, name, reason: `הקובץ גדול מדי (${formatBytes(bytes)}; עד ${formatBytes(MAX_ATTACHMENT_BYTES)})` })

  // Only an image can come down in size; anything else over the limit is
  // refused before a single byte of it is read.
  if (!isInlineImageType(mime) && file.size > MAX_ATTACHMENT_BYTES) return tooLarge(file.size)

  let dataUrl: string
  let finalMime = mime
  let filename = name
  const shrunk = isInlineImageType(mime) ? await shrink(file, mime) : null
  if (shrunk) {
    dataUrl = shrunk.dataUrl
    finalMime = shrunk.mime
    filename = renameFor(name, shrunk.mime)
  } else {
    try {
      dataUrl = withMime(await readAsDataUrl(file), mime)
    } catch {
      return { ok: false, name, reason: "לא ניתן לקרוא את הקובץ" }
    }
  }

  const size = dataUrlBytes(dataUrl)
  if (size > MAX_ATTACHMENT_BYTES) return tooLarge(size)
  return { ok: true, item: { dataUrl, filename, mimeType: finalMime, size } }
}

/** Prepare several at once: what can be attached, and what cannot, with why. */
export async function prepareAttachments(
  files: File[],
): Promise<{ items: PendingImage[]; failures: { name: string; reason: string }[] }> {
  const results = await Promise.all(files.map(f => prepareAttachment(f)))
  return {
    items: results.flatMap(r => (r.ok ? [r.item] : [])),
    failures: results.flatMap(r => (r.ok ? [] : [{ name: r.name, reason: r.reason }])),
  }
}
