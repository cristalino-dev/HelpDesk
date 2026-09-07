/**
 * app/manual/page.tsx — kept alive as a redirect
 *
 * This was a second user manual, saying much the same as /help in a
 * print-friendlier layout. Two pages answering the same question is how a
 * reader ends up on the one that has not been updated, so there is now one:
 * /help, which prints perfectly well.
 */

import { redirect } from "next/navigation"

export default function ManualPage() {
  redirect("/help")
}
