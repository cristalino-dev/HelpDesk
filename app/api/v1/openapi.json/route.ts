/**
 * GET /api/v1/openapi.json — the public API described in OpenAPI 3.1 (v3.88).
 *
 * No key needed: it is a description, not data. Load it into Postman,
 * Swagger UI or a client generator. The document itself is lib/openapi.ts;
 * __tests__/openapi.test.ts fails when a route under /api/v1 is not in it.
 */

import { openApiDocument } from "@/lib/openapi"
import { NextResponse } from "next/server"

export function GET() {
  return NextResponse.json(openApiDocument(), { headers: { "Cache-Control": "public, max-age=300" } })
}
