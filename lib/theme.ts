/**
 * lib/theme.ts — Cristalino Helpdesk design tokens
 *
 * Central palette for the "Cristalino" brand theme: a near-black + lime-green
 * identity on warm neutral grays, with softened (desaturated) status colors.
 *
 * Usage — unchanged:
 *   import { T, STATUS, URGENCY } from "@/lib/theme"
 *   style={{ background: T.card, color: T.text }}
 *
 * WHAT CHANGED IN v3.80
 * ─────────────────────
 * These used to be hex strings. They are now `var(--c-…)` references, and the
 * hexes moved to `lib/palette.ts`, which holds two of everything. Nothing at a
 * call site had to change: an inline style is where these end up either way,
 * and a custom property resolves inside one just as a literal does. Flipping
 * `data-theme` on <html> re-colours every one of them at once, with no React
 * state, no context, and no re-render.
 *
 * Consequences worth knowing:
 *
 *   • These strings are only meaningful inside a document that has the
 *     variables defined — that is, under `app/layout.tsx`. Anything rendering
 *     HTML for somewhere else must import `LIGHT` from lib/palette.ts and use
 *     real hexes. `lib/mail.ts` is the one such caller (see rule 27).
 *
 *   • You cannot do arithmetic on them. `T.green + "20"` was never valid, but
 *     it used to *look* like it worked. If you need a translucent variant,
 *     add a token to the palette.
 *
 *   • `T.dark` is gone. It meant two opposite things — the ink you write in
 *     and the dark block you write *on* — and those have to move in opposite
 *     directions when the theme flips. Use `T.text` for the ink and
 *     `T.inverseBg` (with `T.inverseText` on top) for the block.
 */

import { cssVar, type Palette } from "@/lib/palette"

const v = cssVar

/** Every token, as a CSS custom-property reference. */
export const T = {
  // ── Surfaces ───────────────────────────────────────────
  bg:           v("bg"),           // page background
  card:         v("card"),         // raised surface
  card2:        v("card2"),        // subtle surface — table headers, inset rows
  fill:         v("fill"),         // Tailwind-ramp quiet fill
  fill2:        v("fill2"),        // Tailwind-ramp faintest fill
  line:         v("line"),         // Tailwind-ramp hairline
  lineStrong:   v("lineStrong"),   // Tailwind-ramp control border
  cardMuted:    v("cardMuted"),    // disabled / read-only field background
  codeBg:       v("codeBg"),       // HDTC code badge background
  border:       v("border"),       // hairline border
  borderStrong: v("borderStrong"), // input / control borders

  // ── Text: the Cristalino (warm) ramp ───────────────────
  // Unchanged values — this is what T has always meant, and what mail sends.
  text:   v("text"),   // primary
  text2:  v("text2"),  // secondary
  text3:  v("text3"),  // tertiary / labels
  muted:  v("muted"),  // muted
  muted2: v("muted2"), // placeholder / faint

  // ── Text: the Tailwind (cool) ramp ─────────────────────
  // The app's other neutral ramp, until v3.80 typed inline on some four
  // hundred elements. Darker and cooler than the warm one; NOT a synonym for
  // it. See the note in lib/palette.ts.
  ink:        v("ink"),
  inkMuted:   v("inkMuted"),
  inkFaint:   v("inkFaint"),
  inkFainter: v("inkFainter"),

  // ── Inverse surface ────────────────────────────────────
  // A block of the opposite lightness to the page — primary buttons, the logo
  // mark, dark panels — and the text that reads on it. Always used as a pair.
  inverseBg:   v("inverseBg"),
  inverseText: v("inverseText"),

  // ── Brand ──────────────────────────────────────────────
  green:    v("green"),    // lime accent
  greenInk: v("greenInk"), // green text/icon on light backgrounds
  greenBg:     v("greenBg"),     // green pill background
  greenBorder: v("greenBorder"), // lime hairline on a dark surface
  focusRing:   v("focusRing"),   // the ring around a focused input
  onGreen:  v("onGreen"),  // text on a lime button — dark in BOTH modes

  // ── Accent families ────────────────────────────────────
  redBg:     v("redBg"),     redBorder:     v("redBorder"),     redFg:     v("redFg"),     redFgDeep:     v("redFgDeep"),
  greenSBg:  v("greenSBg"),  greenSBorder:  v("greenSBorder"),  greenSFg:  v("greenSFg"),  greenSFgDeep:  v("greenSFgDeep"),
  amberBg:   v("amberBg"),   amberBorder:   v("amberBorder"),   amberFg:   v("amberFg"),   amberFgDeep:   v("amberFgDeep"),
  orangeBg:  v("orangeBg"),  orangeBorder:  v("orangeBorder"),  orangeFg:  v("orangeFg"),  orangeFgDeep:  v("orangeFgDeep"),
  blueBg:    v("blueBg"),    blueBorder:    v("blueBorder"),    blueFg:    v("blueFg"),    blueFgDeep:    v("blueFgDeep"),
  purpleBg:  v("purpleBg"),  purpleBorder:  v("purpleBorder"),  purpleFg:  v("purpleFg"),  purpleFgDeep:  v("purpleFgDeep"),
  cyanBg:    v("cyanBg"),    cyanBorder:    v("cyanBorder"),    cyanFg:    v("cyanFg"),    cyanFgDeep:    v("cyanFgDeep"),

  // ── Status / urgency pill colours, addressable individually ────
  // `STATUS` / `URGENCY` below map a Hebrew label to a pair of these. They are
  // also on `T` because plenty of places colour something *like* a status pill
  // without being one — a filter chip, a legend swatch, a count badge.
  pillBlueBg:    v("pillBlueBg"),    pillBlueFg:    v("pillBlueFg"),
  pillAmberBg:   v("pillAmberBg"),   pillAmberFg:   v("pillAmberFg"),
  pillNeutralBg: v("pillNeutralBg"), pillNeutralFg: v("pillNeutralFg"),
  pillGreenBg:   v("pillGreenBg"),   pillGreenFg:   v("pillGreenFg"),
  pillPurpleBg:  v("pillPurpleBg"),  pillPurpleFg:  v("pillPurpleFg"),
  pillRedBg:     v("pillRedBg"),     pillRedFg:     v("pillRedFg"),

  // Urgency accent bars.
  barLow:    v("barLow"),
  barMedium: v("barMedium"),
  barHigh:   v("barHigh"),
  barUrgent: v("barUrgent"),

  // ── The log console on /admin ──────────────────────────
  // Dark in both themes: that is what a console looks like, and inverting it
  // would make it the one panel that turns white when the lights go out.
  consoleBg: v("consoleBg"),
  consoleFg: v("consoleFg"),

  // ── Misc ───────────────────────────────────────────────
  disabled: v("disabled"), // a control that cannot be pressed
  overlay:  v("overlay"),  // modal scrim
  heroFrom: v("heroFrom"), // login panel — dark by design, in both modes
  heroMid:  v("heroMid"),
  heroTo:   v("heroTo"),
  logoChip:  v("logoChip"),  // the logo JPEG's white chip — fixed in both
  staleGlow: v("staleGlow"), // the glow on a stale ticket row

  // ── Elevation ──────────────────────────────────────────
  shadow1: v("shadow1"),
  shadow2: v("shadow2"),
  shadow3: v("shadow3"),
  shadow4: v("shadow4"),
} as const

