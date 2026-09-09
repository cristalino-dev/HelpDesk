/**
 * __tests__/Palette.test.ts — lib/palette.ts
 *
 * Dark mode in this app is not a stylesheet, it is a promise: that every
 * colour on screen comes from a token, and that every token has two values.
 * Break either half and the failure is a page that is half dark — white cards
 * on a black background, or grey-on-grey text nobody can read.
 *
 * These tests hold both halves.
 *
 *   1. Both palettes define exactly the same tokens.
 *   2. Light mode is EXACTLY what it was before v3.80. This change was meant
 *      to add a theme, not to restyle the app people already use, and the
 *      historical values are pinned here so a future palette edit has to be
 *      deliberate about touching them.
 *   3. Nothing under app/ or components/ still types a colour inline — the
 *      thing that made dark mode a 1,200-line change in the first place.
 *   4. Text is readable on its own surface, in both palettes.
 */

import { readFileSync, readdirSync, statSync } from "fs"
import { join } from "path"
import { LIGHT, DARK, themeCss, cssVar, type Palette } from "@/lib/palette"

describe("the two palettes", () => {
  it("define exactly the same tokens", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort())
  })

  it("gives every token a value in both", () => {
    for (const k of Object.keys(LIGHT) as (keyof Palette)[]) {
      expect(LIGHT[k]).toMatch(/^(#[0-9A-Fa-f]{6}|rgba?\([\d.,\s]+\))$/)
      expect(DARK[k]).toMatch(/^(#[0-9A-Fa-f]{6}|rgba?\([\d.,\s]+\))$/)
    }
  })

  // If a token means the same in both modes it is usually a mistake — the
  // exceptions are the ones that are deliberately fixed, and they are named.
  it("actually changes the colours that should change", () => {
    const same = (Object.keys(LIGHT) as (keyof Palette)[])
      .filter(k => LIGHT[k].toLowerCase() === DARK[k].toLowerCase())
    expect(same.sort()).toEqual(
      ["greenBorder", "heroFrom", "heroMid", "heroTo", "hdrLinkStrong",
       "hdrLinkFaint", "logoChip", "onGreen"].sort()
    )
  })
})

/**
 * The values `lib/theme.ts` exported before v3.80, verbatim.
 *
 * Light mode is not supposed to have moved. Anything failing here is a
 * user-visible restyle of the app as it stands today, which is a different
 * change from the one this file exists for.
 */
const HISTORICAL_LIGHT: Partial<Record<keyof Palette, string>> = {
  inverseBg: "#16181D", // was T.dark
  green:     "#74C53A",
  greenInk:  "#3E7A24",
  greenBg:   "#E9F4E2",
  bg:           "#F2F3F1",
  card:         "#FFFFFF",
  cardMuted:    "#F6F7F5",
  border:       "#E7E9E6",
  borderStrong: "#DEE1DC",
  codeBg:       "#EDEFEA",
  text:   "#16181D",
  text2:  "#5B6260",
  text3:  "#6A7068",
  muted:  "#9AA09C",
  muted2: "#A2A8A2",
  hdrBg:          "#16181D",
  hdrBorder:      "#23262D",
  hdrLink:        "#A9AEA8",
  hdrLinkStrong:  "#FFFFFF",
  hdrMuted:       "#787E78",
  hdrPillBg:      "rgba(255,255,255,0.07)",
  hdrHoverBg:     "rgba(255,255,255,0.06)",
  hdrGreenPillBg: "rgba(116,197,58,0.16)",
  hdrGreenPillFg: "#8FD65B",
  // status + urgency pills, and the urgency bars
  pillBlueBg: "#EDF0F4", pillBlueFg: "#3D5A7D",
  pillAmberBg: "#FBF1DE", pillAmberFg: "#A9741A",
  pillNeutralBg: "#F1F2F0", pillNeutralFg: "#5B6260",
  pillGreenBg: "#E9F4E2", pillGreenFg: "#3E7A24",
  pillPurpleBg: "#F1EEFA", pillPurpleFg: "#6B4FA1",
  pillRedBg: "#FBEAEA", pillRedFg: "#B4453F",
  barLow: "#74C53A", barMedium: "#E0A93B", barHigh: "#E07B39", barUrgent: "#D9534F",
}

describe("light mode is unchanged from v3.79", () => {
  it.each(Object.entries(HISTORICAL_LIGHT))("%s", (token, expected) => {
    expect(LIGHT[token as keyof Palette]).toBe(expected)
  })

  // The app has always had two neutral ramps: the warm one on `T`, and a
  // cooler, darker one typed inline. v3.80 gave the second one tokens rather
  // than folding it into the first, because they are visibly different greys.
  it("keeps the warm and cool grey ramps apart", () => {
    expect(LIGHT.text2).toBe("#5B6260")   // warm — what T.text2 always was
    expect(LIGHT.ink).toBe("#374151")     // cool — what was typed inline
    expect(LIGHT.muted).toBe("#9AA09C")
    expect(LIGHT.inkMuted).toBe("#6B7280")
  })
})

describe("themeCss()", () => {
  const css = themeCss()

  it("puts light on bare :root, so an unmarked document is light", () => {
    expect(css).toMatch(/^:root \{/)
    expect(css).toContain(`--c-bg: ${LIGHT.bg};`)
  })

  it("puts dark behind the attribute the toggle sets", () => {
    expect(css).toContain(':root[data-theme="dark"] {')
    expect(css).toContain(`--c-bg: ${DARK.bg};`)
  })

  it("emits every token in both blocks", () => {
    for (const k of Object.keys(LIGHT) as (keyof Palette)[]) {
      expect(css.split(`--c-${k}:`).length - 1).toBe(2)
    }
  })

  // No prefers-color-scheme anywhere: the default is light for everybody
  // until they touch the switch, including on a machine set to dark.
  it("does not follow the operating system", () => {
    expect(css).not.toContain("prefers-color-scheme")
  })

  it("is what cssVar() names", () => {
    expect(cssVar("bg")).toBe("var(--c-bg)")
  })
})

// ── the rule that keeps all of the above true ───────────────────────────────

const UI_DIRS = ["app", "components"]
/** Google's own sign-in mark. Their brand, not our palette. */
const ALLOWED = /#4285F4|#34A853|#FBBC05|#EA4335/gi

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.tsx?$/.test(full) ? [full] : []
  })
}

