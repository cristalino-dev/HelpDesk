/**
 * lib/mailAttachments.ts — which attachments on an inbound mail are kept (v3.84).
 *
 * Pure, like lib/mailIngest.ts: the ingest route hands over what mailparser
 * found and gets back what to save and what to mention. The type and size
 * rules are the upload route's — lib/attachmentTypes.ts decides both — plus two
 * that only mail needs:
 *
 *   • A small inline image the HTML body refers to (`related`, under 20 KB) is
 *     a logo in someone's signature. Nearly every Outlook mail carries a few;
 *     saving them would bury the one screenshot that matters. Skipped, and not
 *     listed. A large inline image — a screenshot pasted into the body — is kept.
 *   • At most MAX_MAIL_ATTACHMENTS per mail. Forty scans is someone forwarding a
 *     folder, and the ticket says so.
 *
 * Everything else that is not kept is named in the ticket with the reason, so
 * nobody wonders where the attachment went. Until v3.84 every mail attachment
 * was dropped without a word.
 */

import { MAX_ATTACHMENT_BYTES, formatBytes, isInlineImageType, mimeForFile } from "@/lib/attachmentTypes"

export const MAX_MAIL_ATTACHMENTS = 10
export const SIGNATURE_IMAGE_BYTES = 20 * 1024

/** A mailparser attachment — as much of one as the plan reads. */
export interface MailAttachmentIn {
  filename?: string | null
  contentType?: string | null
  size?: number | null
  related?: boolean | null
  content?: { length: number } | null
}

export interface MailAttachmentPlan {
  /** Index into the input, and the name and type to store it under. */
  keep: { index: number; filename: string | null; mimeType: string }[]
  dropped: { name: string; reason: string }[]
}

export function planMailAttachments(atts: readonly MailAttachmentIn[] | null | undefined): MailAttachmentPlan {
  const plan: MailAttachmentPlan = { keep: [], dropped: [] }
  ;(atts ?? []).forEach((a, index) => {
    const filename = (a.filename ?? "").trim() || null
    const name = filename ?? "קובץ ללא שם"
    const bytes = a.content?.length ?? a.size ?? 0
    const mimeType = mimeForFile(filename, a.contentType)

    if (a.related && isInlineImageType(mimeType ?? a.contentType) && bytes < SIGNATURE_IMAGE_BYTES) return
    if (!mimeType) { plan.dropped.push({ name, reason: "סוג הקובץ אינו נתמך" }); return }
    if (bytes === 0) { plan.dropped.push({ name, reason: "הקובץ ריק" }); return }
    if (bytes > MAX_ATTACHMENT_BYTES) {
      plan.dropped.push({ name, reason: `גדול מדי (${formatBytes(bytes)}; עד ${formatBytes(MAX_ATTACHMENT_BYTES)})` })
      return
    }
    if (plan.keep.length >= MAX_MAIL_ATTACHMENTS) {
      plan.dropped.push({ name, reason: `יותר מ-${MAX_MAIL_ATTACHMENTS} קבצים במייל אחד` })
      return
    }
    plan.keep.push({ index, filename, mimeType })
  })
  return plan
}

/** The paragraph appended to a ticket or reply naming what was not saved — "" when nothing was dropped. */
export function droppedAttachmentsNote(dropped: readonly { name: string; reason: string }[]): string {
  if (dropped.length === 0) return ""
  return `\n\n── קבצים מצורפים שלא נשמרו ──\n${dropped.map(d => `• ${d.name} — ${d.reason}`).join("\n")}`
}
