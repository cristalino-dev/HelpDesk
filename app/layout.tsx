/**
 * app/layout.tsx — Root HTML Layout (Server Component)
 *
 * PURPOSE:
 * ─────────
 * The root layout is the outermost HTML shell that wraps every single page
 * in the application. Next.js requires this file to exist in the `app/`
 * directory. It renders exactly once per navigation and is never unmounted
 * (Next.js keeps it mounted across client-side route transitions).
 *
 * RESPONSIBILITIES:
 * ──────────────────
 *   1. Emits the <html> and <body> tags with correct Hebrew RTL attributes
 *   2. Sets the page <title> and <meta description> for all pages
 *   3. Applies global CSS (globals.css) — input/label/button base resets
 *   4. Mounts the Providers component tree (SessionProvider + ErrorBoundary
 *      + ClientErrorHandler) so all pages have access to these contexts
 *   5. Defines the theme's CSS custom properties and applies the visitor's
 *      saved light/dark choice before the page paints (see THEMING below)
 *
 * THEMING (v3.80):
 * ─────────────────
 * Two things happen here and nowhere else.
 *
 * The <style> holds both palettes as custom properties — light on `:root`,
 * dark on `:root[data-theme="dark"]` — generated from lib/palette.ts so the
 * colours are typed in exactly one place. It carries React 19's `precedence`
 * prop, which hoists it into <head> and de-duplicates it, so the variables are
 * defined before the stylesheet that uses them is applied.
 *
 * The <script> is the reason there is no flash of the wrong theme. It runs
 * synchronously, as the first thing in <body>, before any content is parsed or
 * painted, and sets `data-theme` from localStorage. Doing this in React
 * instead would mean painting light and then snapping to dark on hydration —
 * which is precisely the artefact people notice.
 *
 * `suppressHydrationWarning` on <html> is required because of that script: the
 * server cannot know the visitor's choice, so it always emits <html> without
 * `data-theme`, and the script may have added it by the time React hydrates.
 * The attribute is deliberately out of React's control; the warning would be
 * about the one difference we intend.
 *
 * RTL SUPPORT:
 * ─────────────
 * The `lang="he"` and `dir="rtl"` attributes on <html>:
 *   - Tell the browser this is a right-to-left Hebrew document
 *   - Make CSS `text-align: start` resolve to "right"
 *   - Make `border-inline-start` resolve to the right side
 *   - Trigger correct bidirectional text rendering for mixed Hebrew/English
 *   - Enable screen readers and assistive technology to use the correct
 *     Hebrew voice and reading direction
 *
 * WHY NO "use client"?
 * ─────────────────────
 * The layout itself is a Server Component — it runs on the server and produces
 * static HTML. The client boundary begins inside <Providers> (see providers.tsx).
 */

import type { Metadata, Viewport } from "next"
import { Heebo } from "next/font/google"
import "./globals.css"
import Providers from "./providers"
import { themeCss } from "@/lib/palette"
import { themeBootScript } from "@/lib/themeBoot"

/**
 * Heebo — the Cristalino brand typeface. A Hebrew-first variable font (also
 * covers Latin), self-hosted and optimized by next/font. The CSS variable
 * --font-heebo is consumed by the body rule in globals.css.
 */
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
})

/**
 * Page metadata — applies to all pages unless overridden by a nested layout
 * or page-level `export const metadata` declaration.
 */
export const metadata: Metadata = {
  title: "מערכת helpdesk",
  description: "מערכת לניהול פניות תמיכה",
}

/**
 * Viewport — tells mobile browsers to render at the device's actual width
 * instead of the default ~980px desktop emulation width.
 * Without this the app appears zoomed out / "half the screen" on phones.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="he"  — Hebrew language code (affects font rendering, hyphenation)
    // dir="rtl"  — Right-to-left document direction
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      {/*
        antialiased   — Smooth font rendering
        min-h-screen  — Prevents footer from floating in short-content pages
        Background, text color and font come from the body rule in globals.css.
      */}
      <body className="antialiased min-h-screen">
        {/* Both palettes, as custom properties. `precedence` hoists this into
            <head> (React 19) so the variables exist before anything is painted. */}
        <style precedence="default" href="cristalino-theme">{themeCss()}</style>

        {/* Applies the saved choice before first paint. Must stay synchronous
            and must stay first — see THEMING above. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />

        {/* Providers wraps all pages: SessionProvider, ErrorBoundary, ClientErrorHandler */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
