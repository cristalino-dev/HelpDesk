"use client"
/**
 * components/ImageAttachments.tsx — pick, drop or paste attachments; show them.
 *
 * The name is kept for its five consumers and lib/pasteImage.ts, but since
 * v3.84 it takes files as well as images: raster images show as thumbnails
 * with a lightbox, everything else on lib/attachmentTypes.ts's list as a chip
 * with its kind, name and size. A stored file (readonly) is a download link.
 *
 * Nothing is dropped silently any more. A file that cannot be attached — a
 * type not on the list, too large even after shrinking — is named under the
 * drop zone with the reason, and passed to `onError` for pages that want it.
 */
import { useRef, useState } from "react"
import { T, HDR } from "@/lib/theme"
import { ACCEPT_ATTRIBUTE, MAX_ATTACHMENT_BYTES, fileKind, formatBytes, isInlineImageType } from "@/lib/attachmentTypes"
import { prepareAttachments } from "@/lib/prepareAttachment"

export interface PendingImage {
  /** A data: URL for a pending (not yet uploaded) file, or an
   *  /api/attachments/<id> URL when displaying a stored one. */
  dataUrl: string
  filename?: string
  /** Settled by lib/prepareAttachment.ts for a new file; from the row for a stored one. */
  mimeType?: string | null
  size?: number | null
}

interface Props {
  images: PendingImage[]
  onChange: (images: PendingImage[]) => void
  readonly?: boolean
  /** Told about files that could not be attached, one "name — reason" each. */
  onError?: (messages: string[]) => void
}

/** Show it inline? A stored row carries its type; a pending file its data URL's. */
export function isImageAttachment(img: PendingImage): boolean {
  if (img.mimeType) return isInlineImageType(img.mimeType)
  const declared = /^data:([^;,]*)/.exec(img.dataUrl)
  // A stored row with no type is from before v3.84, when only images were allowed.
  return declared ? isInlineImageType(declared[1]) : true
}

export default function ImageAttachments({ images, onChange, readonly, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    try {
      // One batch, one onChange: several FileReaders each appending to the
      // same stale list used to keep only the last of a multi-file drop.
      const { items, failures } = await prepareAttachments(files)
      if (items.length > 0) onChange([...images, ...items])
      const messages = failures.map(f => `${f.name} — ${f.reason}`)
      setErrors(messages)
      if (messages.length > 0) onError?.(messages)
    } finally {
      setBusy(false)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter(i => i.kind === "file")
      .map(i => i.getAsFile())
      .filter((f): f is File => !!f)
    if (files.length === 0) return
    e.preventDefault()
    void addFiles(files)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    void addFiles(Array.from(e.dataTransfer.files))
  }

  const remove = (i: number) => onChange(images.filter((_, idx) => idx !== i))

  if (readonly && images.length === 0) return null

  const removeButton = (i: number) => (
    <button type="button" onClick={() => remove(i)} aria-label="הסר" style={{
      position: "absolute", top: -6, right: -6,
      width: 20, height: 20, borderRadius: "50%", border: "none",
      background: T.redFg, color: T.inverseText, fontSize: "0.65rem",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
    }}>×</button>
  )

  return (
    <div>
      {!readonly && (
        <div
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${T.lineStrong}`, borderRadius: 10, padding: "14px 16px",
            textAlign: "center", cursor: "pointer", fontSize: "0.82rem", color: T.inkFaint,
            background: T.fill2, marginBottom: images.length || errors.length ? 10 : 0,
            transition: "border-color 0.15s",
          }}
          onMouseOver={e => (e.currentTarget.style.borderColor = T.purpleFg)}
          onMouseOut={e => (e.currentTarget.style.borderColor = T.lineStrong)}
          tabIndex={0}
          onKeyDown={e => e.key === "Enter" && inputRef.current?.click()}
        >
          {busy ? "⏳ מכין קבצים…" : "📎 גררו קבצים או תמונות לכאן, לחצו לבחירה, או הדביקו (Ctrl+V)"}
          <div style={{ fontSize: "0.72rem", marginTop: 4 }}>
            תמונות, PDF, Word, Excel, PowerPoint וטקסט · עד {formatBytes(MAX_ATTACHMENT_BYTES)} לקובץ
          </div>
          <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} multiple style={{ display: "none" }}
            onChange={e => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = "" }} />
        </div>
      )}

      {errors.length > 0 && (
        <div role="alert" style={{
          fontSize: "0.78rem", color: T.redFg, background: T.redBg, border: `1px solid ${T.redBorder}`,
          borderRadius: 8, padding: "8px 12px", marginBottom: 10, lineHeight: 1.6,
        }}>
          {errors.length === 1 ? "הקובץ לא צורף:" : "הקבצים האלה לא צורפו:"}
          {errors.map(msg => <div key={msg}>• {msg}</div>)}
        </div>
      )}

      {images.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
          {images.map((img, i) => {
            if (isImageAttachment(img)) {
              return (
                <div key={i} style={{ position: "relative", display: "inline-block" }}>
                  <img
                    src={img.dataUrl}
                    alt={img.filename ?? `תמונה ${i + 1}`}
                    onClick={() => setLightbox(img.dataUrl)}
                    style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8, border: `1px solid ${T.line}`, objectFit: "cover", cursor: "zoom-in", display: "block" }}
                  />
                  {!readonly && removeButton(i)}
                </div>
              )
            }
            const kind = fileKind(img.mimeType)
            const chip = (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px",
                borderRadius: 8, border: `1px solid ${T.line}`, background: T.fill2,
                color: T.ink, fontSize: "0.8rem", maxWidth: 280,
              }}>
                <span aria-hidden="true">{kind.icon}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {img.filename ?? kind.label}
                </span>
                <span style={{ color: T.inkFaint, fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                  {kind.label}{img.size ? ` · ${formatBytes(img.size)}` : ""}
                </span>
              </span>
            )
            return (
              <div key={i} style={{ position: "relative", display: "inline-block" }}>
                {readonly
                  ? <a href={img.dataUrl} download={img.filename ?? ""} title="הורדה" style={{ textDecoration: "none" }}>{chip}</a>
                  : chip}
                {!readonly && removeButton(i)}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: T.overlay,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightbox}
            alt="תמונה מוגדלת"
            style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 10, boxShadow: `0 8px 40px ${T.overlay}`, objectFit: "contain" }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 20, left: 20, background: HDR.pillBg, border: "none", color: T.inverseText, borderRadius: "50%", width: 38, height: 38, fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >×</button>
        </div>
      )}
    </div>
  )
}
