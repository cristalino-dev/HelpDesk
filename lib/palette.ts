/**
 * lib/palette.ts — the two palettes, and the CSS variables that switch them.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Every page in this app styles itself inline (rule 2), and an inline style
 * cannot be re-targeted by a media query or a `[data-theme]` selector. There is
 * no stylesheet to override it from: `style="color:#374151"` is the final word.
 *
 * The one thing that *does* reach inside an inline style is a CSS custom
 * property. `style={{ color: "var(--c-text2)" }}` is resolved at paint time
 * against whatever `:root` currently says, so flipping one attribute on
 * <html> re-colours the whole document without React re-rendering anything.
 *
 * So this file holds the colours, twice, and `themeCss()` emits them as two
 * blocks of custom properties. `lib/theme.ts` turns them into the `T` / `HDR` /
 * `STATUS` / `URGENCY` tokens the pages already use, and every colour literal
 * that used to sit inline in app/ and components/ now names one of these
 * variables instead.
 *
 * WHAT MUST NOT USE THE VARIABLES
 * ───────────────────────────────
 * `lib/mail.ts`. Notification mail is HTML in somebody else's client, where
 * there is no <html data-theme>, no :root, and — in Gmail and Outlook — no
 * custom-property support at all. `var(--c-card)` in an email is a colour that
 * does not resolve, so mail imports `LIGHT` from here directly and stays light
 * for everyone. An email should look the same in every inbox regardless of how
 * the recipient left the toggle.
 *
 * ADDING A COLOUR
 * ───────────────
 * Add it to both `LIGHT` and `DARK` — `DARK` is typed as `Palette`, so
 * omitting a key is a compile error rather than a colour that silently
 * vanishes in one mode. `__tests__/Palette.test.ts` additionally refuses a raw
 * hex literal anywhere under app/ or components/, which is what keeps this
 * file the only place colours live.
 */

/**
 * The light palette — the historical Cristalino theme, unchanged. Every value
 * here is one that used to be typed inline somewhere in app/ or components/.
 */
