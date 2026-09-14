/**
 * @jest-environment node
 */
/**
 * __tests__/apiDocs.test.ts — the API's front door and its documentation page (v3.89).
 *
 * GET /api/v1 was a 404 — the one address everybody is given. Now a browser is
 * sent to /api/v1/docs and a program gets an index. Both are generated from
 * lib/openapi.ts, so every operation and object there must show up in them.
 */

import type { NextRequest } from "next/server"
import { GET as index } from "@/app/api/v1/route"
import { GET as docs } from "@/app/api/v1/docs/route"
import { apiIndex, apiDocsHtml, apiOperations, wantsHtml } from "@/lib/apiDocs"
import { openApiDocument } from "@/lib/openapi"
import { themeCss } from "@/lib/palette"

jest.mock("next/server", () => {
  class NextResponse {
    status: number
    headers: Map<string, string>
    body: unknown
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body
      this.status = init?.status ?? 200
      this.headers = new Map(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    }
    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(data, init)
    }
  }
  return { NextResponse }
})

type Res = { status: number; headers: Map<string, string>; body: unknown }
const req = (accept: string | null) =>
  ({ headers: { get: (k: string) => (k.toLowerCase() === "accept" ? accept : null) } }) as unknown as NextRequest
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

const ops = apiOperations()
const html = apiDocsHtml()

describe("apiOperations", () => {
  it("knows which key each operation needs", () => {
    const key = (m: string, p: string) => ops.find(o => o.method === m && o.path === p)?.key
    expect(key("GET", "/api/v1/tickets")).toBe("read")
    expect(key("POST", "/api/v1/tickets")).toBe("write")
    expect(key("PATCH", "/api/v1/tickets/{ref}")).toBe("write")
    expect(key("GET", "/api/v1/openapi.json")).toBe("none")
    expect(key("GET", "/api/v1/docs")).toBe("none")
    expect(key("GET", "/api/v1")).toBe("none")
  })
})

describe("GET /api/v1", () => {
  it("sends a browser to the documentation page", () => {
    const res = index(req(BROWSER)) as unknown as Res
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("/api/v1/docs")
  })

  it("gives a program the index: where the docs are, and every endpoint with its key", () => {
    const res = index(req("*/*")) as unknown as Res
    expect(res.status).toBe(200)
    expect(res.headers.get("vary")).toBe("Accept")
    const body = res.body as ReturnType<typeof apiIndex>
    expect(body.documentation.endsWith("/api/v1/docs")).toBe(true)
    expect(body.openapi.endsWith("/api/v1/openapi.json")).toBe(true)
    expect(body.endpoints).toHaveLength(ops.length)
    expect(body.endpoints).toContainEqual({ method: "POST", path: "/api/v1/tickets", summary: "Open a ticket or request", key: "write" })
  })

  it("treats a request with no Accept header as a program", () => {
    expect((index(req(null)) as unknown as Res).status).toBe(200)
  })
})

describe("wantsHtml", () => {
  it.each([
    [BROWSER, true],
    ["TEXT/HTML", true],
    ["*/*", false],
    ["application/json", false],
    [null, false],
  ])("%s → %s", (accept, expected) => expect(wantsHtml(accept)).toBe(expected))
})

describe("GET /api/v1/docs", () => {
  it("is an HTML page that runs nothing", () => {
    const res = docs() as unknown as Res
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'")
    expect(res.body).toBe(html)
    expect(html).not.toMatch(/<script/i)
  })

  it("documents every operation and every object in the OpenAPI document", () => {
    for (const o of ops) {
      expect(html).toContain(`id="${o.op.operationId}"`)
      expect(html).toContain(`<code>${o.path}</code>`)
      expect(html).toContain(o.summary)
    }
    for (const name of Object.keys(openApiDocument().components.schemas)) expect(html).toContain(`id="obj-${name}"`)
  })

  it("escapes what it quotes", () => {
    // Entry.authorName's description reads: default "API: <key name>".
    expect(html).toContain("API: &lt;key name&gt;")
    expect(html).not.toContain("<key name>")
    expect(html).toContain("attachments/&lt;id&gt;")
  })

  it("takes its colours from the palette", () => {
    expect(html).toContain(themeCss())
  })
})
