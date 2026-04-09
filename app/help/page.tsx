import Image from "next/image"
import Link from "next/link"
import APP_VERSION from "@/lib/version"

const badge = (bg: string, color: string, text: string) => (
  <span style={{ backgroundColor: bg, color, padding: "3px 12px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, display: "inline-block" }}>{text}</span>
)

export default function HelpPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif", direction: "rtl" }}>

      {/* Header */}
      <header style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={40} height={40} style={{ objectFit: "contain", borderRadius: "6px" }} />
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>מערכת helpdesk</span>
          <span style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: "20px" }}>מדריך למשתמש</span>
        </div>
        <Link href="/dashboard" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", textDecoration: "none" }}>חזרה ללוח הבקרה</Link>
      </header>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: "40px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <h1 style={{ margin: "0 0 10px", fontSize: "1.7rem", fontWeight: 800, color: "#1f2937" }}>מדריך שימוש במערכת helpdesk</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>כל מה שצריך לדעת כדי לפתוח פנייה ולעקוב אחריה</p>
        </div>

        {/* TOC */}
        <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "24px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f3f4f6" }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, color: "#374151", fontSize: "0.9rem" }}>תוכן עניינים</p>
          <ol style={{ margin: 0, padding: "0 20px", display: "flex", flexDirection: "column", gap: "8px", color: "#2563eb", fontSize: "0.9rem" }}>
            <li><a href="#login" style={{ color: "#2563eb" }}>כניסה למערכת</a></li>
            <li><a href="#dashboard" style={{ color: "#2563eb" }}>לוח הבקרה — הפניות שלי</a></li>
            <li><a href="#new-ticket" style={{ color: "#2563eb" }}>פתיחת פנייה חדשה</a></li>
            <li><a href="#statuses" style={{ color: "#2563eb" }}>מצבי פנייה</a></li>
            <li><a href="#urgency" style={{ color: "#2563eb" }}>רמות דחיפות</a></li>
          </ol>
        </div>

        {/* ── SECTION 1: LOGIN ── */}
        <section id="login" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="1" title="כניסה למערכת" />

          {/* Mockup */}
          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #312e81 50%, #1e40af 100%)", padding: "40px 24px", display: "flex", justifyContent: "center" }}>
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "36px 32px", width: "300px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
                <Image src="/logo.jpeg" alt="Cristalino Group" width={90} height={90} style={{ objectFit: "contain" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#111827", marginBottom: "6px" }}>מערכת helpdesk</div>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>התחברו עם חשבון Google שלכם</div>
                </div>
                <div style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: "10px", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", color: "#374151", fontSize: "0.88rem", fontWeight: 600, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  התחברות עם Google
                </div>
                <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>כניסה מורשית לעובדי קריסטלינו בלבד</div>
              </div>
            </div>
          </div>

          {/* Steps */}
          <Card>
            <Steps steps={[
              { n: 1, text: <span>גשו לכתובת המערכת בדפדפן שלכם</span> },
              { n: 2, text: <span>לחצו על הכפתור <Strong>התחברות עם Google</Strong></span> },
              { n: 3, text: <span>בחרו את חשבון ה-Google של קריסטלינו שלכם (<Strong>@cristalino...</Strong>)</span> },
              { n: 4, text: <span>המערכת תעביר אתכם אוטומטית ללוח הבקרה</span> },
            ]} />
            <Note text="יש להתחבר עם חשבון ה-Google הארגוני בלבד. חשבונות אישיים לא יתקבלו." />
          </Card>
        </section>

        {/* ── SECTION 2: DASHBOARD ── */}
        <section id="dashboard" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="2" title='לוח הבקרה — "הפניות שלי"' />

          {/* Mockup */}
          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
            {/* Header bar */}
            <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Image src="/logo.jpeg" alt="" width={32} height={32} style={{ objectFit: "contain", borderRadius: "4px" }} />
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem" }}>מערכת helpdesk</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.65rem", fontWeight: 800 }}>יש</div>
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.8rem" }}>ישראל ישראלי</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>יציאה</span>
              </div>
            </div>
            {/* Body */}
            <div style={{ backgroundColor: "#f0f2f5", padding: "16px" }}>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "14px" }}>
                {[
                  { label: "פתוחות", count: 2, color: "#2563eb", bg: "#eff6ff" },
                  { label: "בטיפול", count: 1, color: "#d97706", bg: "#fffbeb" },
                  { label: "סגורות", count: 5, color: "#16a34a", bg: "#f0fdf4" },
                ].map(s => (
                  <div key={s.label} style={{ backgroundColor: "#fff", borderRadius: "10px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "30px", height: "30px", borderRadius: "8px", backgroundColor: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: s.color, fontSize: "0.95rem" }}>{s.count}</div>
                    <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>{s.label}</span>
                  </div>
                ))}
              </div>
              {/* Title row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1f2937" }}>הפניות שלי</span>
                <div style={{ backgroundColor: "#2563eb", color: "#fff", fontSize: "0.78rem", fontWeight: 600, padding: "6px 14px", borderRadius: "8px" }}>+ פנייה חדשה</div>
              </div>
              {/* Ticket card */}
              {[
                { subject: "המדפסת לא מדפיסה", computer: "PC-ALON-01", cat: "מדפסת", urgency: "גבוה", urgencyBg: "#ffedd5", urgencyColor: "#9a3412", status: "בטיפול", statusBg: "#fef3c7", statusColor: "#92400e", border: "#f97316" },
                { subject: "שגיאה בהתחברות לרשת", computer: "PC-SARA-02", cat: "רשת", urgency: "דחוף", urgencyBg: "#fee2e2", urgencyColor: "#991b1b", status: "פתוח", statusBg: "#dbeafe", statusColor: "#1e40af", border: "#ef4444" },
              ].map((t, i) => (
                <div key={i} style={{ backgroundColor: "#fff", borderRadius: "10px", borderRight: `4px solid ${t.border}`, padding: "10px 14px 10px 12px", marginBottom: "8px", display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: "10px" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#111827" }}>{t.subject}</div>
                    <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginTop: "2px" }}>{t.computer} · {t.cat}</div>
                  </div>
                  <span style={{ backgroundColor: t.urgencyBg, color: t.urgencyColor, padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>{t.urgency}</span>
                  <span style={{ backgroundColor: t.statusBg, color: t.statusColor, padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <Card>
            <p style={{ margin: "0 0 16px", color: "#374151", fontSize: "0.9rem", lineHeight: 1.7 }}>
              לאחר הכניסה, תגיעו ללוח הבקרה שם תוכלו לראות את כל הפניות שלכם ולפתוח פנייה חדשה.
            </p>
            <FieldList items={[
              { label: "סטטיסטיקה", desc: "שלושה כרטיסים בראש הדף מציגים כמה פניות פתוחות, בטיפול וסגורות" },
              { label: "רשימת פניות", desc: "כל פניה מוצגת כרצועה עם נושא, שם מחשב, קטגוריה, דחיפות ומצב" },
              { label: "גבול צבעוני", desc: "הפס הצבעוני בצד ימין של כל פנייה מציין את רמת הדחיפות" },
              { label: "כפתור פנייה חדשה", desc: 'לחצו על "+ פנייה חדשה" כדי לפתוח טופס הגשה' },
            ]} />
          </Card>
        </section>

        {/* ── SECTION 3: NEW TICKET ── */}
        <section id="new-ticket" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="3" title="פתיחת פנייה חדשה" />

          {/* Form mockup */}
          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1f2937" }}>פתיחת פנייה חדשה</span>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Subject */}
              <MockField label="נושא הפנייה *" placeholder="תאר בקצרה את הבעיה" />
              {/* Computer + Phone */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <MockField label="שם מחשב *" placeholder="לדוגמה: PC-ALON-01" hint="?" />
                <MockField label="טלפון *" placeholder="050-0000000" />
              </div>
              {/* Category + Urgency */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <MockSelect label="קטגוריה" value="אחר" />
                <MockSelect label="דחיפות" value="בינוני" colored />
              </div>
              {/* Description */}
              <MockTextarea label="תיאור מפורט *" />
              {/* Button */}
              <div style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", fontWeight: 700, padding: "11px 0", borderRadius: "10px", textAlign: "center", fontSize: "0.88rem" }}>שלח פנייה</div>
            </div>
          </div>

          {/* Field guide */}
          <Card>
            <p style={{ margin: "0 0 18px", fontWeight: 700, color: "#1f2937", fontSize: "0.95rem" }}>מה למלא בכל שדה</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <FieldGuideItem
                label="נושא הפנייה"
                required
                desc="תיאור קצר ותמציתי של הבעיה. לדוגמה: המדפסת לא מדפיסה, אין חיבור לאינטרנט, שגיאה בפתיחת Outlook."
              />
              <FieldGuideItem
                label="שם מחשב"
                required
                desc={<>שם הזיהוי של המחשב שלכם ברשת. לחצו על סמל <Strong>?</Strong> שליד השדה לקבלת הסבר כיצד למצוא אותו (Start → cmd → hostname).</>}
              />
              <FieldGuideItem
                label="טלפון"
                required
                desc="מספר הטלפון שבו ניתן לחזור אליכם."
              />
              <FieldGuideItem
                label="קטגוריה"
                desc={<>בחרו את הקטגוריה המתאימה לבעיה: <Strong>חומרה</Strong> (מחשב, מסך, עכבר), <Strong>תוכנה</Strong> (תוכנית, מערכת הפעלה), <Strong>רשת</Strong> (אינטרנט, Wi-Fi), <Strong>מדפסת</Strong>, <Strong>אחר</Strong>.</>}
              />
              <FieldGuideItem
                label="דחיפות"
                desc={<>בחרו את רמת הדחיפות בהתאם להשפעה על עבודתכם. ראו סעיף 5 למטה להסבר מלא על כל רמה.</>}
              />
              <FieldGuideItem
                label="תיאור מפורט"
                required
                desc="פרטו את הבעיה בצורה מלאה: מתי התחילה, מה קרה לפני שהתחילה, האם הופיעה הודעת שגיאה. ככל שתפרטו יותר — כך הטיפול יהיה מהיר יותר."
              />
            </div>
            <Note text="שדות המסומנים ב-* הם חובה. לא ניתן לשלוח את הטופס ללא מילוי שדות אלה." />
          </Card>

          <Card>
            <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1f2937", fontSize: "0.95rem" }}>מה קורה אחרי שמגישים פנייה?</p>
            <Steps steps={[
              { n: 1, text: <span>הפנייה נשמרת במערכת ומופיעה מיד תחת &quot;הפניות שלי&quot;</span> },
              { n: 2, text: <span>צוות התמיכה רואה את הפנייה בתור הניהול, ממוינת לפי דחיפות</span> },
              { n: 3, text: <span>כשהטכנאי מתחיל לטפל, המצב יתעדכן ל-<Strong>בטיפול</Strong></span> },
              { n: 4, text: <span>בסיום הטיפול המצב יתעדכן ל-<Strong>סגור</Strong></span> },
            ]} />
          </Card>
        </section>

        {/* ── SECTION 4: STATUSES ── */}
        <section id="statuses" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="4" title="מצבי פנייה" />
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <StatusRow badge={badge("#dbeafe", "#1e40af", "פתוח")} title="פתוח" desc="הפנייה התקבלה ומחכה לטיפול. הפנייה נמצאת בתור הניהול." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <StatusRow badge={badge("#fef3c7", "#92400e", "בטיפול")} title="בטיפול" desc="טכנאי החל לעבוד על הפנייה. ייתכן שיצרו איתכם קשר בקרוב." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <StatusRow badge={badge("#dcfce7", "#166534", "סגור")} title="סגור" desc="הבעיה טופלה וסגורה. אם הבעיה חזרה, פתחו פנייה חדשה." />
            </div>
          </Card>
        </section>

        {/* ── SECTION 5: URGENCY ── */}
        <section id="urgency" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="5" title="רמות דחיפות — מתי לבחור מה?" />
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <UrgencyRow badge={badge("#fee2e2", "#991b1b", "דחוף")} title="דחוף" desc="המחשב לא עולה כלל, אין גישה למערכות קריטיות, הבעיה מונעת עבודה לחלוטין." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <UrgencyRow badge={badge("#ffedd5", "#9a3412", "גבוה")} title="גבוה" desc="קושי משמעותי בעבודה השוטפת, בעיה שפוגעת בפרודוקטיביות אך ניתן לעבוד בחלקה." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <UrgencyRow badge={badge("#fef3c7", "#92400e", "בינוני")} title="בינוני" desc="בעיה שיש לטפל בה אך אינה מונעת עבודה. ברירת המחדל לרוב הפניות." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <UrgencyRow badge={badge("#dcfce7", "#166534", "נמוך")} title="נמוך" desc="בקשה שאינה דחופה: שדרוג, התקנת תוכנה, שאלה כללית." />
            </div>
            <Note text='אנא בחרו את רמת הדחיפות בצורה מדויקת. דחיפות גבוהה מדי עלולה לדחות פניות אחרות שצריכות טיפול מיידי.' />
          </Card>
        </section>

      </main>

      <footer style={{ textAlign: "center", padding: "24px 0 32px", fontSize: "0.72rem", color: "#9ca3af" }}>
        v{APP_VERSION} &copy; 2026 Alon Kerem
      </footer>
    </div>
  )
}

/* ── Sub-components ── */

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1rem", flexShrink: 0 }}>{number}</div>
      <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#1f2937" }}>{title}</h2>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "24px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f3f4f6" }}>
      {children}
    </div>
  )
}

function Steps({ steps }: { steps: { n: number; text: React.ReactNode }[] }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
      {steps.map(s => (
        <li key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#eff6ff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 800, flexShrink: 0, marginTop: "1px" }}>{s.n}</div>
          <span style={{ color: "#374151", fontSize: "0.9rem", lineHeight: 1.6 }}>{s.text}</span>
        </li>
      ))}
    </ol>
  )
}

function Note({ text }: { text: string }) {
  return (
    <div style={{ marginTop: "16px", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 14px", fontSize: "0.82rem", color: "#92400e", display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0 }}>⚠</span>
      <span>{text}</span>
    </div>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "#1f2937" }}>{children}</strong>
}

function FieldList({ items }: { items: { label: string; desc: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {items.map(i => (
        <div key={i.label} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div style={{ backgroundColor: "#eff6ff", color: "#1d4ed8", padding: "2px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, flexShrink: 0, marginTop: "1px" }}>{i.label}</div>
          <span style={{ color: "#4b5563", fontSize: "0.88rem", lineHeight: 1.6 }}>{i.desc}</span>
        </div>
      ))}
    </div>
  )
}

function FieldGuideItem({ label, required, desc }: { label: string; required?: boolean; desc: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div style={{ minWidth: "100px", backgroundColor: required ? "#eff6ff" : "#f9fafb", color: required ? "#1d4ed8" : "#374151", padding: "3px 10px", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, textAlign: "center", flexShrink: 0, border: `1px solid ${required ? "#bfdbfe" : "#e5e7eb"}` }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </div>
      <span style={{ color: "#4b5563", fontSize: "0.88rem", lineHeight: 1.65 }}>{desc}</span>
    </div>
  )
}

function StatusRow({ badge, title, desc }: { badge: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0, paddingTop: "2px" }}>{badge}</div>
      <div>
        <div style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", marginBottom: "3px" }}>{title}</div>
        <div style={{ color: "#6b7280", fontSize: "0.85rem", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  )
}

function UrgencyRow({ badge, title, desc }: { badge: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0, paddingTop: "2px" }}>{badge}</div>
      <div>
        <div style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", marginBottom: "3px" }}>{title}</div>
        <div style={{ color: "#6b7280", fontSize: "0.85rem", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  )
}

function MockField({ label, placeholder, hint }: { label: string; placeholder: string; hint?: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "5px" }}>
        <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151" }}>{label}</label>
        {hint && <div style={{ width: "14px", height: "14px", borderRadius: "50%", backgroundColor: "#dbeafe", color: "#2563eb", fontSize: "0.6rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>?</div>}
      </div>
      <div style={{ border: "1px solid #d1d5db", borderRadius: "7px", padding: "7px 10px", fontSize: "0.78rem", color: "#9ca3af", backgroundColor: "#fff" }}>{placeholder}</div>
    </div>
  )
}

function MockSelect({ label, value, colored }: { label: string; value: string; colored?: boolean }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>{label}</label>
      <div style={{ border: `1px solid ${colored ? "#fcd34d" : "#d1d5db"}`, borderRadius: "7px", padding: "7px 10px", fontSize: "0.78rem", color: colored ? "#d97706" : "#374151", backgroundColor: colored ? "#fffbeb" : "#fff", display: "flex", justifyContent: "space-between" }}>
        <span>{value}</span>
        <span style={{ color: "#9ca3af" }}>▾</span>
      </div>
    </div>
  )
}

function MockTextarea({ label }: { label: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>{label}</label>
      <div style={{ border: "1px solid #d1d5db", borderRadius: "7px", padding: "7px 10px", fontSize: "0.78rem", color: "#9ca3af", backgroundColor: "#fff", height: "60px" }}>פרט את הבעיה בצורה מלאה...</div>
    </div>
  )
}
