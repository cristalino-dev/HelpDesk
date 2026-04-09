"use client"
import { Component, ReactNode } from "react"

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message,
        source: typeof window !== "undefined" ? window.location.pathname : "client",
        stack: (error.stack ?? "") + "\n\nComponent Stack:\n" + (info.componentStack ?? ""),
      }),
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f0f2f5", direction: "rtl" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "40px 48px", maxWidth: "480px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: "2.8rem", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ margin: "0 0 10px", color: "#1f2937", fontWeight: 800, fontSize: "1.2rem" }}>אירעה שגיאה בלתי צפויה</h2>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: "0.88rem", lineHeight: 1.6 }}>השגיאה נרשמה אוטומטית ותטופל בהקדם.<br />אנא רעננו את הדף.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.reload() }}
              style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)", color: "#fff", padding: "10px 28px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem" }}
            >
              רענן דף
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
