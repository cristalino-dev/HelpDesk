/**
 * lib/theme.ts — Cristalino Helpdesk design tokens
 *
 * Central palette for the "Cristalino" brand theme: a near-black + lime-green
 * identity on warm neutral grays, with softened (desaturated) status colors.
 * Derived from the Claude Design "HelpDesk Webdesign" theme.
 *
 * Usage:
 *   import { T, STATUS, URGENCY } from "@/lib/theme"
 *   style={{ background: T.dark, color: T.green }}
 *
 * Pages use inline styles, so these are plain string constants — not CSS vars.
 * The two maps (STATUS / URGENCY) are the single source of truth for the
 * colored status & urgency pills across every screen.
 */

export const T = {
  // ── Brand ──────────────────────────────────────────────
  dark:      "#16181D", // near-black — primary buttons, logo, headings, dark surfaces
  darkSoft:  "#23262D", // slightly lifted dark (hover / secondary dark)
  green:     "#74C53A", // lime accent — dots, active underline, avatar-on-dark
  greenInk:  "#3E7A24", // green text/icon on light backgrounds
  greenBg:   "#E9F4E2", // green pill background

  // ── Surfaces ───────────────────────────────────────────
  bg:           "#F2F3F1", // page background (warm gray)
  card:         "#FFFFFF",
  cardMuted:    "#F6F7F5", // disabled / read-only field background
  border:       "#E7E9E6", // hairline border
  borderStrong: "#DEE1DC", // input / control borders
  codeBg:       "#EDEFEA", // HDTC code badge background

  // ── Text ───────────────────────────────────────────────
  text:   "#16181D", // primary
  text2:  "#5B6260", // secondary
  text3:  "#6A7068", // tertiary / labels
  muted:  "#9AA09C", // muted
  muted2: "#A2A8A2", // placeholder / faint
} as const

/** Status pill colors (background + text), keyed by Hebrew status label. */
export const STATUS: Record<string, { bg: string; fg: string }> = {
  "פתוח":    { bg: "#EDF0F4", fg: "#3D5A7D" }, // muted blue
  "בטיפול":  { bg: "#FBF1DE", fg: "#A9741A" }, // amber
  "בהמתנה": { bg: "#F1F2F0", fg: "#5B6260" }, // neutral gray (on hold)
  "סגור":    { bg: "#E9F4E2", fg: "#3E7A24" }, // green
}

/** Urgency pill colors (background + text), keyed by Hebrew urgency label. */
export const URGENCY: Record<string, { bg: string; fg: string }> = {
  "נמוך":   { bg: "#E9F4E2", fg: "#3E7A24" }, // green
  "בינוני": { bg: "#FBF1DE", fg: "#A9741A" }, // amber
  "גבוה":   { bg: "#F1EEFA", fg: "#6B4FA1" }, // purple
  "דחוף":   { bg: "#FBEAEA", fg: "#B4453F" }, // red
}

/** Left/right accent bar color for a ticket card, by urgency. */
export const URGENCY_BAR: Record<string, string> = {
  "נמוך":   "#74C53A",
  "בינוני": "#E0A93B",
  "גבוה":   "#E07B39",
  "דחוף":   "#D9534F",
}
