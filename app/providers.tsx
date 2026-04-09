"use client"
import { SessionProvider } from "next-auth/react"
import ErrorBoundary from "@/components/ErrorBoundary"
import ClientErrorHandler from "@/components/ClientErrorHandler"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ErrorBoundary>
        <ClientErrorHandler />
        {children}
      </ErrorBoundary>
    </SessionProvider>
  )
}