export const LIGHT = {
  // ── Surfaces ─────────────────────────────────────────────────
  bg:           "#F2F3F1", // page background (warm gray)
  card:         "#FFFFFF", // raised surface — cards, panels, inputs
  card2:        "#F9FAFB", // subtle surface — table headers, inset rows
  fill:         "#F3F4F6", // Tailwind-ramp quiet fill (the commonest one)
  fill2:        "#F9FAFB", // Tailwind-ramp faintest fill
  line:         "#E5E7EB", // Tailwind-ramp hairline
  lineStrong:   "#D1D5DB", // Tailwind-ramp control border
  cardMuted:    "#F6F7F5", // disabled / read-only field background
  codeBg:       "#EDEFEA", // HDTC badge, code chips, quiet fills
  border:       "#E7E9E6", // hairline
  borderStrong: "#DEE1DC", // input / control borders

  // ── Text: the Cristalino ramp ────────────────────────────────
  // Warm greys. These are the values `T.text2` and friends have always had,
  // and they are what lib/mail.ts sends, so they are left exactly as they were.
  text:   "#16181D", // primary ink, headings
  text2:  "#5B6260", // body / secondary
  text3:  "#6A7068", // labels
  muted:  "#9AA09C", // muted
  muted2: "#A2A8A2", // faint, placeholder

  // ── Text: the Tailwind ramp ──────────────────────────────────
  // The app has always had a SECOND neutral ramp — cooler and darker — typed
  // inline on about four hundred elements while `T` held the warm one. They
  // are not interchangeable: #374151 is much darker than #5B6260, and folding
  // one into the other would restyle half the app under cover of a dark-mode
  // change. So both are kept, both get dark counterparts, and unifying them
  // stays a separate decision for a separate day.
  ink:        "#374151", // body text on a card
  inkMuted:   "#6B7280", // secondary
  inkFaint:   "#9CA3AF", // timestamps, placeholders
  inkFainter: "#D1D5DB", // the caption above a timestamp

  // ── Inverse surface ──────────────────────────────────────────
  // A block of the *opposite* lightness to the page: primary buttons, the logo
  // mark, dark panels. `inverseText` is what reads on top of it. These two
  // swap together, which is the whole reason they are a pair — a primary
  // button that stayed near-black on a near-black page would vanish.
  inverseBg:   "#16181D",
  inverseText: "#FFFFFF",

  // ── Brand ────────────────────────────────────────────────────
  green:       "#74C53A", // lime accent
  greenInk:    "#3E7A24", // green text on a light background
  greenBg:     "#E9F4E2", // green pill background
  greenBorder: "rgba(116,197,58,0.45)", // lime hairline on a dark surface
  focusRing:   "rgba(116,197,58,0.16)", // the ring around a focused input

  // ── Accent families: bg / border / fg / fgDeep ───────────────
  redBg:      "#FEF2F2",
  redBorder:  "#FECACA",
  redFg:      "#DC2626",
  redFgDeep:  "#991B1B",

  // "S" for semantic — success green, kept distinct from the brand lime so
  // that recolouring the brand never quietly restyles every success message.
  greenSBg:     "#F0FDF4",
  greenSBorder: "#BBF7D0",
  greenSFg:     "#16A34A",
  greenSFgDeep: "#166534",

  amberBg:      "#FFFBEB",
  amberBorder:  "#FDE68A",
  amberFg:      "#D97706",
  amberFgDeep:  "#92400E",

  orangeBg:      "#FFF7ED",
  orangeBorder:  "#FDBA74",
  orangeFg:      "#EA580C",
  orangeFgDeep:  "#C2410C",

  blueBg:      "#EDF0F4",
  blueBorder:  "#BFDBFE",
  blueFg:      "#3D5A7D",
  blueFgDeep:  "#1E3A5F",

  purpleBg:      "#F5F3FF",
  purpleBorder:  "#C4B5FD",
  purpleFg:      "#7C3AED",
  purpleFgDeep:  "#5B21B6",

  cyanBg:      "#ECFEFF",
  cyanBorder:  "#A5F3FC",
  cyanFg:      "#0891B2",
  cyanFgDeep:  "#0E7490",

  // ── Fixed-context colours ────────────────────────────────────
  // Text that sits on the brand lime. The lime is light in BOTH modes, so
  // this stays dark in both — it is not `text`, and flipping it would put
  // near-white lettering on a lime button.
  onGreen: "#16181D",

  // A disabled control: the same grey in both modes would read as "surface"
  // on one of them, so it gets a token like everything else.
  disabled: "#9AA09C",

  // The login page's decorative panel is dark on purpose, in both modes. It
  // is the one place where "dark" means a design choice rather than a theme.
  heroFrom: "#16181D",
  heroMid:  "#1C1F26",
  heroTo:   "#0E1013",

  // The avatar well on the header bar — lifted a step off `hdrBg`.
  hdrAvatarSoftBg: "#23262D",

  // The white chip the logo JPEG sits on. The image has a baked-in white
  // background, so the chip has to be white in both themes or the logo grows
  // a bright rectangle around itself on the dark bar.
  logoChip: "#FFFFFF",

  // The faint separator dot in the wordmark, on the dark bar.
  hdrLinkFaint: "rgba(255,255,255,0.28)",

  // The glow on a stale ticket's row.
  staleGlow: "rgba(249,115,22,0.12)",

  // The raw-log textarea on /admin. A console is dark in both themes — that
  // is what a console looks like, and inverting it in dark mode would be the
  // one panel on the page that turned white when the lights went out.
  consoleBg: "#16181D",
  consoleFg: "#E2E8F0",

  // ── Status / urgency pills ───────────────────────────────────
  // These keep their own tokens rather than borrowing the accent families
  // above, because their light values are bespoke (#FBF1DE is not #FFFBEB)
  // and light mode has to come out of this change pixel-identical. They are
  // also genuinely a different thing from an alert box: a pill is a label on a
  // row, sized for two words, and it is read next to five others like it.
  pillBlueBg:    "#EDF0F4",
  pillBlueFg:    "#3D5A7D",
  pillAmberBg:   "#FBF1DE",
  pillAmberFg:   "#A9741A",
  pillNeutralBg: "#F1F2F0",
  pillNeutralFg: "#5B6260",
  pillGreenBg:   "#E9F4E2",
  pillGreenFg:   "#3E7A24",
  pillPurpleBg:  "#F1EEFA",
  pillPurpleFg:  "#6B4FA1",
  pillRedBg:     "#FBEAEA",
  pillRedFg:     "#B4453F",

  // Left/right accent bar on a ticket card, by urgency. Saturated marks on a
  // white card; they need lifting off a dark one.
  barLow:    "#74C53A",
  barMedium: "#E0A93B",
  barHigh:   "#E07B39",
  barUrgent: "#D9534F",

  // ── Header chrome ────────────────────────────────────────────
  // The top bar was always dark, in both modes. In light mode it is the one
  // dark thing on the page; in dark mode it sits just *above* the page
  // background rather than below it, which is what keeps it reading as a bar
  // rather than as more page.
  hdrBg:          "#16181D",
  hdrBorder:      "#23262D",
  hdrLink:        "#A9AEA8",
  hdrLinkStrong:  "#FFFFFF",
  hdrMuted:       "#787E78",
  hdrPillBg:      "rgba(255,255,255,0.07)",
  hdrHoverBg:     "rgba(255,255,255,0.06)",
  hdrGreenPillBg: "rgba(116,197,58,0.16)",
  hdrGreenPillFg: "#8FD65B",
  hdrPillBorder:  "rgba(255,255,255,0.16)", // hairline on a header control

  // ── Elevation ────────────────────────────────────────────────
  // A shadow reads as smudge on a light page and as depth on a dark one, so
  // these get heavier rather than merely darker when the lights go out.
  shadow1: "rgba(0,0,0,0.05)",
  shadow2: "rgba(0,0,0,0.06)",
  shadow3: "rgba(0,0,0,0.12)",
  shadow4: "rgba(0,0,0,0.28)",

  // ── Overlay ──────────────────────────────────────────────────
  overlay: "rgba(20,22,26,0.45)", // modal scrim
} as const

