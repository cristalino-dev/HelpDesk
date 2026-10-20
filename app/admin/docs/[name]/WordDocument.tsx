/**
 * app/admin/docs/[name]/WordDocument.tsx — a .docx, drawn as Word draws it (v3.104).
 *
 * docx-preview reads the file in the browser and lays it out page by page: the
 * document's own fonts, colours, heading styles, shaded table cells, borders
 * and bullet lists, on white pages the size the document says. Nothing is
 * converted on the server and nothing is kept — the same admin-only bytes the
 * download button saves are what is drawn.
 *
 * The library is imported when a Word document is opened, not before, so the
 * rest of the console does not carry it.
 *
 * Two things are done to what it draws:
 *   - a hyperlink keeps its target only when isSafeDocLink() allows it — a
 *     .docx can carry `javascript:` as a link, and this is our own origin;
 *   - pages wider than the screen are zoomed down to fit (a phone), never up.
 */

"use client"
import { useEffect, useRef, useState } from "react"
import { T } from "@/lib/theme"
import { docFileHref, isSafeDocLink } from "@/lib/docs"

/** docx-preview's own wrapper is a grey slab; here the pages sit on the console. */
const PAGE_CSS = `
.hd-word .docx-wrapper { background: transparent; padding: 0; }
.hd-word .docx-wrapper > section.docx { box-shadow: 0 2px 18px ${T.shadow4}; margin-bottom: 28px; }
`

export default function WordDocument({ name }: { name: string }) {
  const boxRef   = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    const pages = pagesRef.current
    if (!pages) return
    let cancelled = false
    setState("loading")

    ;(async () => {
      try {
        const res = await fetch(docFileHref(name))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const { renderAsync } = await import("docx-preview")

        // Drawn off to the side and swapped in whole, so an effect that was
        // cancelled half way (a second render, a different document) can never
        // leave its pages mixed into the next one's.
        const host = document.createElement("div")
        await renderAsync(blob, host, undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          renderChanges: false,
          useBase64URL: true,
        })
        if (cancelled) return

        for (const a of host.querySelectorAll("a[href]")) {
          const href = a.getAttribute("href") ?? ""
          if (!isSafeDocLink(href)) { a.removeAttribute("href"); continue }
          if (!href.startsWith("#")) {
            a.setAttribute("target", "_blank")
            a.setAttribute("rel", "noopener noreferrer")
          }
        }

        pages.replaceChildren(host)
        setState("ready")
      } catch {
        if (!cancelled) setState("error")
      }
    })()

    return () => { cancelled = true }
  }, [name])

  // Fit the page width to the screen — down only. CSS zoom (not a transform)
  // so the scaled pages take up their scaled height and nothing is left blank.
  useEffect(() => {
    const box = boxRef.current
    const pages = pagesRef.current
    if (state !== "ready" || !box || !pages) return
    let width = -1
    const fit = () => {
      // The zoom changes the box's height; only a change of width matters.
      if (box.clientWidth === width) return
      width = box.clientWidth
      pages.style.zoom = "1"
      const page = pages.querySelector<HTMLElement>("section.docx")
      if (!page) return
      const scale = Math.min(1, box.clientWidth / page.offsetWidth)
      pages.style.zoom = String(scale)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [state])

  return (
    <div ref={boxRef} className="hd-word" style={{ width: "100%" }}>
      <style>{PAGE_CSS}</style>

      {state === "loading" && (
        <p style={{ margin: "40px 0", textAlign: "center", fontSize: "0.88rem", color: T.inkFaint }}>טוען את המסמך...</p>
      )}
      {state === "error" && (
        <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, padding: "12px 16px", fontSize: "0.85rem", color: T.redFg }}>
          לא ניתן היה להציג את המסמך. אפשר עדיין להוריד את הקובץ המקורי.
        </div>
      )}

      {/* The documents are written left to right; a paragraph marked
          right-to-left in Word carries its own direction. */}
      <div ref={pagesRef} dir="ltr" style={{ display: state === "ready" ? "block" : "none" }} />
    </div>
  )
}
