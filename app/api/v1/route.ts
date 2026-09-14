/**
 * GET /api/v1 — the API's front door (v3.89).
 *
 * The address everyone is handed — and until v3.89 a 404. A browser
 * (Accept: text/html) is sent on to the documentation page, /api/v1/docs; a
 * program gets the index: where the documentation is, and every endpoint with
 * the key it needs, built from lib/openapi.ts by lib/apiDocs.ts. No key: it
 * is a description, not data.
 */

import { NextRequest, NextResponse } from "next/server"
import { apiIndex, wantsHtml } from "@/lib/apiDocs"

export function GET(req: NextRequest) {
  if (wantsHtml(req.headers.get("accept"))) {
    // A relative Location holds behind nginx, whatever host the app itself sees.
    return new NextResponse(null, { status: 307, headers: { Location: "/api/v1/docs", Vary: "Accept" } })
  }
  return NextResponse.json(apiIndex(), { headers: { "Cache-Control": "public, max-age=300", Vary: "Accept" } })
}
