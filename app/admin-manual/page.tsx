import type { Metadata } from "next"
import Image from "next/image"

export const metadata: Metadata = {
  title: "מדריך מנהל – מערכת Helpdesk קריסטלינו",
  description: "מדריך שימוש לצוות התמיכה של מערכת ה-Helpdesk",
}

export default function AdminManualPage() {
  return (
    <div style={{ background: "#f0f2f5", minHeight: "100vh", padding: "32px 16px", fontFamily: "'Segoe UI', Arial, sans-serif", direction: "rtl" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)", borderRadius: "16px 16px 0 0", padding: "36px 40px", textAlign: "center", color: "#fff" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={72} height={72} style={{ objectFit: "contain", borderRadius: 10, marginBottom: 16 }} />
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 6px" }}>מדריך מנהל – Helpdesk</h1>
          <p style={{ margin: 0, opacity: 0.85, fontSize: "0.9rem" }}>מדריך לצוות התמיכה הטכנית של קריסטלינו</p>
          <div style={{ display: "inline-block", marginTop: 14, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "4px 16px", fontSize: "0.78rem", fontWeight: 600 }}>
            Staff Only · Cristalino Group · 2026 · v2.7
          </div>
        </div>

        {/* Body */}
        <div style={{ background: "#fff", padding: "36px 40px", border: "1px solid #e5e7eb", borderTop: "none" }}>

          <p style={{ fontSize: "1rem", lineHeight: 1.7, color: "#374151", marginBottom: 28 }}>
            מדריך זה מיועד לצוות התמיכה הטכנית בלבד.<br />
            הוא מפרט את כל הכלים העומדים לרשותכם לניהול פניות, משתמשים ומעקב אחר המערכת.
          </p>

          {/* Quick links */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 32 }}>
            {[
              { label: "כל הפניות",    href: "/tickets", color: "#2563eb", bg: "#eff6ff" },
              { label: "פאנל ניהול",   href: "/admin",   color: "#4f46e5", bg: "#eef2ff" },
              { label: "לוח אישי",     href: "/dashboard", color: "#0891b2", bg: "#ecfeff" },
            ].map(l => (
              <a key={l.href} href={l.href} style={{ display: "block", textAlign: "center", padding: "14px 10px", borderRadius: 10, background: l.bg, color: l.color, fontWeight: 700, fontSize: "0.88rem", textDecoration: "none", border: `1px solid ${l.bg}` }}>
                {l.label} ←
              </a>
            ))}
          </div>

          <Section icon="📋" title='דף "כל הפניות" — /tickets'>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.7, marginBottom: 14 }}>
              הדף המרכזי לניהול שוטף של כל הפניות במערכת. נגיש לצוות התמיכה בלבד.
            </p>
            <FeatureList items={[
              "סינון בין פניות פתוחות לכל הפניות (כולל סגורות)",
              "חיפוש חופשי בכל השדות — נושא, שם, קטגוריה, פלטפורמה, סטטוס, תאריך",
              "מיון לחיצה על כותרות עמודות (דחיפות, סטטוס, תאריך, זמן טיפול)",
              "כרטיסיות סטטיסטיקה: סה״כ, פתוחות, בטיפול, סגורות, נפתחו/נסגרו היום",
              "זמני סגירה: ממוצע, מהיר ביותר, ארוך ביותר",
              "לחיצה על שם הפנייה — פתיחת מסך פנייה מלאה",
            ]} />
            <Note>
              לחצו על שורת פנייה כדי להרחיב ולראות את התיאור, לשנות סטטוס, לערוך, להוסיף הערה ולפתוח מסך מלא.
            </Note>
          </Section>

          <Section icon="🔎" title="מסך פנייה מלאה — /tickets/[id]">
            <p style={{ fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.7, marginBottom: 14 }}>
              מסך מפורט לפנייה בודדת. כולל את כל המידע, הערות הצוות ותמונות מצורפות.
            </p>
            <FeatureList items={[
              "צפייה בכל שדות הפנייה: נושא, תיאור, קטגוריה, פלטפורמה, דחיפות, סטטוס",
              "עריכת כל שדה — לחצו ✏️ עריכה בפינה",
              "גלריית תמונות מצורפות",
              "ציר הערות טכנאי עם שם הכותב ותאריך",
              "הוספת הערה חדשה עם תמיכה בהדבקת תמונות",
              "שימוש ב-@mention לשליחת התראת מייל לאיש צוות ספציפי",
            ]} />
          </Section>

          <Section icon="✏️" title="עריכת פנייה">
            <Steps items={[
              <>פתחו פנייה (מסך מלא או שורה מורחבת בדף הפניות)</>,
              <>לחצו <strong>✏️ עריכה</strong></>,
              <>ערכו כל שדה לפי הצורך: נושא, תיאור, טלפון, מחשב, קטגוריה, פלטפורמה, דחיפות, סטטוס</>,
              <>לחצו <strong>שמור</strong> — השינויים נשמרים ומייל עדכון נשלח לצוות</>,
            ]} />
          </Section>

          <Section icon="📝" title="הערות טכנאי">
            <p style={{ fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.7, marginBottom: 14 }}>
              הערות הצוות נראות לצוות בלבד — המשתמש אינו רואה אותן.
            </p>
            <FeatureList items={[
              "כתבו את הפעולות שבוצעו בשדה ההערה",
              "ניתן להדביק תמונות (Ctrl+V) — יצורפו לפנייה",
              "לחצו @alon / @daniel / @dev / @helpdesk להזכרת חבר צוות — ישלח לו מייל",
              "ניתן להוסיף מספר הערות לכל פנייה לאורך זמן",
            ]} />
            <Note>
              <strong>@mentions:</strong> השתמשו בכפתורי ״הזכר״ מתחת לשדה ההערה, או הקלידו @handle ישירות בטקסט.
              הנמען מקבל מייל עם תוכן ההערה וקישור לפנייה.
            </Note>
          </Section>

          <Section icon="🔄" title="שינוי סטטוס">
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "פתוח",   bg: "#dbeafe", color: "#1e40af", desc: "פנייה חדשה שטרם טופלה" },
                { label: "בטיפול", bg: "#fef3c7", color: "#92400e", desc: "הצוות עובד על הפנייה — משתמש מקבל מייל" },
                { label: "סגור",   bg: "#dcfce7", color: "#166534", desc: "הפנייה טופלה — משתמש מקבל מייל" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, minWidth: 140, padding: "12px 14px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 700, background: s.bg, color: s.color, marginBottom: 6 }}>{s.label}</span>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <Note>שינוי סטטוס ל-<strong>בטיפול</strong> או <strong>סגור</strong> שולח מייל אוטומטי למגיש הפנייה.</Note>
          </Section>

          <Section icon="📧" title="מערכת המיילים">
            <FeatureList items={[
              "פנייה חדשה נפתחת → מייל לכל צוות התמיכה + אישור למגיש",
              "עדכון פנייה (עריכה/סטטוס) → מייל לכל הצוות",
              'שינוי סטטוס לבטיפול/סגור → מייל נוסף למגיש',
              "@mention בהערה → מייל אישי לאיש הצוות שהוזכר",
              "כל המיילים נשלחים מ-helpdesk@cristalino.co.il",
            ]} />
          </Section>

          <Section icon="🛠️" title='פאנל ניהול — /admin'>
            <p style={{ fontSize: "0.875rem", color: "#6b7280", lineHeight: 1.7, marginBottom: 14 }}>
              נגיש לבעלי הרשאת מנהל מלאה בלבד.
            </p>
            <FeatureList items={[
              "תור פניות — תצוגת כל הפניות הפתוחות עם עדיפות לדחופות",
              "ניהול משתמשים — עריכת שם, טלפון, תחנת עבודה, הרשאת מנהל",
              "יומן שגיאות — צפייה בשגיאות מערכת לפי תאריך לצורך דיבאג",
            ]} />
          </Section>

          <Section icon="👥" title="הרשאות גישה">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { role: "עובד רגיל",    color: "#0891b2", bg: "#ecfeff", perms: "פתיחת פניות, מעקב אחר הפניות שלו, עדכון פרופיל" },
                { role: "צוות תמיכה",  color: "#4f46e5", bg: "#eef2ff", perms: "כל הפניות, עריכה, שינוי סטטוס, הערות, הדף /tickets" },
                { role: "מנהל מערכת",  color: "#7c3aed", bg: "#f5f3ff", perms: "כל האמור + פאנל /admin, ניהול משתמשים, יומן שגיאות" },
              ].map(r => (
                <div key={r.role} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "12px 16px", borderRadius: 10, border: "1px solid #f3f4f6" }}>
                  <span style={{ padding: "3px 12px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 700, background: r.bg, color: r.color, flexShrink: 0 }}>{r.role}</span>
                  <span style={{ fontSize: "0.82rem", color: "#6b7280", lineHeight: 1.5 }}>{r.perms}</span>
                </div>
              ))}
            </div>
          </Section>

          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 18px", fontSize: "0.82rem", color: "#166534", lineHeight: 1.6 }}>
            <strong>צוות התמיכה:</strong> alon@cristalino.co.il · dev@cristalino.co.il · helpdesk@cristalino.co.il · daniel.l@cristalino.co.il
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: "#312e81", borderRadius: "0 0 16px 16px", padding: "24px 40px", textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: "0.78rem", lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.85rem" }}>מדריך מנהל — מערכת Helpdesk קריסטלינו</div>
          <div style={{ marginTop: 6 }}>
            <a href="https://helpdesk.cristalino.co.il" style={{ color: "rgba(255,255,255,0.9)" }}>helpdesk.cristalino.co.il</a>
            {" · "}
            <a href="/manual" style={{ color: "rgba(255,255,255,0.7)" }}>מדריך לעובדים</a>
          </div>
        </div>

      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1rem", fontWeight: 700, color: "#312e81", marginBottom: 14, paddingBottom: 8, borderBottom: "2px solid #eef2ff" }}>
        <span style={{ width: 30, height: 30, background: "#eef2ff", borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#f9fafb", borderRadius: 10, padding: "12px 16px" }}>
          <span style={{ width: 24, height: 24, background: "#4f46e5", color: "#fff", borderRadius: "50%", fontSize: "0.72rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
          <span style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#374151" }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
          <span style={{ color: "#4f46e5", fontWeight: 700, flexShrink: 0, marginTop: 2 }}>✓</span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 10, padding: "14px 18px", fontSize: "0.82rem", color: "#713f12", lineHeight: 1.6, marginTop: 12 }}>
      {children}
    </div>
  )
}
