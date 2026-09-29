/**
 * components/DocsPanel.tsx — the מסמכים tab of the admin console (v3.99).
 *
 * The team's own documentation, in one place and one click from the queue:
 * the infrastructure write-ups first, in their numbered order, then the working
 * guides. Every one opens in a new tab, so the queue stays where it was.
 *
 * The files live on the server (uploads/it-docs/) and are served by
 * /api/admin/docs, which admits admins only. Adding a document is copying a
 * file into that directory — nothing here needs to change for it to appear.
 */

"use client"
import { useCallback, useEffect, useState } from "react"
import { T } from "@/lib/theme"
import { DOC_GROUPS, type DocFile, type DocGroup } from "@/lib/docs"

/** "1.2 MB" — a size somebody can judge a download by. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const EXT_LABEL: Record<string, string> = {
  ".html": "HTML", ".htm": "HTML", ".pdf": "PDF", ".docx": "Word", ".doc": "Word",
  ".xlsx": "Excel", ".xls": "Excel", ".csv": "CSV", ".md": "Markdown", ".txt": "טקסט",
}

export default function DocsPanel() {
  const [docs, setDocs]       = useState<DocFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/docs")
      if (!res.ok) { setError("טעינת המסמכים נכשלה"); return }
      const body = await res.json()
      setDocs(Array.isArray(body.docs) ? body.docs : [])
    } catch {
      setError("טעינת המסמכים נכשלה")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const groups: DocGroup[] = ["infra", "guides"]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: T.inkMuted, lineHeight: 1.7 }}>
          התיעוד של מערכות ה-IT של החברה. כל מסמך נפתח בלשונית חדשה — מסמכי Word יורדים למחשב.
          המסמכים שמורים בשרת ונגישים למנהלי מערכת בלבד.
        </p>
        <button
          onClick={load}
          disabled={loading}
          style={{ background: T.fill, border: `1px solid ${T.border}`, color: T.text, fontSize: "0.82rem", fontWeight: 600, padding: "8px 14px", borderRadius: 10, cursor: loading ? "default" : "pointer", flexShrink: 0 }}
        >
          {loading ? "טוען..." : "↻ רענן"}
        </button>
      </div>

      {error && (
        <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: "0.85rem", color: T.redFg }}>
          {error}
        </div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "28px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600, color: T.ink, fontSize: "0.95rem" }}>אין עדיין מסמכים</p>
          <p style={{ margin: 0, color: T.inkFaint, fontSize: "0.82rem" }}>
            מסמך מתווסף בהעתקת הקובץ לתיקייה <span style={{ fontFamily: "monospace" }}>uploads/it-docs</span> בשרת.
          </p>
        </div>
      )}

      {groups.map(group => {
        const inGroup = docs.filter(d => d.group === group)
        if (inGroup.length === 0) return null
        return (
          <section key={group} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>
                {group === "infra" ? "🗂 " : "📘 "}{DOC_GROUPS[group]}
              </h3>
              <span style={{ fontSize: "0.75rem", color: T.inkFaint }}>{inGroup.length}</span>
              <div style={{ flex: 1, height: 1, background: T.line }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {inGroup.map(doc => (
                <a
                  key={doc.name}
                  href={`/api/admin/docs/${encodeURIComponent(doc.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "12px 16px", borderRadius: 12, textDecoration: "none",
                    background: T.card, border: `1px solid ${T.line}`,
                  }}
                >
                  {doc.index && (
                    <span style={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 8, padding: "2px 9px", flexShrink: 0 }}>
                      {doc.index}
                    </span>
                  )}
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: T.text, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                    {doc.title}
                  </span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: T.pillBlueFg, background: T.pillBlueBg, borderRadius: 999, padding: "2px 10px", flexShrink: 0 }}>
                    {EXT_LABEL[doc.ext] ?? doc.ext.replace(".", "").toUpperCase()}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: T.inkFaint, flexShrink: 0 }}>
                    {formatSize(doc.size)} · {new Date(doc.updatedAt).toLocaleDateString("he-IL")}
                  </span>
                  <span aria-hidden style={{ fontSize: "0.8rem", color: T.inkFaint, flexShrink: 0 }}>↗</span>
                </a>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
