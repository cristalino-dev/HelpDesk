import type { Metadata } from "next"
import Image from "next/image"

export const metadata: Metadata = {
  title: "מדריך שימוש – מערכת Helpdesk קריסטלינו",
  description: "מדריך שימוש מלא למערכת ה-Helpdesk של קריסטלינו גרופ",
}

export default function ManualPage() {
  return (
    <div style={{ background: "#f0f2f5", minHeight: "100vh", padding: "32px 16px", fontFamily: "'Segoe UI', Arial, sans-serif", direction: "rtl" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", borderRadius: "16px 16px 0 0", padding: "36px 40px", textAlign: "center", color: "#fff" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={72} height={72} style={{ objectFit: "contain", borderRadius: 10, marginBottom: 16 }} />
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "0 0 6px" }}>מערכת Helpdesk קריסטלינו</h1>
          <p style={{ margin: 0, opacity: 0.85, fontSize: "0.9rem" }}>מדריך שימוש לעובדי החברה</p>
          <div style={{ display: "inline-block", marginTop: 14, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "4px 16px", fontSize: "0.78rem", fontWeight: 600 }}>
            Cristalino Group · 2026 · v2.7
          </div>
        </div>

        {/* Body */}
        <div style={{ background: "#fff", padding: "36px 40px", border: "1px solid #e5e7eb", borderTop: "none" }}>

          <p style={{ fontSize: "1rem", lineHeight: 1.7, color: "#374151", marginBottom: 28 }}>
            שלום,<br /><br />
            אנו שמחים להודיע על השקת <strong style={{ color: "#1e3a8a" }}>מערכת ה-Helpdesk</strong> של קריסטלינו —
            מערכת לניהול פניות תמיכה טכנית מקצה לקצה.<br /><br />
            מעכשיו, כל תקלה, בקשה או שאלה טכנית מוגשת דרך המערכת, עוקבת אחר סטטוס הטיפול בזמן אמת,
            ומתועדת לאורך כל תהליך הטיפול.
          </p>

          {/* URL box */}
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "18px 24px", marginBottom: 32, textAlign: "center" }}>
            <div style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600, marginBottom: 6 }}>כתובת המערכת</div>
            <a href="https://helpdesk.cristalino.co.il" style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1d4ed8", textDecoration: "none" }}>
              helpdesk.cristalino.co.il
            </a>
          </div>

          <Section icon="🔑" title="כניסה למערכת">
            <Steps items={[
              <><strong>גשו לכתובת</strong> helpdesk.cristalino.co.il בדפדפן</>,
              <>לחצו על <strong>"התחברות עם Google"</strong></>,
              <>בחרו את <strong>חשבון Google הארגוני</strong> שלכם (@cristalino.co.il)</>,
              <>הגעתם ללוח הבקרה האישי שלכם — ניתן להתחיל!</>,
            ]} />
            <Note>
              <strong>שימו לב:</strong> יש להיכנס עם חשבון Google הארגוני בלבד (@cristalino.co.il). חשבונות Gmail פרטיים לא יתקבלו.
            </Note>
          </Section>

          <Section icon="📋" title="פתיחת פנייה חדשה">
            <Steps items={[
              <>בלוח הבקרה, לחצו על <strong>"+ פנייה חדשה"</strong></>,
              <>מלאו: <strong>נושא, תיאור מפורט, טלפון ושם המחשב</strong></>,
              <>בחרו <strong>קטגוריה, פלטפורמה ורמת דחיפות</strong></>,
              <>לחצו <strong>"שלח פנייה"</strong> — הפנייה מועברת מיידית לצוות התמיכה</>,
            ]} />
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 18, marginBottom: 6, fontWeight: 600 }}>רמות דחיפות:</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "דחוף — תקלה קריטית",    bg: "#fee2e2", color: "#991b1b" },
                { label: "גבוה — פגיעה בעבודה",    bg: "#ffedd5", color: "#9a3412" },
                { label: "בינוני — מוגבלות חלקית", bg: "#fef3c7", color: "#92400e" },
                { label: "נמוך — שאלה / בקשה",     bg: "#dcfce7", color: "#166534" },
              ].map(b => (
                <span key={b.label} style={{ padding: "4px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span>
              ))}
            </div>
          </Section>

          <Section icon="🔍" title="מעקב אחר הפניות שלי">
            <Steps items={[
              <>בלוח הבקרה מוצגות <strong>כל הפניות שלכם</strong> לפי תאריך</>,
              <>בראש הדף: כרטיסיות סיכום — פתוחות, בטיפול, סגורות</>,
            ]} />
            <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 18, marginBottom: 6, fontWeight: 600 }}>סטטוסים:</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "פתוח — התקבלה, טרם טופלה", bg: "#dbeafe", color: "#1e40af" },
                { label: "בטיפול — צוות התמיכה מטפל", bg: "#fef3c7", color: "#92400e" },
                { label: "סגור — טופלה ונסגרה",        bg: "#dcfce7", color: "#166534" },
              ].map(b => (
                <span key={b.label} style={{ padding: "4px 14px", borderRadius: 999, fontSize: "0.78rem", fontWeight: 600, background: b.bg, color: b.color }}>{b.label}</span>
              ))}
            </div>
          </Section>

          <Section icon="👤" title="פרופיל אישי">
            <Steps items={[
              <>לחצו על <strong>שמכם</strong> בסרגל הניווט העליון</>,
              <>עדכנו <strong>מספר טלפון ושם תחנת עבודה</strong> — ימולאו אוטומטית בפניות הבאות</>,
            ]} />
          </Section>

          {/* Tips */}
          <Section icon="📎" title="צירוף תמונה לפנייה">
            <Steps items={[
              <>בשדה <strong>תיאור מפורט</strong> ניתן לצרף צילום מסך או תמונה</>,
              <>לחצו על אזור <strong>״גררו תמונה לכאן״</strong> מתחת לתיאור לבחירת קובץ</>,
              <>לחלופין, <strong>הדביקו תמונה (Ctrl+V)</strong> ישירות לאחר שצילמתם מסך</>,
              <>ניתן לצרף מספר תמונות לאותה פנייה</>,
            ]} />
          </Section>

          <Section icon="💡" title="טיפים לשימוש יעיל">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { icon: "📝", title: "תיאור מפורט",  desc: "פרטו מה קרה, מתי ואיך לשחזר — זה מקצר משמעותית את זמן הטיפול" },
                { icon: "🖥️", title: "שם מחשב",      desc: "מצאו בהגדרות ← אודות, או פתחו cmd והקלידו hostname" },
                { icon: "📞", title: "שמרו פרופיל",  desc: "הזינו טלפון ותחנה בפרופיל פעם אחת — ימולאו אוטומטית בכל פנייה" },
                { icon: "📧", title: "עדכונים במייל", desc: "תקבלו מייל אוטומטי כשהפנייה בטיפול וכשנסגרת" },
              ].map(c => (
                <div key={c.title} style={{ flex: 1, minWidth: 160, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#111827", marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", lineHeight: 1.5 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </Section>

          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 18px", fontSize: "0.82rem", color: "#166534", lineHeight: 1.6 }}>
            <strong>עזרה נוספת:</strong> לחצו על "עזרה" או "צרו קשר" בסרגל העליון של המערכת לקבלת תמיכה ישירה.
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: "#1e3a8a", borderRadius: "0 0 16px 16px", padding: "24px 40px", textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: "0.78rem", lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.85rem" }}>מערכת Helpdesk — קריסטלינו גרופ</div>
          <div style={{ marginTop: 6 }}>
            <a href="https://helpdesk.cristalino.co.il" style={{ color: "rgba(255,255,255,0.9)" }}>helpdesk.cristalino.co.il</a>
          </div>
        </div>

      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1rem", fontWeight: 700, color: "#1e3a8a", marginBottom: 14, paddingBottom: 8, borderBottom: "2px solid #eff6ff" }}>
        <span style={{ width: 30, height: 30, background: "#eff6ff", borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>{icon}</span>
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
          <span style={{ width: 24, height: 24, background: "#2563eb", color: "#fff", borderRadius: "50%", fontSize: "0.72rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
          <span style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#374151" }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 10, padding: "14px 18px", fontSize: "0.82rem", color: "#713f12", lineHeight: 1.6, marginTop: 12 }}>
      {children}
    </div>
  )
}
