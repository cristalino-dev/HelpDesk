/**
 * __tests__/chunkError.test.ts — stale-chunk detection & auto-recovery
 *
 * Both client error surfaces (ClientErrorHandler, ErrorBoundary) rely on this
 * lib to turn "old tab across a deploy" chunk failures into a silent reload
 * instead of a logged error + error screen.
 */
import { isChunkLoadError, recoverFromStaleChunk } from "@/lib/chunkError"

describe("isChunkLoadError", () => {
  it.each([
    "Failed to load chunk /_next/static/chunks/0bc4g17hr-hc_.js from module 64893",
    "Loading chunk 42 failed",
    "ChunkLoadError: timeout",
    "Importing a module script failed.",
    "error loading dynamically imported module: https://x/y.js",
  ])("matches: %s", msg => {
    expect(isChunkLoadError(msg)).toBe(true)
  })

  it.each([
    "Cannot read properties of null (reading 'trim')",
    "Failed to fetch",
    "",
  ])("does not match: %s", msg => {
    expect(isChunkLoadError(msg)).toBe(false)
  })
})

describe("recoverFromStaleChunk", () => {
  // window.location.reload can't be mocked in jsdom (non-configurable own
  // property; harmless "Not implemented" no-op when called). Assert on the
  // return value and the sessionStorage guard instead — they fully define
  // the contract: true ⇔ a reload was initiated ⇔ the timestamp was written.

  beforeEach(() => sessionStorage.clear())

  it("initiates a reload (true) on first stale-chunk error and stamps the guard", () => {
    expect(recoverFromStaleChunk()).toBe(true)
    expect(Number(sessionStorage.getItem("chunkReloadAt"))).toBeGreaterThan(Date.now() - 1_000)
  })

  it("returns false (no reload loop) when a reload already happened seconds ago", () => {
    const stamp = String(Date.now() - 5_000)
    sessionStorage.setItem("chunkReloadAt", stamp)
    expect(recoverFromStaleChunk()).toBe(false)
    expect(sessionStorage.getItem("chunkReloadAt")).toBe(stamp) // guard untouched
  })

  it("reloads again once the 20s guard window has passed", () => {
    sessionStorage.setItem("chunkReloadAt", String(Date.now() - 30_000))
    expect(recoverFromStaleChunk()).toBe(true)
  })
})
