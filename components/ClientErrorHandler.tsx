"use client"
import { useEffect } from "react"

function postLog(message: string, source: string, stack?: string) {
  fetch("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: "error", message, source, stack }),
  }).catch(() => {})
}

export default function ClientErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      postLog(event.message, event.filename || window.location.pathname, event.error?.stack)
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason)
      const stack = event.reason instanceof Error ? event.reason.stack : undefined
      postLog(msg, window.location.pathname, stack)
    }
    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)
    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
    }
  }, [])

  return null
}
