/**
 * components/ErrorToast.tsx — Transient failure message
 *
 * For the case where an action was refused and the page has nowhere sensible to
 * put the reason. The ticket lists are the ones that need it: their status
 * dropdown fires a PATCH straight into the queue, so a refused close (an
 * offboarding checklist that is not finished) would otherwise just be a
 * dropdown that snaps back with no explanation.
 *
 * Auto-dismisses, because a message about an action that had no effect should
 * not need cleaning up. Rendered fixed at the bottom so it never displaces the
 * list underneath it.
 *
 * PROPS:
 *   message   {string | null}  The message; null renders nothing.
 *   onClose   {() => void}     Clears the message (dismiss button and timer).
 *   timeout   {number}         Auto-dismiss delay in ms. Default 7000.
 */

"use client"
import { useEffect } from "react"

export default function ErrorToast({
  message,
  onClose,
  timeout = 7000,
}: {
  message: string | null
  onClose: () => void
  timeout?: number
}) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onClose, timeout)
    return () => clearTimeout(timer)
  }, [message, timeout, onClose])

  if (!message) return null

  return (
    <div
      role="alert"
      style={{
        position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
        zIndex: 120, maxWidth: 520, width: "calc(100% - 32px)",
        display: "flex", alignItems: "flex-start", gap: 10,
        background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
        padding: "12px 16px", boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
        fontSize: "0.85rem", color: "#991b1b", lineHeight: 1.6,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      <button
        onClick={onClose}
        aria-label="סגור הודעה"
        style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: "1rem", lineHeight: 1, padding: 0, flexShrink: 0 }}
      >
        ✕
      </button>
    </div>
  )
}
