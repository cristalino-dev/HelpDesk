"use client"
import { useRef, useState } from "react"

export interface PendingImage {
  dataUrl: string
  filename?: string
}

interface Props {
  images: PendingImage[]
  onChange: (images: PendingImage[]) => void
  readonly?: boolean
}

export default function ImageAttachments({ images, onChange, readonly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const addFile = (file: File) => {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      onChange([...images, { dataUrl, filename: file.name }])
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith("image/"))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (file) addFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    Array.from(e.dataTransfer.files).forEach(addFile)
  }

  const remove = (i: number) => onChange(images.filter((_, idx) => idx !== i))

  if (readonly && images.length === 0) return null

  return (
    <div>
      {!readonly && (
        <div
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          style={{
            border: "2px dashed #d1d5db", borderRadius: 10, padding: "14px 16px",
            textAlign: "center", cursor: "pointer", fontSize: "0.82rem", color: "#9ca3af",
            background: "#fafafa", marginBottom: images.length ? 10 : 0,
            transition: "border-color 0.15s",
          }}
          onMouseOver={e => (e.currentTarget.style.borderColor = "#6366f1")}
          onMouseOut={e => (e.currentTarget.style.borderColor = "#d1d5db")}
          tabIndex={0}
          onKeyDown={e => e.key === "Enter" && inputRef.current?.click()}
        >
          📎 גררו תמונה לכאן, לחצו לבחירה, או הדביקו (Ctrl+V)
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => Array.from(e.target.files ?? []).forEach(addFile)} />
        </div>
      )}

      {images.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: "relative", display: "inline-block" }}>
              <img
                src={img.dataUrl}
                alt={img.filename ?? `תמונה ${i + 1}`}
                onClick={() => setLightbox(img.dataUrl)}
                style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8, border: "1px solid #e5e7eb", objectFit: "cover", cursor: "zoom-in", display: "block" }}
              />
              {!readonly && (
                <button onClick={() => remove(i)} style={{
                  position: "absolute", top: -6, right: -6,
                  width: 20, height: 20, borderRadius: "50%", border: "none",
                  background: "#ef4444", color: "#fff", fontSize: "0.65rem",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
                }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightbox}
            alt="תמונה מוגדלת"
            style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 10, boxShadow: "0 8px 40px rgba(0,0,0,0.6)", objectFit: "contain" }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 20, left: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >×</button>
        </div>
      )}
    </div>
  )
}
