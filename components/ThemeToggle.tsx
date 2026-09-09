/**
 * components/ThemeToggle.tsx — the light/dark switch on the header bar.
 *
 * A real switch rather than a button reading "מצב כהה": it has two visible
 * states, and which one you are in is the thing people actually want to see at
 * a glance. `role="switch"` with `aria-checked` says the same to a screen
 * reader, which a plain <button> would not.
 *
 * Its colours come from `HDR`, not `T`, because the bar it sits on is dark in
 * BOTH themes. That is the one piece of chrome where "dark mode" is not a
 * question, and page tokens here would make the switch invert itself against a
 * background that had not moved.
 *
 * RTL: the knob travels with `inset-inline-start`, not `translateX`. A
 * positive `translateX` is toward the physical right whatever the document
 * direction is, so on this Hebrew page it would drive the knob off the end of
 * the rail instead of across it. The logical property mirrors correctly — off
 * sits at the reading edge, on moves away from it — in both directions.
 *
 * Motion is disabled under `prefers-reduced-motion` via the class below; a
 * control that flips the whole screen's brightness is a poor place to insist
 * on animation. Inline styles cannot express a media query, which is why that
 * one rule lives in globals.css.
 */

"use client"
import { useTheme } from "@/lib/useTheme"
import { HDR, T } from "@/lib/theme"

const TRACK_W = 44
const TRACK_H = 24
const KNOB = TRACK_H - 6          // clears the rail by 2px top and bottom
const INSET = 2
const TRAVEL = TRACK_W - 2 - KNOB - INSET  // padding box, less the knob and its far inset

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, , toggle] = useTheme()
  const dark = theme === "dark"
  const label = dark ? "עבור למצב בהיר" : "עבור למצב כהה"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={label}
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: compact ? "6px 8px" : "8px 10px",
        borderRadius: 9,
        color: HDR.link,
        fontSize: "0.82rem",
        fontWeight: 500,
      }}
    >
      {/* The rail */}
      <span
        aria-hidden="true"
        className="theme-toggle-rail"
        style={{
          position: "relative",
          display: "inline-block",
          flex: "none",
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: 999,
          background: dark ? HDR.greenPillBg : HDR.pillBg,
          border: `1px solid ${dark ? T.green : HDR.pillBorder}`,
        }}
      >
        {/* The knob */}
        <span
          className="theme-toggle-knob"
          style={{
            position: "absolute",
            top: INSET,
            insetInlineStart: dark ? TRAVEL : INSET,
            width: KNOB,
            height: KNOB,
            borderRadius: "50%",
            background: dark ? T.green : HDR.linkStrong,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.6rem",
            lineHeight: 1,
          }}
        >
          {dark ? "🌙" : "☀️"}
        </span>
      </span>
      {!compact && <span>{dark ? "כהה" : "בהיר"}</span>}
    </button>
  )
}
