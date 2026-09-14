/**
 * __tests__/openapi.test.ts — the API's description keeps up with the API (v3.88).
 *
 * Reads every route under app/api/v1 and fails when the route, or one of the
 * methods it exports, is missing from lib/openapi.ts — the document another
 * program's developers generate their client from. Also: every $ref resolves.
 */

import { readdirSync, readFileSync } from "fs"
import { join, relative, sep } from "path"
import { openApiDocument } from "@/lib/openapi"

const APP = join(process.cwd(), "app")

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return routeFiles(full)
    return e.name === "route.ts" ? [full] : []
  })
}

const doc = openApiDocument()
const paths = doc.paths as Record<string, Record<string, unknown>>

it("finds the API's routes", () => {
  expect(routeFiles(join(APP, "api", "v1")).length).toBeGreaterThanOrEqual(7)
})

it("documents every /api/v1 route and every method it exports", () => {
  const missing: string[] = []
  for (const file of routeFiles(join(APP, "api", "v1"))) {
    const path = "/" + relative(APP, file).split(sep).slice(0, -1).join("/").replace(/\[(\w+)\]/g, "{$1}")
    const methods = [...readFileSync(file, "utf8").matchAll(/export (?:async )?function (GET|POST|PATCH|PUT|DELETE)\b/g)].map(m => m[1].toLowerCase())
    for (const m of methods) if (!paths[path]?.[m]) missing.push(`${m.toUpperCase()} ${path}`)
  }
  expect(missing).toEqual([])
})

it("resolves every $ref", () => {
  const schemas = doc.components.schemas as Record<string, unknown>
  const refs: string[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "$ref" && typeof x === "string") refs.push(x)
        else walk(x)
      }
    }
  }
  walk(doc)
  const broken = refs.filter(r => !schemas[r.replace("#/components/schemas/", "")])
  expect(refs.length).toBeGreaterThan(10)
  expect(broken).toEqual([])
})

it("is plain JSON, OpenAPI 3.1", () => {
  expect(JSON.parse(JSON.stringify(doc)).openapi).toBe("3.1.0")
})
