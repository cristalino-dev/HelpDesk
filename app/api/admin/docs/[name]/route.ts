/**
 * app/api/admin/docs/[name]/route.ts — one IT document (v3.99).
 *
 * GET → the file itself. ADMINS ONLY, like the listing beside it: an
 * unauthenticated request gets 401 and an ordinary user 403, so a link pasted
 * into a chat is a link to a sign-in page, not to the network topology.
 *
 * What the browser does with it is lib/docs.ts's decision: HTML, PDF and plain
 * text open in the tab the panel opened, everything else downloads. HTML is
 * served under a CSP that lets it style itself and reach nothing — it comes
 * from our own origin, so anything it could load, it could load as us.
 *
 * `name` is a filename, never a path; see readDoc() in lib/docStorage.ts.
 */

import { auth } from "@/auth"
import { logError } from "@/lib/logError"
import { readDoc } from "@/lib/docStorage"
import { docResponseHeaders } from "@/lib/docs"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { name } = await params
    const file = await readDoc(name)
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return new NextResponse(new Uint8Array(file), {
      headers: docResponseHeaders(decodeURIComponent(name), file.length),
    })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/admin/docs/[name] GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
