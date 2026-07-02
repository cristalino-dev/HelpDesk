/**
 * lib/chunkError.ts — Stale-chunk detection & auto-recovery (client-side)
 *
 * After a deploy, chunk filename hashes change. A browser tab left open on the
 * old build will request JS chunks that no longer exist on the server. These
 * are not bugs — the client is simply running an outdated page — so instead of
 * logging them and showing an error screen, we reload once to pull the fresh
 * build.
 *
 * Used by BOTH client error surfaces (they catch different manifestations):
 *   components/ClientErrorHandler.tsx — window "error" / "unhandledrejection"
 *   components/ErrorBoundary.tsx      — chunk failures during React render
 *                                       (e.g. lazy route segments) throw inside
 *                                       the tree and land here, not on window
 *
 * A sessionStorage timestamp guards against a reload loop: if we already
 * reloaded within the last 20s and chunks are STILL failing, something is
 * genuinely wrong (server down, build corrupted) — callers should log that.
 */

/** True when the message describes a failed JS chunk / dynamic import load. */
export function isChunkLoadError(message: string): boolean {
  return /Loading chunk|Failed to load chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module/i.test(message)
}

/**
 * Reloads the page to pull the fresh build, at most once per 20 seconds.
 * Returns true when a reload was initiated (caller should NOT log the error),
 * false when we already reloaded recently — a repeat failure is a real
 * problem worth logging.
 */
export function recoverFromStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem("chunkReloadAt") || 0)
    if (Date.now() - last > 20_000) {
      sessionStorage.setItem("chunkReloadAt", String(Date.now()))
      window.location.reload()
      return true
    }
    return false
  } catch {
    // sessionStorage unavailable (private mode) — reload without the guard is
    // riskier than not reloading; treat as unrecovered so the error gets logged.
    return false
  }
}
