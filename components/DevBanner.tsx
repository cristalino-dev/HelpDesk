/**
 * components/DevBanner.tsx — the strip that says "this is not production" (v3.86).
 *
 * Rendered by app/layout.tsx on the dev copy only (lib/appEnv.ts). The dev copy
 * holds a copy of real tickets and looks exactly like the real thing, so a
 * staff member with both open in two tabs must be told which one this is — on
 * every page, and in the colour that means "careful".
 *
 * The redirect address is deliberately not shown: the banner is on the login
 * page too.
 */

import { T } from "@/lib/theme"

export default function DevBanner() {
  return (
    <div role="note" style={{
      position: "sticky", top: 0, zIndex: 10000,
      background: T.amberBg, color: T.amberFgDeep, borderBottom: `2px solid ${T.amberBorder}`,
      textAlign: "center", fontSize: "0.8rem", fontWeight: 700, padding: "6px 12px",
    }}>
      🧪 סביבת פיתוח (DEV) — עותק של הנתונים, לא המערכת האמיתית. מיילים נשלחים רק לכתובת הבדיקה.
    </div>
  )
}
