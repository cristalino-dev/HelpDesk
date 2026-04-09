import type { Metadata } from "next"
import "./globals.css"
import Providers from "./providers"

export const metadata: Metadata = {
  title: "מערכת helpdesk",
  description: "מערכת לניהול פניות תמיכה",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