describe("no colour is typed inline any more", () => {
  const files = UI_DIRS.flatMap(d => walk(join(process.cwd(), d)))

  it("finds the UI files to check", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.map(f => [f.split(/[\\/]/).slice(-2).join("/"), f]))(
    "%s", (_label, file) => {
      // Comments are not rendered colour. They are allowed to name a hex,
      // though naming the token instead tends to age better.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*/g, "$1")
        .replace(ALLOWED, "")
      const found = src.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\([\d.,\s]+\)/g) ?? []
      // A hex here is a colour that cannot follow the theme: it will stay
      // whatever it is when the lights go out. Add a token to lib/palette.ts.
      expect(found).toEqual([])
    },
  )
})

// ── legibility ──────────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(c => c / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe("text is readable on its own surface", () => {
  // Opaque pairs only — the tinted accent backgrounds are alpha over a card
  // and would need compositing to judge.
  const pairs: [keyof Palette, keyof Palette, number][] = [
    ["text",   "card", 7],
    ["text",   "bg",   7],
    ["text2",  "card", 4.5],
    ["text3",  "card", 4.5],
    ["ink",    "card", 7],
    ["inkMuted", "card", 4.5],
    ["inkFaint", "card", 2.5],
    ["muted",  "card", 2.5],
    ["inverseText", "inverseBg", 7],
    ["consoleFg",   "consoleBg", 7],
    ["onGreen", "green", 4.5],
  ]

  it.each(pairs)("light: %s on %s", (fg, bg, min) => {
    expect(contrast(LIGHT[fg], LIGHT[bg])).toBeGreaterThanOrEqual(min)
  })

  it.each(pairs)("dark: %s on %s", (fg, bg, min) => {
    expect(contrast(DARK[fg], DARK[bg])).toBeGreaterThanOrEqual(min)
  })
})