/**
 * Dark top-bar (AppHeader / AppNav) tokens.
 *
 * The bar is dark in BOTH themes — in light mode it is the one dark thing on
 * the page, and in dark mode it sits a step *above* the page background so it
 * still reads as a bar. Every page's header actions use these so the chrome
 * looks identical everywhere.
 */
export const HDR = {
  bg:          v("hdrBg"),
  border:      v("hdrBorder"),
  link:        v("hdrLink"),
  linkStrong:  v("hdrLinkStrong"),
  muted:       v("hdrMuted"),
  pillBg:      v("hdrPillBg"),
  pillBorder:  v("hdrPillBorder"),
  hoverBg:     v("hdrHoverBg"),
  greenPillBg: v("hdrGreenPillBg"),
  greenPillFg: v("hdrGreenPillFg"),
  avatarBg:    v("hdrAvatarSoftBg"),
  linkFaint:   v("hdrLinkFaint"),
} as const

/**
 * Which palette tokens each status pill is built from.
 *
 * Exported as token *names* rather than as colours so that both consumers can
 * be generated from one list: the UI wants `var(--c-…)`, and lib/mail.ts wants
 * the literal light hex, because email has no custom properties.
 */
export const STATUS_TOKENS = {
  "פתוח":   { bg: "pillBlueBg",    fg: "pillBlueFg" },
  "בטיפול": { bg: "pillAmberBg",   fg: "pillAmberFg" },
  "בהמתנה": { bg: "pillNeutralBg", fg: "pillNeutralFg" },
  "סגור":   { bg: "pillGreenBg",   fg: "pillGreenFg" },
} as const satisfies Record<string, { bg: keyof Palette; fg: keyof Palette }>

/** Urgency pills, same idea. */
export const URGENCY_TOKENS = {
  "נמוך":   { bg: "pillGreenBg",  fg: "pillGreenFg" },
  "בינוני": { bg: "pillAmberBg",  fg: "pillAmberFg" },
  "גבוה":   { bg: "pillPurpleBg", fg: "pillPurpleFg" },
  "דחוף":   { bg: "pillRedBg",    fg: "pillRedFg" },
} as const satisfies Record<string, { bg: keyof Palette; fg: keyof Palette }>

/** Left/right accent bar on a ticket card, by urgency. */
export const URGENCY_BAR_TOKENS = {
  "נמוך":   "barLow",
  "בינוני": "barMedium",
  "גבוה":   "barHigh",
  "דחוף":   "barUrgent",
} as const satisfies Record<string, keyof Palette>

function pills(
  tokens: Record<string, { bg: keyof Palette; fg: keyof Palette }>,
): Record<string, { bg: string; fg: string }> {
  return Object.fromEntries(
    Object.entries(tokens).map(([k, t]) => [k, { bg: v(t.bg), fg: v(t.fg) }]),
  )
}

/** Status pill colors (background + text), keyed by Hebrew status label. */
export const STATUS: Record<string, { bg: string; fg: string }> = pills(STATUS_TOKENS)

/** Urgency pill colors (background + text), keyed by Hebrew urgency label. */
export const URGENCY: Record<string, { bg: string; fg: string }> = pills(URGENCY_TOKENS)

/** Left/right accent bar color for a ticket card, by urgency. */
export const URGENCY_BAR: Record<string, string> = Object.fromEntries(
  Object.entries(URGENCY_BAR_TOKENS).map(([k, t]) => [k, v(t)]),
)
