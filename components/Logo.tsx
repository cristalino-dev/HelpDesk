/**
 * components/Logo.tsx — Cristalino brand mark + wordmark
 *
 * The Cristalino logo: an open "C" ring (a circle with a gap) with a single
 * lime-green dot at its open end. Renders inline as SVG so it inherits color
 * and scales crisply. Used in every page header.
 *
 * Props:
 *   size      — ring diameter in px (default 32)
 *   wordmark  — optional text shown next to the mark. Pass false for mark-only.
 *   color     — ring color (default brand dark). The dot is always brand green.
 */

import { T } from "@/lib/theme"

export function LogoMark({ size = 32, color = T.dark }: { size?: number; color?: string }) {
  return (
    <span style={{ display: "inline-flex", flexShrink: 0, color }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        {/* Open ring — a stroked circle with a gap, rotated so the gap sits top-right */}
        <circle
          cx="16" cy="16" r="12.5"
          fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="62 79" transform="rotate(-58 16 16)"
        />
        {/* Green dot at the ring's open end */}
        <circle cx="24" cy="6.4" r="3" fill={T.green} />
      </svg>
    </span>
  )
}

export default function Logo({
  size = 32,
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
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <LogoMark size={size} color={color} />
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
