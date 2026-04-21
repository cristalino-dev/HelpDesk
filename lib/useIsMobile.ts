"use client"
import { useEffect, useState } from "react"

/**
 * Returns true when the viewport width is below `breakpoint` (default 640 px).
 * Hydration-safe: starts as `false` on the server and flips to the real value
 * after the first client-side paint.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [breakpoint])
  return mobile
}
