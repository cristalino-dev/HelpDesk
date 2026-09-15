"use client"
import { useEffect, useState } from "react"

/**
 * Returns true when the viewport width is below `breakpoint` (default 768 px).
 * Hydration-safe: starts as `false` on the server and flips to the real value
 * after the first client-side paint.
 *
 * The 768 px cutoff is the standard phone/tablet boundary (Tailwind `md`).
 * It must stay above ~430 px so that large phones and phablets — whose portrait
 * CSS width can reach 600–700 px — still receive the stacked mobile layout
 * rather than the dense desktop grids, which get crushed and wrap on narrow
 * screens. Real tablets and desktops (≥ 768 px) keep the grid layouts.
 *
 * IT MEASURES THE LAYOUT VIEWPORT, NOT window.innerWidth (v3.90). On a phone,
 * innerWidth is the width of what is on screen at the current zoom. When a page
 * is wider than the phone and Chrome zooms out to show it — or restores the
 * zoom-out from last time — innerWidth reports ~1,500 px, this hook said
 * "desktop", the desktop top bar kept the page 1,500 px wide, and the phone
 * never got its layout: the whole nav in one row, the content a strip beside it.
 * A media query is measured against the layout viewport, which
 * `width=device-width` pins to the phone's width whatever the zoom — and it
 * reports a change when the phone is turned.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    // jsdom (the tests) has no matchMedia; innerWidth is all it offers.
    if (typeof window.matchMedia !== "function") {
      const check = () => setMobile(window.innerWidth < breakpoint)
      check()
      window.addEventListener("resize", check)
      return () => window.removeEventListener("resize", check)
    }

    // 767.98, not 767: a zoomed or high-DPI layout width can be fractional.
    const query = window.matchMedia(`(max-width: ${(breakpoint - 0.02).toFixed(2)}px)`)
    const check = () => setMobile(query.matches)
    check()
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", check)
      return () => query.removeEventListener("change", check)
    }
    // Safari before 14 has only the older pair.
    query.addListener(check)
    return () => query.removeListener(check)
  }, [breakpoint])
  return mobile
}
