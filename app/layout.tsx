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

import type { Metadata } from "next"
import "./globals.css"
import Providers from "./providers"

/**
 * Page metadata — applies to all pages unless overridden by a nested layout
 * or page-level `export const metadata` declaration.
 */
export const metadata: Metadata = {
  title: "מערכת helpdesk",
  description: "מערכת לניהול פניות תמיכה",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang="he"  — Hebrew language code (affects font rendering, hyphenation)
    // dir="rtl"  — Right-to-left document direction
    <html lang="he" dir="rtl">
      {/*
        bg-gray-50    — Light grey page background (from globals.css / Tailwind reset)
        text-gray-900 — Default text colour
        antialiased   — Smooth font rendering
        min-h-screen  — Prevents footer from floating in short-content pages
      */}
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        {/* Providers wraps all pages: SessionProvider, ErrorBoundary, ClientErrorHandler */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
