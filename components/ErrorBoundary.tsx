/**
 * components/ErrorBoundary.tsx — React Error Boundary
 *
 * PURPOSE:
 * ─────────
 * React applications can crash during rendering when an unexpected JavaScript
 * error occurs inside a component tree. Without an error boundary, the entire
 * page goes blank (white screen of death), giving the user no feedback and the
 * developer no information.
 *
 * This component wraps the entire application (mounted in app/providers.tsx)
 * and does two things when a render error occurs:
 *   1. Reports the error to the database via POST /api/logs so the admin
 *      can see it in the logs tab.
 *   2. Renders a friendly Hebrew error page with a "רענן דף" button instead
 *      of the blank white screen.
 *
 * WHY A CLASS COMPONENT?
 * ───────────────────────
 * React error boundaries MUST be class components. As of React 19 there is
 * no hook-based equivalent that can catch render errors. The static lifecycle
 * method `getDerivedStateFromError` and the instance method `componentDidCatch`
 * are only available on class components.
 *
 * RELATIONSHIP TO OTHER ERROR HANDLERS:
 * ───────────────────────────────────────
 *   ErrorBoundary        — catches React render errors (this file)
 *   ClientErrorHandler   — catches unhandled JS errors and promise rejections
 *   logError()           — catches server-side errors in API routes
 *   All three ultimately write to the same Log table.
 *
 * PLACEMENT:
 * ───────────
 * Wraps the entire <children> tree inside Providers (app/providers.tsx),
 * below SessionProvider so that session context is available within.
 */

"use client"
import { Component, ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  /** True when a render error has been caught. Triggers fallback UI. */
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  /**
   * getDerivedStateFromError — called by React when a descendant throws.
   *
   * This static method runs synchronously during the render phase (before the
   * component re-renders). It must return the new state. We use it solely to
   * flip the `hasError` flag so the fallback UI is shown.
   *
   * Note: This runs BEFORE componentDidCatch. It must be pure (no side effects).
   */
  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  /**
   * componentDidCatch — called after the fallback UI has been rendered.
   *
   * This is where we perform side effects: posting the error details to the
   * logging API. We have access to both the error object and React's component
   * stack trace, giving developers a precise location for the crash.
   *
   * @param error - The JavaScript Error that was thrown.
   * @param info  - React error info, containing `componentStack` — a string
   *               tracing which components were rendering when the crash occurred.
   */
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Post to /api/logs (the client-facing endpoint, not the direct DB helper)
    // because we're in a client component and don't have access to Prisma.
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: error.message,
        source: typeof window !== "undefined" ? window.location.pathname : "client",
        // Combine JS stack trace with React's component tree trace for maximum context
        stack: (error.stack ?? "") + "\n\nComponent Stack:\n" + (info.componentStack ?? ""),
      }),
    }).catch(() => {
      // If logging itself fails, there's nothing more we can do.
      // The fallback UI is already shown to the user.
    })
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI: a centered Hebrew error card with a reload button.
      // Clicking the button resets state (allowing React to retry the render)
      // and also hard-reloads the page to clear any corrupted state.
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f0f2f5",
          direction: "rtl",
        }}>
          <div style={{
            backgroundColor: "#fff",
            borderRadius: "16px",
            padding: "40px 48px",
            maxWidth: "480px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            border: "1px solid #f3f4f6",
          }}>
            <div style={{ fontSize: "2.8rem", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ margin: "0 0 10px", color: "#1f2937", fontWeight: 800, fontSize: "1.2rem" }}>
              אירעה שגיאה בלתי צפויה
            </h2>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: "0.88rem", lineHeight: 1.6 }}>
              השגיאה נרשמה אוטומטית ותטופל בהקדם.<br />אנא רעננו את הדף.
            </p>
            <button
              onClick={() => {
                // Reset the error state so React re-attempts the render tree,
                // then do a hard reload in case the issue was transient state.
                this.setState({ hasError: false })
                window.location.reload()
              }}
              style={{
                background: "linear-gradient(135deg, #2563eb, #4f46e5)",
                color: "#fff",
                padding: "10px 28px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.9rem",
              }}
            >
              רענן דף
            </button>
          </div>
        </div>
      )
    }

    // Normal render path: just pass through children unchanged
    return this.props.children
  }
}
