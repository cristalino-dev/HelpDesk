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
 */

import Image from "next/image"
import { T } from "@/lib/theme"

export default function Logo({
  size = 36,
  wordmark = "helpdesk",
  subtitle = "מערכת",
  color = T.dark,
}: {
  size?: number
  wordmark?: string | false
  subtitle?: string | false
  color?: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Image
        src="/logo.jpeg"
        alt="Cristalino Group"
        width={size}
        height={size}
        loading="eager"
        style={{ objectFit: "contain", flexShrink: 0 }}
      />
      {wordmark !== false && (
        <span style={{ fontWeight: 800, fontSize: "1.19rem", color, letterSpacing: ".04em" }}>
          {wordmark}
          {subtitle !== false && (
            <>
              <span style={{ color: "#B4BAB6", fontWeight: 500 }}> · </span>
              <span style={{ color: T.text2, fontWeight: 600 }}>{subtitle}</span>
            </>
          )}
        </span>
      )}
    </div>
  )
}
