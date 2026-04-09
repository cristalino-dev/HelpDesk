/**
 * components/FooterCopyright.tsx — Shared Version Footer with Easter Egg
 *
 * PURPOSE:
 * ─────────
 * Every page in the application shows a version string and copyright notice
 * at the bottom. This component centralises that footer so:
 *   - Version is always read from lib/version.ts (single source of truth)
 *   - Layout variants (fixed vs. flow) are handled by props
 *   - The LinkedIn easter egg is available on every page automatically
 *
 * USAGE:
 * ──────
 * Standard footer (at the bottom of a normal page flow):
 *   <FooterCopyright />
 *
 * Fixed footer (login page — overlaid on the gradient background):
 *   <FooterCopyright fixed lightColor />
 *
 * EASTER EGG:
 * ────────────
 * Clicking the "© AK" text 5 times in rapid succession opens Alon Kerem's
 * LinkedIn profile in a new tab. The click counter resets on each successful
 * trigger. There is no visible hint — it's a hidden feature for those who
 * discover it.
 *
 * Implementation detail: the counter is local component state (useState).
 * It does NOT reset on a timer (intentional — no UX feedback means no
 * time pressure). After the 5th click, the counter resets to 0 so the
 * easter egg can be triggered again.
 *
 * PROPS:
 * ───────
 *   fixed      {boolean}  When true, renders as a `<p>` with `position: fixed`,
 *                         centered at the bottom of the viewport. Used only on
 *                         the login page where the background is a full-viewport
 *                         gradient. Default: false.
 *
 *   lightColor {boolean}  When true, text is rendered in
 *                         rgba(255,255,255,0.35) — semi-transparent white,
 *                         suitable for dark/gradient backgrounds.
 *                         Default: false (renders as #d1d5db — light grey,
 *                         suitable for white/light page backgrounds).
 */

"use client"
import { useState } from "react"
import APP_VERSION from "@/lib/version"

interface Props {
  /** Renders as fixed-position overlay at viewport bottom. For login page. */
  fixed?: boolean
  /** Renders text in white (for dark backgrounds). Default is grey (light bg). */
  lightColor?: boolean
}

export default function FooterCopyright({ fixed = false, lightColor = false }: Props) {
  /** Tracks how many times the copyright span has been clicked. */
  const [clicks, setClicks] = useState(0)

  /**
   * Handles each click on the copyright text.
   * On the 5th click, opens the LinkedIn profile and resets the counter.
   */
  const handleClick = () => {
    const next = clicks + 1
    setClicks(next)
    if (next >= 5) {
      window.open("https://www.linkedin.com/in/alonkerem/", "_blank", "noopener,noreferrer")
      setClicks(0) // Reset so the easter egg can be triggered again
    }
  }

  // Build the appropriate style object based on the `fixed` and `lightColor` props
  const style: React.CSSProperties = fixed
    ? {
        // Fixed overlay — used on login page
        position: "fixed",
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        margin: 0,
        fontSize: "0.72rem",
        color: "rgba(255,255,255,0.35)",
        whiteSpace: "nowrap",
      }
    : {
        // Normal page flow footer
        textAlign: "center",
        padding: "24px 0 32px",
        fontSize: "0.72rem",
        color: lightColor ? "rgba(255,255,255,0.35)" : "#d1d5db",
      }

  // Use <p> for fixed (inline, no block semantics needed) and <footer> for flow
  const Tag = fixed ? "p" : "footer"

  return (
    <Tag style={style}>
      {/* APP_VERSION is imported from lib/version.ts — single source of truth */}
      v{APP_VERSION}{" "}
      {/*
        The copyright span is the easter egg trigger.
        cursor: "default" and userSelect: "none" prevent the text from
        looking like a link or selectable text — keeping the secret subtle.
        title="" explicitly removes any tooltip on hover.
      */}
      <span
        onClick={handleClick}
        style={{ cursor: "default", userSelect: "none" }}
        title=""
      >
        &copy; 2026 AK
      </span>
    </Tag>
  )
}
