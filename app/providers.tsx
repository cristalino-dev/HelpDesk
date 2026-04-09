/**
 * app/providers.tsx — Root Client Provider Tree
 *
 * PURPOSE:
 * ─────────
 * This component is the client-side root of the application. It wraps every
 * page in the providers and global components that need to be present
 * application-wide. It is imported by the Server Component `app/layout.tsx`.
 *
 * PROVIDER ORDER (outermost → innermost):
 * ─────────────────────────────────────────
 *
 *   1. SessionProvider (from next-auth/react)
 *      ──────────────────────────────────────
 *      Makes the NextAuth session available to all client components via the
 *      `useSession()` hook. Without this, `useSession()` would throw
 *      "useSession must be wrapped in a <SessionProvider>".
 *      The session JWT is fetched once and cached in React context.
 *
 *   2. ErrorBoundary (components/ErrorBoundary.tsx)
 *      ──────────────────────────────────────────────
 *      Catches any React render errors that bubble up from any page or
 *      component. Placed INSIDE SessionProvider so that error boundary
 *      renders still have access to session context if needed.
 *      Displays a friendly Hebrew fallback UI instead of a white screen.
 *      Posts the error to the Log table via /api/logs.
 *
 *   3. ClientErrorHandler (components/ClientErrorHandler.tsx)
 *      ────────────────────────────────────────────────────────
 *      A renderless component (returns null) that attaches window-level
 *      error listeners for errors OUTSIDE React's render cycle.
 *      See ClientErrorHandler.tsx for full documentation.
 *
 *   4. {children}
 *      ───────────
 *      The actual page content rendered by Next.js routing.
 *
 * WHY "use client"?
 * ──────────────────
 * SessionProvider uses React context under the hood, which requires a client
 * component boundary. ErrorBoundary is a class component (must be client).
 * The "use client" directive makes this entire subtree opt into client-side
 * rendering while still allowing individual child Server Components (Next.js
 * automatically handles the boundary).
 */

"use client"
import { SessionProvider } from "next-auth/react"
import ErrorBoundary from "@/components/ErrorBoundary"
import ClientErrorHandler from "@/components/ClientErrorHandler"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // SessionProvider: makes useSession() available everywhere below
    <SessionProvider>
      {/* ErrorBoundary: catches render errors, shows fallback UI, logs to DB */}
      <ErrorBoundary>
        {/* ClientErrorHandler: window.onerror + unhandledrejection → /api/logs */}
        <ClientErrorHandler />
        {/* All page content */}
        {children}
      </ErrorBoundary>
    </SessionProvider>
  )
}
