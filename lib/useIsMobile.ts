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
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [breakpoint])
  return mobile
}
