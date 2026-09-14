/**
 * __tests__/devRefresh.test.ts — refreshing the dev copy never brings over
 * production's API keys (v3.88).
 *
 * The dev copy's data is production's. A production key — even one revoked in
 * production since — must not open it, so scripts/refresh-dev-db.py leaves
 * ApiKey out of both the TRUNCATE and the copy. It is Python: this reads it.
 */

import { readFileSync } from "fs"
import { join } from "path"

const script = readFileSync(join(process.cwd(), "scripts", "refresh-dev-db.py"), "utf8")

it("leaves ApiKey out of what it empties and what it copies", () => {
  expect(script).toMatch(/^KEEP_DEV = \{"ApiKey"\}\r?$/m)
  // `names` feeds both the TRUNCATE list and the copy loop.
  expect(script).toMatch(/^\s+names = tables\(s\) - KEEP_DEV\r?$/m)
})
