/**
 * components/OffboardingNotice.tsx — What happens when you pick "סגירת משתמש"
 *
 * Shown on both ticket forms in place of the equipment picker. There is nothing
 * to choose here: the return checklist is the whole gear list, built by the
 * server when the ticket is created (see lib/offboarding.ts). This panel exists
 * so the person filing the ticket knows that, and knows the ticket will not
 * close until every line is ticked.
 *
 * The items are listed rather than merely counted, because "12 items" tells the
 * reader nothing about whether the Zoho seat is on the list.
 *
 * PROPS:
 *   items       {string[]}        The live equipment option labels.
 *   labelStyle  {CSSProperties}   Optional style for the heading label.
 */

"use client"
import { T } from "@/lib/theme"

export default function OffboardingNotice({
  items,
  labelStyle,
}: {
  items: string[]
  labelStyle?: React.CSSProperties
}) {
  return (
    <div style={{ backgroundColor: T.cardMuted, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={{ margin: 0, ...labelStyle }}>רשימת החזרת ציוד וסגירת חשבונות</label>
        <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: T.text3, lineHeight: 1.6 }}>
          הפנייה תיפתח עם רשימה מלאה של כל הפריטים והחשבונות. הטכנאי יסמן כל פריט שהוחזר או שנסגר,
          ויסיר מהרשימה פריטים שאינם רלוונטיים לעובד זה. <strong>לא ניתן לסגור את הפנייה עד שכל הפריטים יסומנו.</strong>
        </p>
      </div>

      {items.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map(item => (
            <span
              key={item}
              style={{ fontSize: "0.78rem", fontWeight: 600, color: T.text2, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 999, padding: "4px 11px" }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: "0.8rem", color: T.text3 }}>
          לא הוגדרו פריטי ציוד. ניתן להוסיף אותם בלשונית &quot;שדות מערכת&quot;.
        </p>
      )}
    </div>
  )
}
