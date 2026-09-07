/**
 * app/admin-manual/page.tsx — kept alive as a redirect
 *
 * The support team's manual now lives inside /help, which is the single place
 * any documentation lives. The content moved to components/AdminGuide; this
 * route stays because it is bookmarked, printed and linked from old emails,
 * and a dead link is worse than a redirect.
 *
 * No guard is needed here any more: /help decides what to show from the
 * session, and the admin half is simply not rendered for anyone else.
 */

import { redirect } from "next/navigation"

export default function AdminManualPage() {
  redirect("/help#admin")
}
