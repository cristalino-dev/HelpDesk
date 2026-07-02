/**
 * components/Logo.tsx — Cristalino brand mark + optional system wordmark
 *
 * Renders the real Cristalino logo (public/logo.jpeg — the open-ring "C" with
 * the green dot and the CRISTALINO GROUP wordmark) at header size, optionally
 * followed by a system label such as "helpdesk · מערכת" or a page title.
 *
 * Props:
 *   size      — logo image height in px (default 36). The image is square.
 *   wordmark  — system label shown next to the logo. Pass false for logo-only.
 *   subtitle  — secondary label after the wordmark (e.g. "מערכת"). false to hide.
 *   color     — wordmark text color (default brand dark).
 *   onDark    — render for the dark header bar: the JPEG sits in a white
 *               rounded chip (it has a white background) and text goes light.
 */

import Image from "next/image"
import { T } from "@/lib/theme"

export default function Logo({
  size = 36,
  wordmark = "helpdesk",
  subtitle = "מערכת",
  color,
  onDark = false,
}: {
  size?: number
  wordmark?: string | false
  subtitle?: string | false
  color?: string
  onDark?: boolean
}) {
  const wordmarkColor = color ?? (onDark ? "#FFFFFF" : T.dark)
  const img = (
    <Image
      src="/logo.jpeg"
      alt="Cristalino Group"
      width={size}
      height={size}
      loading="eager"
      style={{ objectFit: "contain", flexShrink: 0, borderRadius: onDark ? 8 : 0 }}
    />
  )
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {onDark ? (
        // White chip so the white-background JPEG blends into the dark bar
        <span style={{
          background: "#fff", borderRadius: 10, padding: 3, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          {img}
        </span>
      ) : img}
      {wordmark !== false && (
        <span style={{ fontWeight: 800, fontSize: "1.19rem", color: wordmarkColor, letterSpacing: ".04em", whiteSpace: "nowrap" }}>
          {wordmark}
          {subtitle !== false && (
            <>
              <span style={{ color: onDark ? "rgba(255,255,255,0.28)" : "#B4BAB6", fontWeight: 500 }}> · </span>
              <span style={{ color: onDark ? "#A9AEA8" : T.text2, fontWeight: 600 }}>{subtitle}</span>
            </>
          )}
        </span>
      )}
    </div>
  )
}
