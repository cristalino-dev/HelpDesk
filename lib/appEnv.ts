/**
 * lib/appEnv.ts — which copy of the app this is (v3.86).
 *
 * The same code runs as production (helpdesk.cristalino.co.il) and as the dev
 * copy on the same server (dev-helpdesk.cristalino.co.il). The dev copy is a
 * real app running on a real copy of production's data, so the differences
 * that must never be forgotten are switched from this one place:
 *
 *   • it says DEV on every page (components/DevBanner.tsx);
 *   • it never reads the helpdesk@ mailbox — it shares the credentials, and a
 *     message it marked \Seen is one production would never ingest;
 *   • it mails nobody but MAIL_REDIRECT_TO — and nobody at all when that is
 *     unset (lib/mail.ts).
 *
 * `NEXT_PUBLIC_APP_ENV=dev` in the dev copy's .env.local turns all three on.
 * It is NEXT_PUBLIC_ so the browser can read it too; the build inlines it.
 * Anything else — unset included — is production.
 */

export type AppEnv = "dev" | "production"

export function appEnv(): AppEnv {
  return (process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase() === "dev" ? "dev" : "production"
}

export function isDevSite(): boolean {
  return appEnv() === "dev"
}
