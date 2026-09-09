/**
 * components/TicketCreated.tsx — what a person sees the moment a ticket exists
 *
 * The ticket number is the only handle anyone has on a ticket. It is what the
 * support team asks for on the phone, what the subject line of every email
 * about it starts with, and what someone needs when they come back three days
 * later to ask what happened. Showing it and moving on is not enough — it has
 * to be takeable, so this offers both halves in one press: the number on its
 * own, and the full link to the ticket.
 *
 * TWO PIECES
 * ──────────
 *   TicketCreatedCard   the content — number, copy buttons, what to do next.
 *   TicketCreatedDialog the same card in a modal, for the dashboard, where the
 *                       form sits on a page that still has everything else on it.
 *
 * /open renders the card inline instead, because on that page the confirmation
 * IS the page: a modal over an empty background is a dialog about nothing.
 *
 * ON COPYING
 * ──────────
 * `navigator.clipboard` is unavailable over plain HTTP and can be refused even
 * over HTTPS, and a copy button that silently does nothing is worse than none.
 * Every press therefore reports what happened, and on failure the text is
 * selected instead so the reader can copy it by hand.
 */

"use client"
import { useEffect, useRef, useState } from "react"
import { T } from "@/lib/theme"

type Props = {
  ticketNumber: number
  subject?: string
  /** Rendered under the actions — "open another", "back to the dashboard". */
  children?: React.ReactNode
}

/** The canonical link to a ticket, as the emails build it. */
export function ticketLink(ticketNumber: number): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin
  return `${origin}/tickets/HDTC-${ticketNumber}`
}

type CopyState = "idle" | "copied" | "failed"

function useCopy(): [CopyState, (text: string, el?: HTMLElement | null) => void] {
  const [state, setState] = useState<CopyState>("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = (text: string, el?: HTMLElement | null) => {
    const settle = (s: CopyState) => {
      setState(s)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState("idle"), 2200)
    }
    const fallback = () => {
      // No clipboard: select the text so it can be copied by hand. Doing
      // nothing would leave the reader pressing a dead button.
      try {
        if (el) {
          const range = document.createRange()
          range.selectNodeContents(el)
          const sel = window.getSelection()
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      } catch { /* selection is a courtesy, not a requirement */ }
      settle("failed")
    }

    try {
      const p = navigator.clipboard?.writeText(text)
      if (p && typeof p.then === "function") p.then(() => settle("copied"), fallback)
      else if (navigator.clipboard) settle("copied")
      else fallback()
    } catch { fallback() }
  }

  return [state, copy]
}

const btn = (primary: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  padding: "9px 16px", borderRadius: 10, fontSize: "0.84rem", fontWeight: 700,
  cursor: "pointer", whiteSpace: "nowrap",
  border: primary ? "none" : `1px solid ${T.borderStrong}`,
  background: primary ? T.inverseBg : T.card,
  color: primary ? T.inverseText : T.text2,
})

function CopyButton({ label, text, primary, targetRef }: {
  label: string
  /** A getter, not a string: the link needs `window`, which is absent while
   *  rendering on the server. Resolving it on click keeps this component free
   *  of both the hydration mismatch and the effect that would paper over it. */
  text: () => string
  primary?: boolean
  targetRef?: React.RefObject<HTMLElement | null>
}) {
  const [state, copy] = useCopy()
  const said = state === "copied" ? "הועתק!" : state === "failed" ? "בחר והעתק" : label
  return (
    <button
      type="button"
      onClick={() => copy(text(), targetRef?.current)}
      aria-label={label}
      style={{
        ...btn(!!primary),
        ...(state === "copied" ? { background: T.greenBg, color: T.greenInk, border: `1px solid ${T.greenBorder}` } : {}),
      }}
    >
      {state === "copied"
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
      {said}
    </button>
  )
}

export function TicketCreatedCard({ ticketNumber, subject, children }: Props) {
  const code = `HDTC-${ticketNumber}`
  const codeRef = useRef<HTMLDivElement>(null)

  return (
    <div style={{ textAlign: "center", direction: "rtl" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.greenBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: "1.7rem" }}>✅</div>

      <h2 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 800, color: T.text }}>הפנייה נפתחה בהצלחה</h2>
      {subject && (
        <p style={{ margin: "0 0 14px", fontSize: "0.86rem", color: T.text2 }}>{subject}</p>
      )}

      {/* The number, big, selectable, and the thing the eye lands on. */}
      <div
        ref={codeRef}
        style={{
          display: "inline-block", background: T.greenBg, border: `1px solid ${T.greenBorder}`,
          borderRadius: 12, padding: "12px 26px", margin: "6px 0 12px",
          fontSize: "1.5rem", fontWeight: 800, color: T.greenInk,
          fontFamily: "'Courier New', Courier, monospace", letterSpacing: "0.04em",
          userSelect: "all",
        }}
      >{code}</div>

      {/* The instruction. This is the whole reason the dialog exists. */}
      <p style={{ margin: "0 auto 18px", maxWidth: 380, fontSize: "0.87rem", color: T.text2, lineHeight: 1.65 }}>
        <strong style={{ color: T.text }}>שמרו את מספר הפנייה.</strong> זהו המספר שתתבקשו למסור
        בכל פנייה לצוות התמיכה, והוא מופיע בכל מייל בנוגע לפנייה הזו.
      </p>

      <div style={{ display: "flex", gap: 9, justifyContent: "center", flexWrap: "wrap", marginBottom: children ? 18 : 0 }}>
        <CopyButton label="העתק מספר" text={() => code} primary targetRef={codeRef} />
        <CopyButton label="העתק קישור" text={() => ticketLink(ticketNumber)} />
      </div>

      {children}
    </div>
  )
}

/** The card in a modal, for pages that have something behind it. */
export function TicketCreatedDialog({
  ticketNumber, subject, onClose, children,
}: Props & { onClose: () => void }) {
  // Escape closes it, and the body does not scroll behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: T.overlay,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="הפנייה נפתחה"
        onClick={e => e.stopPropagation()}
        style={{
          background: T.card, borderRadius: 18, border: `1px solid ${T.border}`,
          boxShadow: `0 24px 60px ${T.shadow4}`, padding: "30px 26px 26px",
          width: "100%", maxWidth: 460, position: "relative",
        }}
      >
        <button
          onClick={onClose} aria-label="סגור"
          style={{ position: "absolute", top: 12, left: 14, background: "none", border: "none", fontSize: "1.1rem", color: T.muted, cursor: "pointer", lineHeight: 1, padding: 4 }}
        >✕</button>

        <TicketCreatedCard ticketNumber={ticketNumber} subject={subject}>
          {children}
        </TicketCreatedCard>
      </div>
    </div>
  )
}
