/**
 * components/AppNav.tsx — the one navigation bar
 *
 * Every page used to hand-roll its own row of links inside AppHeader, and they
 * had drifted into seven different sets: the dashboard offered עזרה and צרו
 * קשר but no דוחות, /admin offered דוחות and לוג שגיאות but no כל הפניות,
 * /admin/reviews offered only לוח משתמש. Which links you saw depended on the
 * page you happened to be standing on rather than on who you are.
 *
 * There is now one list, in one order, derived from the session:
 *
 *   • an admin sees everything;
 *   • everyone else sees exactly what they are allowed to open.
 *
 * The second half of that is not cosmetic. A link that leads to a redirect is
 * worse than no link, so `navLinksFor` mirrors the guards on the pages
 * themselves — /tickets admits admins OR STAFF_EMAILS, /admin/logs admits
 * staff too, /tickets/view is the viewers' read-only twin of כל הפניות.
 * `__tests__/AppNav.test.tsx` holds those in step.
 *
 * LAYOUT: an admin has nine links, which stops fitting well before a phone.
 * Below `COMPACT_PX` the whole row folds into the ☰ menu that /admin already
 * used — same links, same order, no second nav to keep in sync.
 */

"use client"
import { useState } from "react"
import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import { T, HDR } from "@/lib/theme"
import { useIsMobile } from "@/lib/useIsMobile"
import { STAFF_EMAILS, VIEWER_EMAILS } from "@/lib/staffEmails"

/** Below this width the links fold into ☰ — nine of them stop fitting. */
export const COMPACT_PX = 1180

export type NavLink = {
  href: string
  label: string
  /** Shorter wording for the cramped row; falls back to `label`. */
  short?: string
  /** Shown only in the ☰ menu, where there is room for it. */
  icon?: string
}

export type NavUser = { email?: string | null; isAdmin?: boolean } | undefined | null

/**
 * The links this person may open, in reading order.
 *
 * Kept pure and exported so the test can compare it against the page guards
 * without rendering anything.
 */
export function navLinksFor(user: NavUser): NavLink[] {
  if (!user) return []

  const email   = user.email ?? ""
  const isAdmin = !!user.isAdmin
  const isStaff = STAFF_EMAILS.includes(email)
  const isViewer = VIEWER_EMAILS.includes(email)

  const links: NavLink[] = [
    { href: "/dashboard", label: "לוח אישי",  icon: "🏠" },
    { href: "/help",      label: "עזרה",      icon: "❓" },
    { href: "/contact",   label: "צרו קשר",   icon: "✉️" },
  ]

  // כל הפניות — the full queue for anyone who may act on it, and the
  // read-only twin for viewers. Admins qualify through isAdmin alone: they are
  // not necessarily in STAFF_EMAILS, which is what used to hide this from them.
  if (isAdmin || isStaff)   links.push({ href: "/tickets",      label: "כל הפניות", short: "פניות", icon: "📋" })
  else if (isViewer)        links.push({ href: "/tickets/view", label: "כל הפניות", short: "פניות", icon: "📋" })

  if (isAdmin) {
    // "ניהול מערכת", not "ניהול פניות": only one of its seven tabs is the
    // queue, and that queue is כל הפניות. The rest is users, licences,
    // printers, missing equipment, system fields and the error log.
    links.push({ href: "/admin",         label: "ניהול מערכת", short: "ניהול", icon: "⚙️" })
    links.push({ href: "/admin/reports", label: "דוחות",       icon: "📊" })
    links.push({ href: "/admin/reviews", label: "ביקורות",     icon: "⭐" })
  }

  // Both of these admit staff as well as admins, per their own guards: the
  // error log has always, and the manual is addressed to the support team in
  // its own opening line.
  if (isAdmin || isStaff) links.push({ href: "/admin/logs",   label: "לוג שגיאות", short: "שגיאות", icon: "⚠️" })
  if (isAdmin || isStaff) links.push({ href: "/admin-manual", label: "מדריך מנהל", short: "מדריך",  icon: "📖" })

  return links
}

export function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
}

/** The public quick-open page — recipients land on the new-ticket form. */
const SHARE_URL = "https://helpdesk.cristalino.co.il/open"

