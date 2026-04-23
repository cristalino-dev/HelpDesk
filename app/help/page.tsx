import Image from "next/image"
import Link from "next/link"
import FooterCopyright from "@/components/FooterCopyright"
import VERSION from "@/lib/version"

const badge = (bg: string, color: string, text: string) => (
  <span style={{ backgroundColor: bg, color, padding: "3px 12px", borderRadius: "999px", fontSize: "0.78rem", fontWeight: 700, display: "inline-block" }}>{text}</span>
)

export default function HelpPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f0f2f5", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif", direction: "rtl" }}>

      {/* Header */}
      <header style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px", boxShadow: "0 4px 16px rgba(37,99,235,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Image src="/logo.jpeg" alt="Cristalino Group" width={40} height={40} loading="eager" style={{ objectFit: "contain", borderRadius: "6px" }} />
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#fff" }}>{`מערכת helpdesk v${VERSION}`}</span>
          <span style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "2px 10px", borderRadius: "20px" }}>מדריך למשתמש</span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link href="/contact" style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", textDecoration: "none", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>צרו קשר</Link>
          <Link href="/dashboard" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", textDecoration: "none" }}>חזרה ללוח הבקרה</Link>
        </div>
      </header>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: "40px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <h1 style={{ margin: "0 0 10px", fontSize: "1.7rem", fontWeight: 800, color: "#1f2937" }}>{`מדריך שימוש במערכת helpdesk ${VERSION}`}</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.95rem" }}>כל מה שצריך לדעת כדי לפתוח פנייה, לעקוב אחריה ולדרג את השירות שקיבלתם</p>
        </div>

        {/* TOC */}
        <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "24px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1px solid #f3f4f6" }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, color: "#374151", fontSize: "0.9rem" }}>תוכן עניינים</p>
          <ol style={{ margin: 0, padding: "0 20px", display: "flex", flexDirection: "column", gap: "8px", color: "#2563eb", fontSize: "0.9rem" }}>
            <li><a href="#login"           style={{ color: "#2563eb" }}>כניסה למערכת</a></li>
            <li><a href="#dashboard"       style={{ color: "#2563eb" }}>לוח הבקרה — הפניות שלי</a></li>
            <li><a href="#new-ticket"      style={{ color: "#2563eb" }}>פתיחת פנייה חדשה</a></li>
            <li><a href="#notes-attachments" style={{ color: "#2563eb" }}>הערות ותמונות מצורפות</a></li>
            <li><a href="#messaging"       style={{ color: "#2563eb" }}>שיחה עם צוות התמיכה</a></li>
            <li><a href="#statuses"        style={{ color: "#2563eb" }}>מצבי פנייה</a></li>
            <li><a href="#urgency"         style={{ color: "#2563eb" }}>רמות דחיפות</a></li>
            <li><a href="#review"          style={{ color: "#2563eb" }}>דירוג השירות לאחר סגירה</a></li>
            <li><a href="#contact"         style={{ color: "#2563eb" }}>צרו קשר עם תמיכת המערכת</a></li>
          </ol>
        </div>

        {/* ── SECTION 1: LOGIN ── */}
        <section id="login" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="1" title="כניסה למערכת" />

          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #312e81 50%, #1e40af 100%)", padding: "40px 24px", display: "flex", justifyContent: "center" }}>
              <div style={{ backgroundColor: "#fff", borderRadius: "20px", padding: "36px 32px", width: "300px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
                <Image src="/logo.jpeg" alt="Cristalino Group" width={90} height={90} loading="eager" style={{ objectFit: "contain" }} />
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

          <Card>
            <Steps steps={[
              { n: 1, text: <span>גשו לכתובת <Strong>helpdesk.cristalino.co.il</Strong> בדפדפן שלכם</span> },
              { n: 2, text: <span>לחצו על הכפתור <Strong>התחברות עם Google</Strong></span> },
              { n: 3, text: <span>בחרו את חשבון ה-Google של קריסטלינו שלכם (<Strong>@cristalino.co.il</Strong>)</span> },
              { n: 4, text: <span>המערכת תעביר אתכם אוטומטית ללוח הבקרה</span> },
            ]} />
            <Note text="יש להתחבר עם חשבון ה-Google הארגוני בלבד. חשבונות אישיים לא יתקבלו." />
          </Card>
        </section>

        {/* ── SECTION 2: DASHBOARD ── */}
        <section id="dashboard" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="2" title='לוח הבקרה — "הפניות שלי"' />

          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Image src="/logo.jpeg" alt="" width={32} height={32} style={{ objectFit: "contain", borderRadius: "4px" }} />
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem" }}>מערכת helpdesk</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {["עזרה", "צרו קשר"].map(t => (
                  <span key={t} style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.85)", padding: "4px 8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.1)", fontWeight: 500 }}>{t}</span>
                ))}
              </div>
            </div>
            <div style={{ backgroundColor: "#f0f2f5", padding: "16px" }}>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1f2937" }}>הפניות שלי</span>
                <div style={{ backgroundColor: "#2563eb", color: "#fff", fontSize: "0.78rem", fontWeight: 600, padding: "6px 14px", borderRadius: "8px" }}>+ פנייה חדשה</div>
              </div>
              {/* Active ticket */}
              <div style={{ backgroundColor: "#fff", borderRadius: "10px", borderRight: "4px solid #f97316", padding: "10px 14px 10px 12px", marginBottom: "6px", display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "10px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#111827" }}>המדפסת לא מדפיסה</div>
                  <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginTop: "2px" }}>PC-ALON-01 · מדפסת · מחשב אישי</div>
                </div>
                <span style={{ backgroundColor: "#ffedd5", color: "#9a3412", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>גבוה</span>
                <span style={{ backgroundColor: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>בטיפול</span>
                <span style={{ fontSize: "0.6rem", color: "#9ca3af", opacity: 0.5 }}>‹</span>
              </div>
              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px", padding: "0 2px" }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#9ca3af", whiteSpace: "nowrap" }}>פניות סגורות (1)</span>
                <div style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
              </div>
              {/* Closed ticket — grayed out */}
              <div style={{ backgroundColor: "#f9fafb", borderRadius: "10px", borderRight: "4px solid #d1d5db", padding: "10px 14px 10px 12px", display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "10px", opacity: 0.52 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#6b7280" }}>שגיאה בהתחברות לרשת</div>
                  <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginTop: "2px" }}>PC-SARA-02 · רשת · מחשב אישי</div>
                </div>
                <span style={{ backgroundColor: "#f3f4f6", color: "#9ca3af", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>נמוך</span>
                <span style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700 }}>סגור</span>
                <span style={{ fontSize: "0.6rem", color: "#9ca3af", opacity: 0.5 }}>‹</span>
              </div>
            </div>
          </div>

          <Card>
            <p style={{ margin: "0 0 16px", color: "#374151", fontSize: "0.9rem", lineHeight: 1.7 }}>
              לאחר הכניסה, תגיעו ללוח הבקרה שם תוכלו לראות את כל הפניות שלכם ולפתוח פנייה חדשה.
            </p>
            <FieldList items={[
              { label: "כרטיסי סינון",     desc: "שלושה כרטיסים בראש הדף (פתוחות / בטיפול / סגורות) — לחצו על אחד מהם לסינון הרשימה; לחיצה שנייה מבטלת את הסינון" },
              { label: "חיפוש",            desc: 'תיבת חיפוש מתחת לכותרת — מחפשת בכל השדות: נושא, תיאור, סטטוס, דחיפות, קטגוריה, פלטפורמה, שם מחשב, טלפון, מספר פנייה ותאריך. ניתן לשלב עם סינון כרטיס' },
              { label: "פניות פעילות",     desc: "פניות פתוחות ובטיפול מופיעות בחלק העליון בצבעים מלאים" },
              { label: "פניות סגורות",     desc: 'פניות שטופלו מוצגות בחלק התחתון בצורה מעומעמת תחת הכותרת "פניות סגורות". לחצו עליהן לצפייה בפרטים' },
              { label: "סגירת פנייה",      desc: 'העבירו את העכבר מעל פנייה פעילה — כפתור "✓ סגור" יופיע בצד שמאל של הכרטיס' },
              { label: "גבול צבעוני",      desc: "הפס הצבעוני בצד ימין של כל פנייה מציין את רמת הדחיפות" },
              { label: "כפתור פנייה חדשה", desc: 'לחצו על "+ פנייה חדשה" כדי לפתוח טופס הגשה' },
            ]} />
          </Card>
        </section>

        {/* ── SECTION 3: NEW TICKET ── */}
        <section id="new-ticket" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="3" title="פתיחת פנייה חדשה" />

          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1f2937" }}>פתיחת פנייה חדשה</span>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <MockField label="נושא הפנייה *" placeholder="תאר בקצרה את הבעיה" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <MockField label="שם מחשב *" placeholder="לדוגמה: PC-ALON-01" hint="?" />
                <MockField label="טלפון *" placeholder="050-0000000" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <MockSelect label="פלטפורמה" value="מחשב אישי" />
                <MockSelect label="קטגוריה" value="אחר" />
                <MockSelect label="דחיפות" value="בינוני" colored />
              </div>
              <MockTextarea label="תיאור מפורט *" />
              <div style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", fontWeight: 700, padding: "11px 0", borderRadius: "10px", textAlign: "center", fontSize: "0.88rem" }}>שלח פנייה</div>
            </div>
          </div>

          <Card>
            <p style={{ margin: "0 0 18px", fontWeight: 700, color: "#1f2937", fontSize: "0.95rem" }}>מה למלא בכל שדה</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <FieldGuideItem label="נושא הפנייה" required desc="תיאור קצר ותמציתי של הבעיה. לדוגמה: המדפסת לא מדפיסה, אין חיבור לאינטרנט, שגיאה בפתיחת Outlook." />
              <FieldGuideItem label="שם מחשב" required desc={<>שם הזיהוי של המחשב שלכם ברשת. לחצו על סמל <Strong>?</Strong> שליד השדה לקבלת הסבר כיצד למצוא אותו (Start → cmd → hostname).</>} />
              <FieldGuideItem label="טלפון" required desc="מספר הטלפון שבו ניתן לחזור אליכם." />
              <FieldGuideItem label="קטגוריה" desc={<>בחרו את הקטגוריה המתאימה לבעיה: <Strong>חומרה</Strong>, <Strong>תוכנה</Strong>, <Strong>רשת</Strong>, <Strong>מדפסת</Strong>, <Strong>אחר</Strong>.</>} />
              <FieldGuideItem label="פלטפורמה" desc={<>בחרו את הפלטפורמה הרלוונטית: <Strong>comax</Strong>, <Strong>comax sales tracker</Strong>, <Strong>אנדרואיד</Strong>, <Strong>אייפד</Strong>, או <Strong>מחשב אישי</Strong>.</>} />
              <FieldGuideItem label="דחיפות" desc={<>בחרו את רמת הדחיפות בהתאם להשפעה על עבודתכם. ראו סעיף 7 למטה להסבר מלא.</>} />
              <FieldGuideItem label="תיאור מפורט" required desc="פרטו את הבעיה בצורה מלאה: מתי התחילה, מה קרה לפני שהתחילה, האם הופיעה הודעת שגיאה." />
            </div>
            <Note text="שדות המסומנים ב-* הם חובה. לא ניתן לשלוח את הטופס ללא מילוי שדות אלה." />
          </Card>

          <Card>
            <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1f2937", fontSize: "0.95rem" }}>מה קורה אחרי שמגישים פנייה?</p>
            <Steps steps={[
              { n: 1, text: <span>הפנייה נשמרת במערכת ומופיעה מיד תחת &quot;הפניות שלי&quot;</span> },
              { n: 2, text: <span>צוות התמיכה רואה את הפנייה בתור הניהול, ממוינת לפי דחיפות</span> },
              { n: 3, text: <span>כשהטכנאי מתחיל לטפל, המצב יתעדכן ל-<Strong>בטיפול</Strong> ותקבלו מייל</span> },
              { n: 4, text: <span>בסיום הטיפול המצב יתעדכן ל-<Strong>סגור</Strong> ותקבלו מייל עם קישור לדירוג השירות</span> },
            ]} />
          </Card>
        </section>

        {/* ── SECTION 4: NOTES & ATTACHMENTS ── */}
        <section id="notes-attachments" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="4" title="הערות ותמונות מצורפות" />
          <Card>
            <p style={{ margin: "0 0 16px", color: "#374151", fontSize: "0.9rem", lineHeight: 1.7 }}>
              מעבר לפרטי הפנייה הבסיסיים, המערכת מאפשרת להוסיף הערות לטכנאים ולצרף תמונות של תקלות.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <span style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>📎 העלאת תמונות</span>
                <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem", lineHeight: 1.6 }}>
                  גררו תמונות לאזור המסומן בתחתית הטופס, לחצו לבחירת קבצים, או <Strong>הדביקו (Ctrl+V)</Strong> ישירות מה-Clipboard. ניתן לצרף מספר תמונות לאותה פנייה.
                </p>
              </div>
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <div>
                <span style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>📝 הערות ותיוג</span>
                <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem", lineHeight: 1.6 }}>
                  בתוך מסך הפנייה ניתן לכתוב הערות. טכנאים יכולים לתייג אנשי צוות אחרים באמצעות <Strong>@</Strong> (לדוגמה: @alon) ולצרף תמונות ישירות להערה.
                </p>
              </div>
            </div>
            <Note text="המערכת תומכת בתמונות בנפח של עד 3MB. מומלץ לצרף צילומי מסך של הודעות שגיאה." />
          </Card>
        </section>

        {/* ── SECTION 5: MESSAGING ── */}
        <section id="messaging" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="5" title="שיחה עם צוות התמיכה" />
          <Card>
            <p style={{ fontSize: "0.95rem", color: "#6b7280", lineHeight: 1.7, marginBottom: "20px" }}>
              ניתן לנהל שיחה ישירה עם צוות התמיכה בתוך כל פנייה.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <span style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>💬 צ׳אט אינטראקטיבי</span>
                <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem", lineHeight: 1.6 }}>
                  בתוך מסך הפנייה תמצאו את החלק &quot;שיחה עם הצוות&quot;. כתבו הודעות ישירות לטכנאי המטפל.
                </p>
              </div>
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <div>
                <span style={{ fontWeight: 700, color: "#1f2937", fontSize: "0.9rem", display: "block", marginBottom: "6px" }}>📧 התראות מייל</span>
                <p style={{ margin: 0, color: "#4b5563", fontSize: "0.85rem", lineHeight: 1.6 }}>
                  כאשר איש צוות מגיב לפנייתכם, תקבלו מייל עדכון אוטומטי עם תוכן ההודעה וקישור ישיר למענה.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* ── SECTION 6: STATUSES ── */}
        <section id="statuses" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="6" title="מצבי פנייה" />
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <StatusRow badge={badge("#dbeafe", "#1e40af", "פתוח")}   title="פתוח"   desc="הפנייה התקבלה ומחכה לטיפול. הפנייה נמצאת בתור הניהול." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <StatusRow badge={badge("#fef3c7", "#92400e", "בטיפול")} title="בטיפול" desc="טכנאי החל לעבוד על הפנייה. תקבלו מייל עדכון. ייתכן שיצרו איתכם קשר בקרוב." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <StatusRow badge={badge("#dcfce7", "#166534", "סגור")}   title="סגור"   desc="הבעיה טופלה וסגורה. תקבלו מייל עם קישור לדירוג השירות." />
            </div>
            <Note text='פנייה סגורה ניתנת לפתיחה מחדש תוך 4 שבועות מרגע הסגירה — לחצו על כפתור "↩ פתח מחדש" בטבלת הפניות שלכם. לאחר 4 שבועות יש לפתוח פנייה חדשה.' />
          </Card>
        </section>

        {/* ── SECTION 7: URGENCY ── */}
        <section id="urgency" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="7" title="רמות דחיפות — מתי לבחור מה?" />
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <UrgencyRow badge={badge("#fee2e2", "#991b1b", "דחוף")}   title="דחוף"   desc="המחשב לא עולה כלל, אין גישה למערכות קריטיות, הבעיה מונעת עבודה לחלוטין." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <UrgencyRow badge={badge("#ffedd5", "#9a3412", "גבוה")}   title="גבוה"   desc="קושי משמעותי בעבודה השוטפת, בעיה שפוגעת בפרודוקטיביות אך ניתן לעבוד בחלקה." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <UrgencyRow badge={badge("#fef3c7", "#92400e", "בינוני")} title="בינוני" desc="בעיה שיש לטפל בה אך אינה מונעת עבודה. ברירת המחדל לרוב הפניות." />
              <div style={{ height: "1px", backgroundColor: "#f3f4f6" }} />
              <UrgencyRow badge={badge("#dcfce7", "#166534", "נמוך")}   title="נמוך"   desc="בקשה שאינה דחופה: שדרוג, התקנת תוכנה, שאלה כללית." />
            </div>
            <Note text="אנא בחרו את רמת הדחיפות בצורה מדויקת. דחיפות גבוהה מדי עלולה לדחות פניות אחרות שצריכות טיפול מיידי." />
          </Card>
        </section>

        {/* ── SECTION 8: REVIEW ── */}
        <section id="review" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="8" title="דירוג השירות לאחר סגירה" />

          {/* Review page mockup */}
          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb" }}>
            <div style={{ background: "linear-gradient(135deg, #f0f9ff, #e0f2fe, #f0fdf4)", padding: "32px 24px", display: "flex", justifyContent: "center" }}>
              <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "28px 28px 24px", width: "340px", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,0.10)", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "inline-block", backgroundColor: "#eff6ff", color: "#1e40af", borderRadius: 6, padding: "2px 10px", fontSize: "0.7rem", fontWeight: 700, marginBottom: 12 }}>HDTC-29</div>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1f2937", marginBottom: 4 }}>איך היה השירות?</div>
                <div style={{ fontSize: "0.82rem", color: "#374151", marginBottom: 4 }}>מוראל לוי סגירת יוזר קומקס</div>
                <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginBottom: 20 }}>שניה מזמנכם תעזור לנו להשתפר</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 8 }}>
                  {[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: n <= 4 ? "1.8rem" : "1.4rem", filter: n <= 4 ? "none" : "grayscale(1) opacity(0.3)" }}>⭐</span>)}
                </div>
                <div style={{ height: 18, fontSize: "0.78rem", fontWeight: 600, color: "#16a34a", marginBottom: 12 }}>טוב</div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", fontSize: "0.75rem", color: "#9ca3af", textAlign: "right", marginBottom: 12 }}>הוסיפו הערה (לא חובה)...</div>
                <div style={{ background: "#16a34a", color: "#fff", padding: "10px", borderRadius: 8, fontWeight: 700, fontSize: "0.82rem" }}>שלחו ביקורת</div>
              </div>
            </div>
          </div>

          <Card>
            <p style={{ margin: "0 0 16px", color: "#374151", fontSize: "0.9rem", lineHeight: 1.7 }}>
              כאשר פנייה נסגרת, תקבלו מייל אוטומטי עם קישור לדירוג השירות. הדירוג עוזר לצוות התמיכה להשתפר.
            </p>
            <FieldList items={[
              { label: "מייל סגירה",    desc: 'תקבלו מייל עם כפתור ירוק "דרגו את השירות ←" שמוביל לדף הדירוג' },
              { label: "דף הדירוג",    desc: 'בחרו 1–5 כוכבים ובאופן אופציונלי הוסיפו הערה חופשית. לא נדרשת כניסה לחשבון' },
              { label: "עריכת דירוג",  desc: "אפשר לחזור לאותו קישור ולשנות את הדירוג בכל עת — הדירוג הקודם יוחלף" },
              { label: "פניות סגורות", desc: "ניתן לגשת לכל פנייה סגורה דרך לוח הבקרה ולצפות בפרטי הטיפול" },
            ]} />
            <Note text="הקישור לדירוג נשלח רק למגיש הפנייה ותקף כל עוד הפנייה סגורה. אין צורך בהתחברות לחשבון." />
          </Card>
        </section>

        {/* ── SECTION 9: CONTACT ── */}
        <section id="contact" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <SectionTitle number="9" title="צרו קשר עם תמיכת המערכת" />

          <div style={{ borderRadius: "14px", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #e5e7eb", backgroundColor: "#fff" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: "linear-gradient(135deg, #2563eb, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1f2937" }}>צרו קשר עם תמיכת HelpDesk</span>
            </div>
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px 14px", minHeight: "80px", fontSize: "0.8rem", color: "#9ca3af" }}>תארו את הבעיה שנתקלתם בה...</div>
              <div style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", fontWeight: 700, padding: "10px 0", borderRadius: "10px", textAlign: "center", fontSize: "0.82rem" }}>שלח הודעה</div>
            </div>
          </div>

          <Card>
            <p style={{ margin: "0 0 14px", color: "#374151", fontSize: "0.9rem", lineHeight: 1.7 }}>
              דף זה מיועד לדיווח על בעיות <Strong>במערכת ה-HelpDesk עצמה</Strong> — לא לבקשות תמיכה רגילות.
            </p>
            <FieldList items={[
              { label: 'כפתור "צרו קשר"', desc: "נמצא בכל דף במערכת — בתפריט הראשי בראש הדף" },
              { label: "נושא קבוע",        desc: 'ההודעה נשלחת תמיד עם הנושא "HelpDesk Issues" לצוות הפיתוח' },
              { label: "שולח אוטומטי",     desc: "שמכם ואימייל Google שלכם נשלחים אוטומטית — אין צורך למלא" },
            ]} />
            <Note text="לאחר שליחת ההודעה תופיע הודעת אישור על המסך. הצוות יחזור אליכם בהקדם." />
          </Card>
        </section>

      </main>

      <FooterCopyright />
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
        {hint && <div style={{ width: "14px", height: "14px", borderRadius: "50%", backgroundColor: "#dbeafe", color: "#2563eb", fontSize: "0.68rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>?</div>}
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
