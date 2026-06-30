/**
 * components/ClientErrorHandler.tsx — Global Client-Side Error Logger
 *
 * PURPOSE:
 * ─────────
 * Captures JavaScript errors that occur OUTSIDE of React's render cycle —
 * specifically synchronous script errors and unhandled Promise rejections.
 * These are errors that `ErrorBoundary` (which only catches render errors)
 * would not see.
 *
 * EVENTS CAPTURED:
 * ─────────────────
 *   window "error" event        — Fires when any synchronous JavaScript exception
 *                                 escapes the call stack without being caught. For
 *                                 example: a TypeError in an event handler, a
 *                                 ReferenceError from accessing an undefined variable,
 *                                 or any unguarded throw.
 *
 *   window "unhandledrejection" — Fires when a Promise is rejected and no .catch()
 *                                 handler or try/await/catch was provided. Common in
 *                                 async event handlers and fire-and-forget fetch calls.
 *
 * These two events together with ErrorBoundary give comprehensive coverage of all
 * client-side error paths:
 *
 *   Render errors          → ErrorBoundary.componentDidCatch
 *   Script / handler errors → ClientErrorHandler "error" listener
 *   Unhandled promises      → ClientErrorHandler "unhandledrejection" listener
 *
 * ALL write to POST /api/logs → Log database table → visible in admin logs tab.
 *
 * IMPLEMENTATION:
 * ────────────────
 * This component renders nothing (returns null). It only attaches event listeners
 * during mount and removes them during unmount. It is mounted once at the root
 * in app/providers.tsx, guaranteeing global coverage across all pages.
 *
 * Using `useEffect` with an empty dependency array `[]` means:
 *   - The effect runs once after the initial render (listeners attached)
 *   - The cleanup function runs when the component unmounts (listeners removed)
 *   - This prevents duplicate listeners if React ever mounts this twice (Strict Mode)
 */

"use client"
import { useEffect } from "react"

/**
 * Sends a single error event to POST /api/logs.
 * Failures are silently swallowed — error logging must never cause
 * a secondary failure or infinite loop.
 *
 * @param message - Error message string
 * @param source  - Origin of the error (file URL or page path)
 * @param stack   - Optional stack trace string
 */
function postLog(message: string, source: string, stack?: string) {
  fetch("/api/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: "error", message, source, stack }),
  }).catch(() => {})
}

/**
 * Detects "stale chunk" errors — when a browser tab left open across a deploy
 * requests a JS chunk whose hashed filename no longer exists on the server.
 * These are not bugs: the client is simply running an outdated page.
 */
function isChunkLoadError(message: string): boolean {
  return /Loading chunk|Failed to load chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module/i.test(message)
}

/**
 * Recovers from a stale-chunk error by reloading once to pull the fresh build.
 * A sessionStorage guard prevents a reload loop if the reload itself fails
 * (e.g. the server is genuinely unreachable). Returns true if it handled the
 * error (so the caller skips logging it as a bug).
 */
function handleChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem("chunkReloadAt") || 0)
    // Only auto-reload if we haven't already done so in the last 20 seconds.
    if (Date.now() - last > 20_000) {
      sessionStorage.setItem("chunkReloadAt", String(Date.now()))
      window.location.reload()
    }
  } catch {
    /* sessionStorage unavailable (private mode) — best effort, swallow */
  }
  return true
}

/**
 * ClientErrorHandler — mounts global error listeners, renders nothing.
 *
 * Placed inside Providers (app/providers.tsx) so it is present on every
 * page without requiring each page to import it individually.
 */
export default function ClientErrorHandler() {
  useEffect(() => {
    /**
     * Handles synchronous JavaScript errors.
     *
     * @param event.message  - Human-readable error message
     * @param event.filename - Script URL where the error occurred
     * @param event.error    - The actual Error object (may have a .stack property)
     */
    const handleError = (event: ErrorEvent) => {
      // Stale chunk after a deploy → auto-reload to the fresh build, don't log as a bug
      if (isChunkLoadError(event.message)) { handleChunkError(); return }
      postLog(
        event.message,
        event.filename || window.location.pathname, // filename for script errors, pathname for generic
        event.error?.stack,
      )
    }

    /**
     * Handles unhandled Promise rejections.
     *
     * event.reason can be anything (Error, string, plain object).
     * We normalize it: extract .message if it's an Error, otherwise stringify.
     */
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason)
      // Stale chunk after a deploy → auto-reload to the fresh build, don't log as a bug
      if (isChunkLoadError(msg)) { handleChunkError(); return }
      const stack = event.reason instanceof Error
        ? event.reason.stack
        : undefined
      postLog(msg, window.location.pathname, stack)
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleUnhandledRejection)

    // Cleanup: remove listeners to prevent duplicates (important for React Strict Mode
    // which mounts components twice in development to detect side effects)
    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
    }
  }, []) // Empty array → run once on mount, clean up on unmount

  // This component has no visual output
  return null
}
