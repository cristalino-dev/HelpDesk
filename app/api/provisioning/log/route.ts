/**
 * app/api/provisioning/log/route.ts — transcripts from workstation setup scripts
 *
 * ENDPOINT
 * ────────
 *   POST /api/provisioning/log
 *
 * The setup scripts that build a Cristalino PC (`setup-new-pc.ps1`,
 * `setup-without-lenovo.ps1`, `setup-users.ps1`, `setup-workstation.ps1`) post
 * their transcript here when they finish. The run is recorded in the `Log`
 * table, and the whole transcript is mailed to the dev address as a `.log`
 * attachment.
 *
 * PAYLOAD (JSON)
 *   computerName  {string}   e.g. CRISTALINO-PC10
 *   scriptName    {string}   e.g. setup-without-lenovo.ps1
 *   status        {string}   'Success' | 'Failed' | 'Warning'
 *   duration      {string?}  e.g. '00:04:15'
 *   errorCount    {number?}
 *   logContent    {string}   the transcript
 *
 * RESPONSES
 *   200 — { ok, logFilename }
 *   400 — malformed JSON, or neither computerName nor logContent sent
 *   413 — body over MAX_BODY_BYTES
 *   429 — rate limited (see below)
 *
 * ── WHY THIS ENDPOINT IS UNUSUAL ──────────────────────────────────────────
 * It takes no credential. Every other machine-to-machine route here does
 * (`/api/automation/close` wants AUTOMATION_API_KEY, `/api/v1` wants an API
 * key), and this one cannot: it is called by scripts that run on a PC being
 * built from a USB stick, before that machine has anything of ours on it, so
 * a key would only be a key sitting on the USB stick.
 *
 * What it has instead are limits, because an open endpoint that SENDS MAIL is
 * a mail relay if you let it be:
 *
 *   • the body is capped, so one request cannot mail a 50 MB attachment;
 *   • a per-IP window stops one machine looping;
 *   • a GLOBAL window stops many machines doing the same thing — a per-IP
 *     limit alone is no defence against a request from a thousand addresses,
 *     and it is the dev inbox we are protecting, not the CPU;
 *   • the recipient is a constant. Nothing in the payload can redirect it.
 *
 * Both windows are in process memory, which is exact here because the app
 * runs as a single pm2 fork; a second instance would need a shared counter.
 * A dropped log is a log, not a ticket — refusing one is the right trade.
 */

import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/db"
import { sendMail, mailProvisioningLog } from "@/lib/mail"
import { logError } from "@/lib/logError"

const DEV_EMAIL = "dev@cristalino.co.il"

/** A transcript is text; this is a generous ceiling for one, not a target. */
export const MAX_BODY_BYTES = 1_000_000
/** Lines of the tail shown in the mail body. The attachment holds the rest. */
const TAIL_LINES = 80

const WINDOW_MS   = 10 * 60 * 1000
const PER_IP_MAX  = 10
const GLOBAL_MAX  = 60

const hits = new Map<string, number[]>()

/**
 * Records a hit and says whether it is over the limit. Timestamps older than
 * the window are dropped on the way past, which is also what keeps the map
 * from growing without bound.
 */
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  for (const [key, times] of hits) {
    const live = times.filter(t => t > cutoff)
    if (live.length === 0) hits.delete(key)
    else hits.set(key, live)
  }
  const forIp = hits.get(ip) ?? []
  const total = [...hits.values()].reduce((n, times) => n + times.length, 0)
  if (forIp.length >= PER_IP_MAX || total >= GLOBAL_MAX) return true
  hits.set(ip, [...forIp, now])
  return false
}

/** Behind nginx, the client address is the first hop in X-Forwarded-For. */
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim()
}

/**
 * For the attachment name: a filename, never a path. Dots survive because
 * `setup-new-pc.ps1` needs its own, but a RUN of them does not — stripping
 * the separators out of `../../etc/passwd` would otherwise leave `....etc`.
 */
const safeName = (s: string) =>
  s.replace(/[^a-zA-Z0-9_.-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .slice(0, 60) || "unknown"

export async function POST(req: NextRequest) {
  try {
    if (rateLimited(clientIp(req))) {
      return NextResponse.json({ error: "Too many provisioning logs" }, { status: 429 })
    }

    // Read as text first: it is the only way to know the size before paying
    // for it, and it turns malformed JSON into a 400 rather than a 500.
    const raw = await req.text()
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "Malformed JSON" }, { status: 400 })
    }

    const str = (v: unknown, fallback: string) =>
      typeof v === "string" && v.trim() ? v.trim() : fallback

    // Checked against the BODY, not against the defaults below — a default is
    // truthy, so a guard written after they are applied can never fire.
    if (typeof body.computerName !== "string" && typeof body.logContent !== "string") {
      return NextResponse.json({ error: "Missing log payload" }, { status: 400 })
    }

    const computerName = str(body.computerName, "UNKNOWN-PC")
    const scriptName   = str(body.scriptName, "provisioning-script")
    const status       = str(body.status, "Success")
    const duration     = str(body.duration, "N/A")
    const errorCount   = Number.isFinite(Number(body.errorCount)) ? Number(body.errorCount) : 0
    const logContent   = typeof body.logContent === "string" ? body.logContent : ""

    const failed =
      /fail|err/i.test(status) ||
      errorCount > 0

    const today = new Date().toISOString().slice(0, 10)

    await prisma.log.create({
      data: {
        level: failed ? "error" : "info",
        source: `Provisioning: ${scriptName}`,
        message: `${scriptName} on ${computerName} finished with status '${status}'. Errors: ${errorCount}. Duration: ${duration}`,
        date: today,
      },
    }).catch(err => console.error("[provisioning/log] could not write the Log row:", err))

    const logFilename = `${safeName(scriptName)}_${safeName(computerName)}_${today}.log`
    const html = mailProvisioningLog({
      computerName, scriptName, status, duration, errorCount, failed,
      tail: logContent.split(/\r?\n/).slice(-TAIL_LINES).join("\n"),
      // The body cap is on the request, so anything that got here is whole;
      // the flag exists for the day the cap moves below a real transcript.
      truncated: false,
    })

    after(async () => {
      try {
        await sendMail({
          to: DEV_EMAIL,
          subject: `[IT Provisioning] ${scriptName} on ${computerName} (${status})`,
          html,
          attachments: [{ filename: logFilename, content: logContent, contentType: "text/plain" }],
        })
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        await logError(`Provisioning log mail failed: ${e.message}`, "/api/provisioning/log POST", e.stack).catch(() => {})
      }
    })

    return NextResponse.json({ ok: true, logFilename })
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/provisioning/log POST", e.stack).catch(() => {})
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
