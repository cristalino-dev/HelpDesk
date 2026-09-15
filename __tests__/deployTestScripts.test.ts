/**
 * __tests__/deployTestScripts.test.ts — deploy-test.ps1 and deploy-test.sh, the
 * one-command deploy to the testing environment (the dev copy).
 *
 * Nothing here deploys. These pin what matters about the two scripts: they can
 * only ever reach the dev copy; they run the tests before uploading (the
 * server's build does not); they check the version that actually answers; and
 * the PowerShell one stays parseable by Windows PowerShell 5.1 (see
 * deployScripts.test.ts for how a non-ASCII byte broke deploy.ps1).
 */

import { readFileSync } from "fs"
import { join } from "path"

const root = join(__dirname, "..")
const read = (p: string) => readFileSync(join(root, p), "utf8")
const ps = read("deploy-test.ps1")
const sh = read("deploy-test.sh")
const scripts: [string, string][] = [["deploy-test.ps1", ps], ["deploy-test.sh", sh]]

describe("deploy-test.ps1 survives Windows PowerShell 5.1", () => {
  it("contains no non-ASCII byte, and says why", () => {
    const buf = readFileSync(join(root, "deploy-test.ps1"))
    expect(buf.findIndex(b => b > 0x7f)).toBe(-1)
    expect(ps).toContain("KEEP THIS FILE PURE ASCII")
  })
})

it("deploy-test.ps1 never writes $name? in a string — PowerShell reads the ? as part of the name", () => {
  // "run $Version?" printed "run ": the variable it read was $Version?, which does not exist.
  expect(ps).not.toMatch(/\$[A-Za-z_]\w*\?/)
})

it("deploy-test.sh stays LF — it runs under bash", () => {
  expect(sh).not.toContain("\r")
})

describe("the testing environment, and nothing else", () => {
  it("deploys the dev target only", () => {
    expect(ps).toContain("$deployArgs = @{ Target = 'dev' }")
    expect(ps).not.toMatch(/Target\s*=\s*'prod'|-Target\s+prod/)
    expect(sh).toContain('bash "$ROOT/deploy.sh" dev')
    expect(sh).not.toMatch(/deploy\.sh"?\s*(prod\b|$)/m)
  })

  it.each(scripts)("%s names no address but the dev copy's", (_name, src) => {
    expect(src).toContain("dev-helpdesk.cristalino.co.il")
    expect(src).not.toMatch(/(?<!dev-)helpdesk\.cristalino\.co\.il/)
  })
})

describe("what a deploy to it does", () => {
  it("runs the tests before it uploads anything", () => {
    expect(ps.indexOf("& npx jest --ci")).toBeGreaterThan(-1)
    expect(ps.indexOf("& npx jest --ci")).toBeLessThan(ps.indexOf("@deployArgs\n"))
    expect(sh.indexOf("npx jest --ci)")).toBeGreaterThan(-1)
    expect(sh.indexOf("npx jest --ci)")).toBeLessThan(sh.indexOf('bash "$ROOT/deploy.sh" dev'))
  })

  it.each(scripts)("%s checks the version that answers against lib/version.ts", (_name, src) => {
    expect(src).toMatch(/lib[\\/]version\.ts/)
    expect(src).toContain("appVersion")
    expect(src).toContain("/api/v1")
  })

  it("offers the same two switches in both", () => {
    expect(ps).toContain("[switch] $SkipTests")
    expect(ps).toContain("[switch] $CheckOnly")
    expect(sh).toContain("--skip-tests")
    expect(sh).toContain("--check-only")
  })
})
