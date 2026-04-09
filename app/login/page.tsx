"use client"
import { signIn } from "next-auth/react"
import Image from "next/image"

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1e3a8a 0%, #312e81 50%, #1e40af 100%)",
      padding: "24px",
    }}>
      {/* Decorative circles */}
      <div style={{ position: "fixed", top: "-80px", right: "-80px", width: "300px", height: "300px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-120px", left: "-60px", width: "400px", height: "400px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

      <div style={{
        backgroundColor: "#ffffff",
        borderRadius: "24px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "28px",
        width: "100%",
        maxWidth: "400px",
        position: "relative",
      }}>
        {/* Logo */}
        <Image src="/logo.jpeg" alt="Cristalino Group" width={120} height={120} style={{ objectFit: "contain" }} />

        <div style={{ textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>מערכת הלפדסק</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.9rem", lineHeight: 1.5 }}>
            התחברו עם חשבון Google שלכם<br />לפתיחת פנייה או מעקב אחר הפניות
          </p>
        </div>

        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            width: "100%",
            padding: "13px 24px",
            borderRadius: "12px",
            border: "1.5px solid #e5e7eb",
            backgroundColor: "#fff",
            color: "#374151",
            fontWeight: 600,
            fontSize: "0.95rem",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            transition: "box-shadow 0.15s",
          }}
          onMouseOver={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"; e.currentTarget.style.borderColor = "#d1d5db" }}
          onMouseOut={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "#e5e7eb" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          התחברות עם Google
        </button>

        <p style={{ margin: 0, fontSize: "0.75rem", color: "#9ca3af", textAlign: "center" }}>
          כניסה מורשית לעובדי קריסטלינו בלבד
        </p>
      </div>
    </div>
  )
}
