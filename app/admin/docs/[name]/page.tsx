/**
 * app/admin/docs/[name]/page.tsx — one IT document, read in the browser (v3.104).
 *
 * The מסמכים tab links here, in a new tab, instead of to the file: a Word
 * document used to download, and a document somebody has to download is a
 * document nobody looks at during a call. Here it is on screen as it is in
 * Word — the pages, the fonts, the shaded tables — under its Hebrew name, with
 * the original one click away for whoever needs the file itself.
 *
 *   .docx            → WordDocument, drawn page by page in the browser;
 *   HTML, PDF, text  → a frame on the file route, which serves them inline
 *                      (HTML under its CSP, and a sandbox here besides);
 *   anything else    → no preview, the download button only.
 *
 * Admins only, like the shelf: the page sends anyone else away, and the file
 * route it reads from refuses them anyway.
 */

"use client"
import { use, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import AppHeader from "@/components/AppHeader"
import AppNav from "@/components/AppNav"
import FooterCopyright from "@/components/FooterCopyright"
import { T } from "@/lib/theme"
import { useIsMobile } from "@/lib/useIsMobile"
import { DOCS_SHELF_HREF, docExt, docFileHref, docViewKind, type DocFile } from "@/lib/docs"
import WordDocument from "./WordDocument"

/** "1.2 MB" — the same reading of a size as the shelf's. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The segment as a filename. Next may hand it over still percent-encoded. */
function segmentToName(segment: string): string {
  try { return decodeURIComponent(segment) } catch { return segment }
}

export default function DocViewerPage({ params }: { params: Promise<{ name: string }> }) {
  const name = segmentToName(use(params).name)
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [doc, setDoc] = useState<DocFile | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    if (status === "authenticated" && !session?.user?.isAdmin) router.push("/dashboard")
  }, [status, session, router])

  // What the shelf knows about the file — its names, its size, its date.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.isAdmin) return
    fetch("/api/admin/docs")
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(body => {
        const found = (Array.isArray(body.docs) ? body.docs as DocFile[] : []).find(d => d.name === name)
        setDoc(found ?? null)
        setState(found ? "ready" : "missing")
      })
      .catch(() => setState("error"))
  }, [status, session, name])

  const heading = doc ? (doc.titleHe ?? doc.title) : ""

  useEffect(() => {
    if (heading) document.title = `${heading} · מסמכים`
  }, [heading])

  if (status === "loading") return null

  const kind = docViewKind(name)
  const isHtml = docExt(name) === ".html" || docExt(name) === ".htm"

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.bg, display: "flex", flexDirection: "column" }}>
      <AppHeader wordmark={isMobile ? "מסמכים" : "ניהול מערכת"} subtitle={false}><AppNav /></AppHeader>

      <main style={{ flex: 1, width: "100%", maxWidth: 1100, margin: "0 auto", padding: isMobile ? "20px 16px 32px" : "28px 24px 40px", display: "flex", flexDirection: "column", gap: 20, boxSizing: "border-box" }}>

        {/* The page opens in a tab of its own, where the browser's back button
            has nowhere to go — this one leads to the shelf (v3.105). */}
        <Link
          href={DOCS_SHELF_HREF}
          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.85rem", fontWeight: 600, color: T.greenInk, background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 999, padding: "7px 15px", textDecoration: "none" }}
        >← חזרה למסמכים</Link>

        {state === "loading" && (
          <p style={{ margin: "40px 0", textAlign: "center", fontSize: "0.88rem", color: T.inkFaint }}>טוען...</p>
        )}

        {(state === "missing" || state === "error") && (
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "28px 24px", textAlign: "center" }}>
            <p style={{ margin: "0 0 6px", fontWeight: 600, color: T.ink, fontSize: "0.95rem" }}>
              {state === "missing" ? "המסמך לא נמצא" : "טעינת המסמך נכשלה"}
            </p>
            <p style={{ margin: 0, color: T.inkFaint, fontSize: "0.82rem" }}>
              {state === "missing" ? "ייתכן שהקובץ הוסר מהתיקייה בשרת או ששמו השתנה." : "נסו לרענן את הדף."}
            </p>
          </div>
        )}

        {state === "ready" && doc && <>
          {/* ── The document's name, and the original ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 320px" }}>
              {doc.index && (
                <span style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 8, padding: "3px 10px", flexShrink: 0 }}>
                  {doc.index}
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, fontSize: isMobile ? "1.05rem" : "1.2rem", fontWeight: 700, color: T.text, overflowWrap: "anywhere" }}>
                  {heading}
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: "0.76rem", color: T.inkFaint, overflowWrap: "anywhere" }}>
                  {doc.titleHe && <><span dir="ltr">{doc.title}</span> · </>}
                  {formatSize(doc.size)} · {new Date(doc.updatedAt).toLocaleDateString("he-IL")}
                </p>
              </div>
            </div>

            <a
              href={docFileHref(name, true)}
              download={name}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", borderRadius: 9, background: T.green, color: T.onGreen, fontWeight: 700, fontSize: "0.85rem", textDecoration: "none", flexShrink: 0 }}
            >
              <span aria-hidden>⬇</span> הורדת הקובץ המקורי
            </a>
          </div>

          {/* ── The document itself ── */}
          {kind === "word" && <WordDocument name={name} />}

          {kind === "frame" && (
            <iframe
              title={heading}
              src={docFileHref(name)}
              // A guide's script would run as us; it gets none, and its links
              // open a tab of their own. A PDF needs the browser's own viewer,
              // which a sandboxed frame does not get.
              sandbox={isHtml ? "allow-popups allow-popups-to-escape-sandbox" : undefined}
              // The guides paint their own page; the card shows while one loads.
              style={{ width: "100%", height: "calc(100vh - 220px)", minHeight: 480, border: `1px solid ${T.line}`, borderRadius: 12, background: T.card }}
            />
          )}

          {kind === "none" && (
            <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "28px 24px", textAlign: "center" }}>
              <p style={{ margin: "0 0 6px", fontWeight: 600, color: T.ink, fontSize: "0.95rem" }}>אין תצוגה בדפדפן לסוג הקובץ הזה</p>
              <p style={{ margin: 0, color: T.inkFaint, fontSize: "0.82rem" }}>אפשר להוריד את הקובץ המקורי בכפתור למעלה.</p>
            </div>
          )}
        </>}
      </main>

      <FooterCopyright />
    </div>
  )
}
