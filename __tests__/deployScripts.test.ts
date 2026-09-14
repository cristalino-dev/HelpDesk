/**
 * __tests__/deployScripts.test.ts — the deploy scripts themselves
 *
 * Nothing here runs a deploy. These are the checks that would otherwise only
 * fail on someone's Windows box, mid-deploy, with a parser error.
 *
 * The one that already bit: deploy.ps1 shipped with em dashes in its comments.
 * Windows PowerShell 5.1 reads a .ps1 with no byte-order mark in the system
 * ANSI codepage rather than UTF-8, so each em dash arrived as mojibake,
 * terminated the string it sat in, and the parser read the rest of that line as
 * code -- turning a '>' in the message into a redirection operator. PowerShell
 * 7 defaults to UTF-8 and parses the same file happily, so a syntax check on
 * a developer machine does not catch it. A byte-level assertion does.
 *
 * The rest guard drift: deploy.sh and deploy.ps1 do the same job by different
 * plumbing, and the archive they build has to stay identical or a deploy from
 * one will ship a different tree than a deploy from the other.
 */

import { readFileSync } from "fs"
import { join } from "path"

const root = join(__dirname, "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")
const bytes = (p: string) => readFileSync(join(root, p))

describe("deploy.ps1 survives Windows PowerShell 5.1", () => {
  it("contains no non-ASCII byte", () => {
    const buf = bytes("deploy.ps1")
    const offenders: string[] = []
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 0x7f) {
        const line = buf.subarray(0, i).toString("utf8").split("\n").length
        offenders.push(`line ${line}: 0x${buf[i].toString(16)}`)
        if (offenders.length >= 5) break
      }
    }
    expect(offenders).toEqual([])
  })

  it("carries the note explaining why, so the next person does not undo it", () => {
    expect(read("deploy.ps1")).toContain("KEEP THIS FILE PURE ASCII")
  })
})

describe("the shell scripts stay LF", () => {
  // Piped to bash on the server; a CR makes every line fail with
  // "$'\r': command not found".
  it.each(["deploy.sh", "scripts/deploy-remote.sh"])("%s has no CRLF", file => {
    expect(read(file)).not.toContain("\r")
  })

  it("is pinned by .gitattributes, not just by luck of the checkout", () => {
    const attrs = read(".gitattributes")
    expect(attrs).toMatch(/\*\.sh\s+text\s+eol=lf/)
    expect(attrs).toMatch(/maintenance\.template\.html\s+text\s+eol=lf/)
  })
})

