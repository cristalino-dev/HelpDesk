/**
 * components/AppHeader.tsx — Shared dark top bar (Cristalino theme)
 *
 * Every page in the system renders this same dark chrome so the app looks
 * uniform: near-black bar, white logo chip, light nav actions.
 *
 * The page-specific actions (nav links, avatar, logout, back button, …) are
 * passed as children and should use the HDR tokens from lib/theme.ts for
 * their colors.
 *
 * MOBILE: the bar keeps everything on one 60px row; children get
 * `minWidth: 0` so long action rows shrink instead of overflowing the
 * viewport (see the v3.52 mobile-overflow fix).
 */

"use client"
import { ReactNode } from "react"
import Logo from "@/components/Logo"
import { HDR } from "@/lib/theme"
import { useIsMobile } from "@/lib/useIsMobile"

export default function AppHeader({
  children,
  wordmark = "helpdesk",
  subtitle = "מערכת",
  logoHref,
}: {
  /** Page-specific actions rendered on the far side of the bar. */
  children?: ReactNode
  wordmark?: string | false
  /** Secondary label after the wordmark; hidden automatically on mobile. */
  subtitle?: string | false
  /** When set, the logo links there (e.g. back to /dashboard). */
  logoHref?: string
}) {
  const isMobile = useIsMobile()

  const logo = (
    <Logo
      onDark
      size={isMobile ? 26 : 30}
      wordmark={isMobile && wordmark === "helpdesk" ? "helpdesk" : wordmark}
      subtitle={isMobile ? false : subtitle}
    />
  )

  return (
    <header style={{
      background: HDR.bg,
      borderBottom: `1px solid ${HDR.border}`,
      padding: isMobile ? "0 12px" : "0 30px",
      height: isMobile ? 58 : 64,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    }}>
      <div style={{ flexShrink: 0 }}>
        {logoHref ? (
          <a href={logoHref} style={{ textDecoration: "none" }}>{logo}</a>
        ) : logo}
      </div>
      <div style={{
        display: "flex", alignItems: "center",
        gap: isMobile ? 2 : 4,
        minWidth: 0, // let the action row shrink on narrow screens
      }}>
        {children}
      </div>
    </header>
  )
}
