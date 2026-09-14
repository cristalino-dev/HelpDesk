/**
 * GET /api/v1/docs — the API's documentation, as a page (v3.89).
 *
 * The link to give another program's developers. Generated from lib/openapi.ts
 * by lib/apiDocs.ts, so it always says what the routes do. Static text under a
 * script-less CSP; no key.
 */

import { NextResponse } from "next/server"
import { apiDocsHtml, DOCS_HEADERS } from "@/lib/apiDocs"

export function GET() {
  return new NextResponse(apiDocsHtml(), { headers: DOCS_HEADERS })
}
