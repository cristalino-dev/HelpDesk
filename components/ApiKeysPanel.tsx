"use client"
/**
 * components/ApiKeysPanel.tsx — the admin console's API tab (v3.88).
 *
 * Create a key for a program — it is shown once, here, with a copy button, and
 * never again (only its SHA-256 is stored). See when each key was last used;
 * revoke one, which stops it at once. Plus the three things a developer needs
 * to start: the address, the header, and where the full description lives.
 */

import { useEffect, useState } from "react"
import { T } from "@/lib/theme"

type ApiKey = {
  id: string
  name: string
  prefix: string
  scope: "read" | "write"
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

const SCOPE_LABEL = { read: "קריאה בלבד", write: "קריאה וכתיבה" } as const
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—")

const card: React.CSSProperties = { background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }
const h3: React.CSSProperties = { margin: "0 0 12px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }
const input: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.88rem", background: T.card, color: T.text }
const code: React.CSSProperties = { fontFamily: "'Courier New', Consolas, monospace", fontSize: "0.8rem", direction: "ltr", unicodeBidi: "embed" }

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [scope, setScope] = useState<"read" | "write">("read")
  const [creating, setCreating] = useState(false)
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      const res = await fetch("/api/admin/api-keys")
      if (!res.ok) { setError("טעינת המפתחות נכשלה"); return }
      const body = await res.json()
      setKeys(Array.isArray(body?.data) ? body.data : [])
    } catch {
      setError("שגיאת רשת בטעינת המפתחות")
    }
  }

  useEffect(() => { void load() }, [])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError("")
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || typeof body?.key !== "string") { setError(body?.error ?? "יצירת המפתח נכשלה"); return }
      setFresh({ name: name.trim(), key: body.key })
      setCopied(false)
      setName("")
      await load()
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`לבטל את המפתח "${k.name}"? תוכנה שמשתמשת בו תפסיק לעבוד מיד.`)) return
    const res = await fetch(`/api/admin/api-keys/${k.id}`, { method: "DELETE" })
    if (!res.ok) { setError("ביטול המפתח נכשל"); return }
    await load()
  }

  const copy = async () => {
    if (!fresh) return
    try {
      await navigator.clipboard.writeText(fresh.key)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const base = typeof window === "undefined" ? "" : `${window.location.origin}/api/v1`
  const disabled = creating || !name.trim()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <div role="alert" style={{ padding: "10px 14px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, color: T.redFgDeep, fontSize: "0.85rem" }}>{error}</div>
      )}

      <div style={card}>
        <h3 style={h3}>🔑 מפתח חדש לתוכנה</h3>
        <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: T.inkFaint, lineHeight: 1.6 }}>
          מפתח לכל תוכנה — כך אפשר לבטל אחד בלי לשבור את האחרים, ויומן הפנייה מראה איזו תוכנה שינתה מה.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={name} onChange={e => setName(e.target.value)} maxLength={80}
            onKeyDown={e => { if (e.key === "Enter") void create() }}
            placeholder="שם התוכנה — למשל: מערכת ההזמנות" aria-label="שם התוכנה"
            style={{ ...input, flex: 1, minWidth: 200 }}
          />
          <select value={scope} onChange={e => setScope(e.target.value as "read" | "write")} aria-label="הרשאה" style={input}>
            <option value="read">{SCOPE_LABEL.read}</option>
            <option value="write">{SCOPE_LABEL.write}</option>
          </select>
          <button onClick={() => void create()} disabled={disabled} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: "0.85rem",
            background: disabled ? T.line : T.inverseBg, color: disabled ? T.inkFaint : T.inverseText,
            cursor: disabled ? "not-allowed" : "pointer",
          }}>{creating ? "יוצר..." : "צור מפתח"}</button>
        </div>

        {fresh && (
          <div role="status" style={{ marginTop: 16, padding: "14px 16px", borderRadius: 10, background: T.amberBg, border: `1px solid ${T.amberBorder}`, color: T.amberFgDeep }}>
            <div style={{ fontWeight: 700, fontSize: "0.86rem", marginBottom: 8 }}>
              המפתח של &quot;{fresh.name}&quot; — מוצג פעם אחת בלבד. העתיקו ושמרו אותו עכשיו; אי אפשר לשחזר אותו.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ ...code, background: T.card, color: T.text, padding: "6px 10px", borderRadius: 6, wordBreak: "break-all", flex: 1, minWidth: 220 }}>{fresh.key}</code>
              <button onClick={() => void copy()} style={{ ...input, cursor: "pointer", fontWeight: 700 }}>{copied ? "הועתק ✓" : "העתק"}</button>
              <button onClick={() => setFresh(null)} style={{ ...input, cursor: "pointer" }}>שמרתי, סגור</button>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={h3}>מפתחות קיימים</h3>
        {keys === null ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: T.inkFaint }}>טוען...</p>
        ) : keys.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: T.inkFaint }}>עוד אין מפתחות.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ textAlign: "right", color: T.inkFaint }}>
                  {["תוכנה", "מפתח", "הרשאה", "נוצר", "שימוש אחרון", "מצב", ""].map(h => (
                    <th key={h} style={{ padding: "6px 8px", fontWeight: 700, borderBottom: `1px solid ${T.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} style={{ opacity: k.revokedAt ? 0.55 : 1 }}>
                    <td style={{ padding: "8px", fontWeight: 600, color: T.ink }}>{k.name}</td>
                    <td style={{ padding: "8px" }}><code style={code}>{k.prefix}…</code></td>
                    <td style={{ padding: "8px" }}>{SCOPE_LABEL[k.scope] ?? k.scope}</td>
                    <td style={{ padding: "8px", color: T.text2 }}>{when(k.createdAt)}<div style={{ fontSize: "0.72rem", color: T.inkFaint }}>{k.createdBy}</div></td>
                    <td style={{ padding: "8px", color: T.text2 }}>{when(k.lastUsedAt)}</td>
                    <td style={{ padding: "8px", color: k.revokedAt ? T.redFg : T.greenInk, fontWeight: 600 }}>{k.revokedAt ? `בוטל ${when(k.revokedAt)}` : "פעיל"}</td>
                    <td style={{ padding: "8px" }}>
                      {!k.revokedAt && (
                        <button onClick={() => void revoke(k)} style={{ background: "none", border: `1px solid ${T.redBorder}`, color: T.redFg, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: "0.78rem" }}>בטל</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={h3}>📘 איך משתמשים</h3>
        <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "0.84rem", color: T.text, lineHeight: 1.9 }}>
          <li>כתובת: <code style={code}>{base || "/api/v1"}</code></li>
          <li>כותרת בכל בקשה: <code style={code}>Authorization: Bearer hdk_…</code></li>
          <li>דוגמה: <code style={code}>GET /api/v1/tickets?open=true&amp;type=request</code></li>
          <li>תיעוד למפתחים — זה הקישור לשלוח להם: <a href="/api/v1/docs" target="_blank" rel="noreferrer" style={{ ...code, color: T.greenInk, fontWeight: 600 }}>{base ? `${base}/docs` : "/api/v1/docs"}</a></li>
          <li>התיאור למכונה (OpenAPI — ל-Postman, Swagger ומחוללי קוד): <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" style={{ ...code, color: T.greenInk, fontWeight: 600 }}>{base ? `${base}/openapi.json` : "/api/v1/openapi.json"}</a></li>
          <li>את המפתח עצמו שלחו בנפרד ובערוץ מאובטח — לא באותה הודעה עם הקישורים.</li>
        </ul>
      </div>
    </div>
  )
}
