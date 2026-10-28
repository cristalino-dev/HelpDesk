"use client"

import { useState } from "react"
import { T } from "@/lib/theme"

/**
 * CommandBox — a copy-to-clipboard box for shell / PowerShell commands.
 * Renders LTR and fully selectable regardless of the surrounding RTL page, so
 * the command is never reshaped or reversed by the Hebrew layout.
 */
export default function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the text stays selectable as a fallback */
    }
  }

  return (
    <div
      style={{
        position: "relative",
        background: T.codeBg,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        padding: "14px 70px 14px 16px",
        direction: "ltr",
        marginTop: 4,
      }}
    >
      <button
        onClick={copy}
        aria-label="העתק פקודה"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: T.inverseBg,
          color: T.inverseText,
          border: "none",
          borderRadius: 7,
          padding: "5px 10px",
          fontSize: "0.72rem",
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "✓ הועתק" : "📋 העתק"}
      </button>
      <code
        style={{
          display: "block",
          fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: "0.78rem",
          color: T.text,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          userSelect: "all",
        }}
      >
        {command}
      </code>
    </div>
  )
}