describe("the two entry points cannot drift", () => {
  const sh = read("deploy.sh")
  const ps = read("deploy.ps1")

  it("both drive the same shared pieces", () => {
    for (const shared of ["scripts/maintenance.template.html", "scripts/deploy-remote.sh"]) {
      expect(sh).toContain(shared)
      expect(ps).toContain(shared.replace(/\//g, "\\"))
    }
  })

  it("archive the same files", () => {
    // deploy.sh lists them across the tar continuation lines; deploy.ps1 in a
    // pair of arrays. Compare the sets, not the formatting.
    const shList = (sh.match(/tar -czf "\$TMPTAR" \\\n([\s\S]*?)\n\n/) ?? [])[1] ?? ""
    const shItems = new Set(
      shList.split(/\s+/)
        .filter(w => /^[\w.@/-]+$/.test(w) && !w.startsWith("-") && w !== '"$TMPTAR"' && w !== '"$LOCAL"'),
    )
    const psItems = new Set(
      [...ps.matchAll(/'([\w.@/-]+\.(?:ts|json|js)|app|components|lib|prisma|public|scripts|types)'/g)].map(m => m[1]),
    )
    // Everything deploy.sh ships must be something deploy.ps1 ships too.
    for (const item of shItems) {
      if (item === "\\" || item === "-C") continue
      expect(psItems.has(item)).toBe(true)
    }
    // And the reverse, so neither grows a file the other forgets.
    for (const item of psItems) expect(shItems.has(item)).toBe(true)
  })

  it("default to the same server, user and remote directory", () => {
    for (const value of ["18.195.248.157", "ubuntu", "/home/ubuntu/helpdesk"]) {
      expect(sh).toContain(value)
      expect(ps).toContain(value)
    }
  })

  it("both honour the DEPLOY_* overrides", () => {
    for (const v of ["DEPLOY_KEY", "DEPLOY_HOST", "DEPLOY_USER", "DEPLOY_REMOTE_DIR"]) {
      expect(sh).toContain(v)
      expect(ps).toContain(v)
    }
  })

  it("ship .env only when it exists, in both", () => {
    // A CI checkout has neither; shipping an absent file would truncate the
    // server's own copy.
    expect(sh).toContain("if [ -f \"$LOCAL/.env\" ]")
    expect(ps).toContain("Test-Path -LiteralPath (Join-Path $Local $envFile)")
  })
})

describe("the maintenance template", () => {
  it("carries the placeholder both scripts substitute", () => {
    expect(read("scripts/maintenance.template.html")).toContain("{{VERSION}}")
  })

  it("no longer hardcodes a version that could go stale", () => {
    expect(read("scripts/maintenance.template.html")).not.toMatch(/מעדכן לגרסה 3\.\d/)
  })
})

describe("the dev target (v3.86)", () => {
  const sh = read("deploy.sh")
  const ps = read("deploy.ps1")
  const remote = read("scripts/deploy-remote.sh")

  it("is known to both entry points: its directory, pm2 name, domain and switch", () => {
    for (const value of ["/home/ubuntu/helpdesk-dev", "helpdesk-dev", "dev-helpdesk.cristalino.co.il", "DEPLOY_TARGET"]) {
      expect(sh).toContain(value)
      expect(ps).toContain(value)
    }
  })

  // A laptop's .env points at the PRODUCTION database. Shipped to the dev copy
  // it would make dev read and write production.
  it("never ships this checkout's .env to the dev copy, in either entry point", () => {
    expect(sh).toContain('if [ "$TARGET" = dev ]; then')
    expect(ps).toContain("if ($Target -ne 'dev') {")
  })

  it("tells the server side which copy it is deploying, defaulting to production", () => {
    for (const line of [
      'APP_DIR="${APP_DIR:-/home/ubuntu/helpdesk}"',
      'APP_NAME="${APP_NAME:-helpdesk}"',
      'APP_PORT="${APP_PORT:-3000}"',
    ]) expect(remote).toContain(line)
    expect(remote).not.toMatch(/^\s*cd \/home\/ubuntu\/helpdesk\s*$/m)
    expect(remote).toContain('pm2 stop "$APP_NAME"')
  })

  it("removes only its own copy's cron jobs, so a dev deploy cannot wipe production's", () => {
    expect(remote).toContain('grep -v -e "$APP_DIR/send-digest.sh" -e "$APP_DIR/run-sweep.sh" -e "$APP_DIR/run-ingest.sh"')
    expect(remote).not.toMatch(/grep -v -e "send-digest\.sh"/)
  })

  it("never schedules mail ingestion or the digest on the dev copy", () => {
    const devJobs = remote.match(/# The dev copy: the sweep only[\s\S]*?\bfi\b/)?.[0] ?? ""
    expect(devJobs).toContain("run-sweep.sh")
    expect(devJobs).not.toContain("run-ingest.sh")
    expect(devJobs).not.toContain("send-digest.sh")
  })

  it("points the pm2 app at whichever copy it is started from", () => {
    const ecosystem = read("ecosystem.config.js")
    expect(ecosystem).toContain("process.env.APP_NAME || 'helpdesk'")
    expect(ecosystem).toContain("cwd: __dirname")
  })

  // Run it, not read it: a PORT declared in the wrong scope reads fine and
  // throws the moment the deploy starts it — which is how v3.86 first had it.
  it("starts the maintenance page on the copy's own port, 3000 by default", () => {
    const listen = jest.fn()
    jest.doMock("http", () => ({ createServer: jest.fn(() => ({ listen })) }))
    const start = (port?: string) => {
      const saved = process.env.PORT
      if (port === undefined) delete process.env.PORT
      else process.env.PORT = port
      try {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../maintenance-server.js")
        })
      } finally {
        if (saved === undefined) delete process.env.PORT
        else process.env.PORT = saved
      }
    }
    start("3100")
    start(undefined)
    jest.dontMock("http")
    expect(listen.mock.calls.map(c => c[0])).toEqual([3100, 3000])
  })
})