/** Every key in LIGHT must exist in DARK — omitting one is a type error. */
export type Palette = { readonly [K in keyof typeof LIGHT]: string }

/**
 * The dark palette.
 *
 * Not an inversion — an inverted brand is a different brand. The identity is
 * already near-black + lime, so dark mode is the app standing on the dark
 * surface the header always had: the page takes that near-black, cards lift
 * slightly out of it rather than glowing white, and the lime stays the one
 * saturated thing on screen.
 *
 * Two rules held throughout. Body text sits well above 7:1 on its own surface.
 * And no accent family is carried by hue alone — each keeps a tinted
 * background and a border, so the red box still reads as a warning to somebody
 * who cannot separate it from the green one.
 */
export const DARK: Palette = {
  // ── Surfaces ─────────────────────────────────────────────────
  bg:           "#101216",
  card:         "#191C22",
  card2:        "#21242B",
  fill:         "#22262D",
  fill2:        "#1E2128",
  line:         "#2E323A",
  lineStrong:   "#3E434C",
  cardMuted:    "#1B1E24",
  codeBg:       "#262A31",
  border:       "#2A2E36",
  borderStrong: "#3A3F49",

  // ── Text ─────────────────────────────────────────────────────
  // The warm ramp.
  text:   "#E9EBE7",
  text2:  "#B9BEB6",
  text3:  "#A7ADA4",
  muted:  "#8E948C",
  muted2: "#7F857E", // the floor, ~4.5:1 on a card

  // The cool ramp. It sits *above* the warm one here for the same reason it
  // sat below it in light mode: it is the more emphatic of the two.
  ink:        "#D3D8D1",
  inkMuted:   "#A9AFA7",
  inkFaint:   "#8A9089",
  inkFainter: "#6E746D",

  // ── Inverse surface ──────────────────────────────────────────
  // Flipped as a pair: a primary button becomes a pale block with dark text.
  inverseBg:   "#E9EBE7",
  inverseText: "#16181D",

  // ── Brand ────────────────────────────────────────────────────
  // The lime is lifted: #74C53A carries small text on chips, and it loses
  // contrast against a dark card in a way it never did against a white one.
  green:       "#8AD64F",
  greenInk:    "#9BDD66",
  greenBg:     "rgba(116,197,58,0.15)",
  greenBorder: "rgba(116,197,58,0.45)",
  focusRing:   "rgba(116,197,58,0.28)",

  // ── Accent families ──────────────────────────────────────────
  redBg:      "rgba(217,83,79,0.15)",
  redBorder:  "rgba(217,83,79,0.38)",
  redFg:      "#F08B86",
  redFgDeep:  "#F5AFAB",

  greenSBg:     "rgba(34,197,94,0.13)",
  greenSBorder: "rgba(34,197,94,0.34)",
  greenSFg:     "#68DD97",
  greenSFgDeep: "#98E9B8",

  amberBg:      "rgba(245,158,11,0.13)",
  amberBorder:  "rgba(245,158,11,0.34)",
  amberFg:      "#EDBB55",
  amberFgDeep:  "#F3D08A",

  orangeBg:      "rgba(249,115,22,0.13)",
  orangeBorder:  "rgba(249,115,22,0.34)",
  orangeFg:      "#F0A26A",
  orangeFgDeep:  "#F5BE96",

  blueBg:      "rgba(96,165,250,0.13)",
  blueBorder:  "rgba(96,165,250,0.32)",
  blueFg:      "#8FB6E8",
  blueFgDeep:  "#B3CDF0",

  purpleBg:      "rgba(139,92,246,0.16)",
  purpleBorder:  "rgba(139,92,246,0.34)",
  purpleFg:      "#B49BF5",
  purpleFgDeep:  "#CDBCF8",

  cyanBg:      "rgba(6,182,212,0.13)",
  cyanBorder:  "rgba(6,182,212,0.32)",
  cyanFg:      "#5FD3E8",
  cyanFgDeep:  "#93E4F1",

  // ── Fixed-context colours ────────────────────────────────────
  onGreen:  "#16181D", // the lime is light in both modes — see LIGHT
  disabled: "#4A4F56",
  heroFrom: "#16181D", // the login panel is dark by design, in both modes
  heroMid:  "#1C1F26",
  heroTo:   "#0E1013",
  hdrAvatarSoftBg: "#2A2E36",
  logoChip:     "#FFFFFF",             // the JPEG's own background — fixed
  hdrLinkFaint: "rgba(255,255,255,0.28)",
  staleGlow:    "rgba(249,115,22,0.22)",
  consoleBg: "#0C0E12", // sunk below the page, rather than raised above it
  consoleFg: "#D4D8D2",

  // ── Status / urgency pills ───────────────────────────────────
  // Tinted fills at low alpha over the card, with the text lifted to carry
  // itself. Solid pastel fills (the light values) turn to mud on a dark card.
  pillBlueBg:    "rgba(96,165,250,0.15)",
  pillBlueFg:    "#93B8E6",
  pillAmberBg:   "rgba(224,169,59,0.15)",
  pillAmberFg:   "#E3B45E",
  pillNeutralBg: "rgba(255,255,255,0.07)",
  pillNeutralFg: "#A8AEA6",
  pillGreenBg:   "rgba(116,197,58,0.16)",
  pillGreenFg:   "#96D666",
  pillPurpleBg:  "rgba(139,92,246,0.18)",
  pillPurpleFg:  "#B6A0EE",
  pillRedBg:     "rgba(217,83,79,0.17)",
  pillRedFg:     "#EE908B",

  // The bars sit on the card edge and carry no text, so they only need to
  // stay legible as colour — lifted just enough not to sink into the surface.
  barLow:    "#7ACD41",
  barMedium: "#E6B34D",
  barHigh:   "#E88A4C",
  barUrgent: "#E2635F",

  // ── Header chrome ────────────────────────────────────────────
  // Lifted above the page (#101216) instead of below it, so the bar still
  // separates from the content it sits on.
  hdrBg:          "#1A1D23",
  hdrBorder:      "#2A2E36",
  hdrLink:        "#B4B9B2",
  hdrLinkStrong:  "#FFFFFF",
  hdrMuted:       "#8B918A",
  hdrPillBg:      "rgba(255,255,255,0.08)",
  hdrHoverBg:     "rgba(255,255,255,0.07)",
  hdrGreenPillBg: "rgba(116,197,58,0.18)",
  hdrGreenPillFg: "#98DC66",
  hdrPillBorder:  "rgba(255,255,255,0.18)",

  // ── Elevation ────────────────────────────────────────────────
  shadow1: "rgba(0,0,0,0.30)",
  shadow2: "rgba(0,0,0,0.40)",
  shadow3: "rgba(0,0,0,0.55)",
  shadow4: "rgba(0,0,0,0.70)",

  // ── Overlay ──────────────────────────────────────────────────
  overlay: "rgba(0,0,0,0.62)",
}

/** `bg` → `--c-bg`, `greenSFgDeep` → `--c-greenSFgDeep`. */
export function cssVarName(token: keyof Palette): string {
  return `--c-${token}`
}

/** What `T.bg` and friends literally are: the string `var(--c-bg)`. */
export function cssVar(token: keyof Palette): string {
  return `var(${cssVarName(token)})`
}

function block(selector: string, palette: Palette): string {
  const body = (Object.keys(LIGHT) as (keyof Palette)[])
    .map(k => `  ${cssVarName(k)}: ${palette[k]};`)
    .join("\n")
  return `${selector} {\n${body}\n}`
}

/**
 * The two custom-property blocks, as CSS text.
 *
 * Rendered into a <style> tag by app/layout.tsx rather than written into
 * globals.css, so that this file stays the only place the colours are typed —
 * a stylesheet cannot import a TypeScript object, and a second copy in CSS is
 * a second copy to forget.
 *
 * `:root` carries light, which is what an unmarked document gets. There is
 * deliberately no `prefers-color-scheme` query: the default is light for
 * everybody until they say otherwise.
 */
export function themeCss(): string {
  return `${block(":root", LIGHT)}\n\n${block(':root[data-theme="dark"]', DARK)}`
}
