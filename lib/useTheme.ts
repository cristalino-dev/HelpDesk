/**
 * lib/useTheme.ts — the React side of the light/dark switch.
 *
 * The theme itself lives in lib/themeBoot.ts, which is deliberately not a
 * client module: `app/layout.tsx` is a Server Component and has to call
 * `themeBootScript()` from there. This file is the client half — the hook a
 * switch uses to know which way to draw itself.
 *
 * WHY A STORE RATHER THAN useState
 * ────────────────────────────────
 * The source of truth is the `data-theme` attribute on <html>, not React. Any
 * number of switches on a page therefore agree with each other and with the
 * document without sharing a parent — which a plain `useState` in each of them
 * would not: flipping one would leave the others drawn the old way.
 *
 * WHY THE SERVER SNAPSHOT IS ALWAYS "light"
 * ─────────────────────────────────────────
 * The server has no localStorage, so it renders the default, and React
 * compares against that when it hydrates. `useSyncExternalStore` is built for
 * exactly this split: it uses `getServerSnapshot` through hydration and swaps
 * to the live value immediately afterwards, with no mismatch warning.
 *
 * The *page* does not wait for that. `themeBootScript()` has already set the
 * attribute synchronously, before first paint, so only the switch's own
 * rendering catches up a beat later — and it has not painted yet either.
 */

"use client"
import { useCallback, useEffect, useSyncExternalStore } from "react"
import {
  applyTheme, currentTheme, subscribeToTheme, notifyThemeChanged,
  DEFAULT_THEME, THEME_KEY, type Theme,
} from "@/lib/themeBoot"

export type { Theme }
export { applyTheme, currentTheme, THEME_KEY, DEFAULT_THEME }

/** `[theme, setTheme, toggle]` for whatever is drawing the switch. */
export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme, () => DEFAULT_THEME)

  // A second tab is still the same person: if they switch to dark over there,
  // this tab should not stay light behind it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return
      const root = document.documentElement
      if (e.newValue === "dark") root.setAttribute("data-theme", "dark")
      else root.removeAttribute("data-theme")
      notifyThemeChanged()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setTheme = useCallback((next: Theme) => applyTheme(next), [])
  const toggle = useCallback(() => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark")
  }, [])

  return [theme, setTheme, toggle]
}
