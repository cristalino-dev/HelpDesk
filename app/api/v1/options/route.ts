/**
 * GET /api/v1/options — the values a ticket's fields may take, and the SLA (v3.88).
 *
 * Read key. → { data: { status[], type[], urgency[], category[], platform[],
 * sla: { ticket, request } } }. The lists are the ones admins configure for the
 * web form, and the ones POST and PATCH check against — so an integration can
 * offer exactly what the server will accept.
 */

import { authenticateApi } from "@/lib/apiKeys"
import { getTicketOptions } from "@/lib/apiOptions"
import { serverError } from "@/lib/apiRoute"
import { getSla } from "@/lib/sla"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApi(req, "read")
    if ("response" in auth) return auth.response
    const [options, sla] = await Promise.all([getTicketOptions(), getSla()])
    return NextResponse.json({ data: { ...options, sla } })
  } catch (err) {
    return serverError(err, "/api/v1/options GET")
  }
}
