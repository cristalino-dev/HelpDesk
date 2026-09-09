/**
 * lib/themeBoot.ts — the theme, as the document sees it.
 *
 * Deliberately NOT a client module. `app/layout.tsx` is a Server Component and
 * it has to call `themeBootScript()` to render the inline <script>; a
 * `"use client"` directive here would make that a build error ("attempted to
 * call themeBootScript() from the server"). The React hook that wraps all this
 * lives next door in lib/useTheme.ts, which *is* a client module.
 *
 * THE SHAPE OF IT
 * ───────────────
 * The theme is one attribute on <html>. Every colour in the app is a CSS
 * custom property (see lib/palette.ts), so flipping that attribute re-paints
 * the whole document — no React state, no context, no re-render.
 */

export type Theme = "light" | "dark"

/** localStorage key. Namespaced — this origin also serves the maintenance page. */
export const THEME_KEY = "helpdesk-theme"

/** The theme a visitor gets when they have never touched the switch. */
export const DEFAULT_THEME: Theme = "light"

/**
 * The script that runs before first paint.
 *
 * Tiny, dependency-free and synchronous, rendered inline as the first thing in
 * <body>. Anything asynchronous here — including React itself — is too late:
 * the page would paint light and then snap to dark, which is exactly the
 * flash this exists to prevent.
 *
 * There is no `prefers-color-scheme` fallback on purpose. The default is light
 * for everybody until they choose otherwise, so somebody who has never touched
 * the switch gets light even on a machine set to dark.
 */
export function themeBootScript(): string {
  return (
    `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
    `if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`
  )
}

/** Reads the theme the document is currently showing. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
}

// ── the store: the <html> attribute, plus anyone drawing a switch ───────────
const listeners = new Set<() => void>()

/** Subscribe to theme changes. Used by useTheme via useSyncExternalStore. */
export function subscribeToTheme(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => { listeners.delete(onChange) }
}

/** Tell every subscriber the document's theme attribute has moved. */
export function notifyThemeChanged(): void {
  listeners.forEach(l => l())
}

/**
 * Paints a theme and remembers it.
 *
 * Light removes the attribute rather than setting `data-theme="light"`: the
 * light palette lives on bare `:root`, so its absence *is* light. The choice
 * is still written to storage either way, so somebody who deliberately picked
 * light keeps light if the default ever changes.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === "dark") root.setAttribute("data-theme", "dark")
  else root.removeAttribute("data-theme")
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Private mode, or storage disabled. The theme still applies to this page;
    // it just will not survive a reload. Not worth interrupting anybody over.
  }
  notifyThemeChanged()
}