const linkStyle = (active: boolean): React.CSSProperties => ({
  fontSize: "0.82rem",
  color: active ? HDR.linkStrong : HDR.link,
  textDecoration: "none",
  padding: "8px 11px",
  borderRadius: 9,
  fontWeight: active ? 700 : 500,
  background: active ? HDR.hoverBg : "transparent",
  whiteSpace: "nowrap",
})

export default function AppNav() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const compact = useIsMobile(COMPACT_PX)
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const user = session?.user
  const links = navLinksFor(user)

  const copyLink = () => {
    navigator.clipboard?.writeText(SHARE_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(href + "/"))

  const copyButton = (
    <button
      title="העתק קישור למערכת" aria-label="העתק קישור למערכת" onClick={copyLink}
      style={{
        background: copied ? HDR.greenPillBg : "transparent", border: "none", borderRadius: 9,
        cursor: "pointer", padding: isMobile ? "6px 8px" : "8px 11px", display: "flex",
        alignItems: "center", gap: 5, color: copied ? HDR.greenPillFg : HDR.link,
        fontSize: "0.82rem", fontWeight: 500,
      }}
    >
      {copied
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {!isMobile && (copied ? "הועתק!" : "קישור")}
    </button>
  )

  const profilePill = (
    <Link
      href="/profile"
      style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", padding: "5px 7px 5px 12px", borderRadius: 999, background: HDR.pillBg }}
    >
      {!isMobile && <span style={{ fontSize: "0.81rem", color: HDR.linkStrong, fontWeight: 500 }}>{user?.name}</span>}
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.darkSoft, border: "1px solid rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, color: T.green }}>
        {initials(user?.name)}
      </div>
    </Link>
  )

  const logout = (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{ fontSize: "0.82rem", color: HDR.muted, background: "none", border: "none", cursor: "pointer", padding: "8px 12px", fontWeight: 500, whiteSpace: "nowrap" }}
    >יציאה</button>
  )

  const rolePill = user?.isAdmin ? "ADMIN" : STAFF_EMAILS.includes(user?.email ?? "") ? "STAFF" : null

  if (!user) return null

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        {!compact && links.map(l => (
          <Link key={l.href} href={l.href} style={linkStyle(!!isActive(l.href))}>{l.label}</Link>
        ))}

        {copyButton}

        {rolePill && !isMobile && (
          <span style={{ padding: "5px 12px", borderRadius: 999, background: HDR.greenPillBg, color: HDR.greenPillFg, fontSize: "0.7rem", fontWeight: 700, letterSpacing: ".04em", margin: "0 4px" }}>{rolePill}</span>
        )}

        {!compact && profilePill}
        {!compact && logout}

        {compact && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="תפריט" aria-expanded={menuOpen}
            style={{ background: "none", border: "none", color: HDR.linkStrong, fontSize: "1.3rem", cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}
          >{menuOpen ? "✕" : "☰"}</button>
        )}
      </div>

      {/* Same links, same order — the menu is a reflow, not a second nav. */}
      {compact && menuOpen && (
        <div style={{ position: "absolute", top: isMobile ? 58 : 64, right: 0, left: 0, zIndex: 100, background: T.card, boxShadow: "0 8px 24px rgba(20,22,26,0.12)", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          {links.map(l => (
            <Link
              key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
              style={{ display: "block", padding: "14px 24px", color: isActive(l.href) ? T.text : T.text2, textDecoration: "none", fontSize: "0.9rem", fontWeight: isActive(l.href) ? 700 : 500, borderBottom: `1px solid ${T.border}` }}
            >{l.icon ? `${l.icon} ` : ""}{l.label}</Link>
          ))}
          <Link
            href="/profile" onClick={() => setMenuOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", color: T.text, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}
          >
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: T.green }}>
              {initials(user?.name)}
            </div>
            {user?.name}
          </Link>
          <button
            onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/login" }) }}
            style={{ display: "block", width: "100%", textAlign: "right", padding: "14px 24px", color: T.muted, background: "none", border: "none", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer" }}
          >יציאה</button>
        </div>
      )}
    </>
  )
}
