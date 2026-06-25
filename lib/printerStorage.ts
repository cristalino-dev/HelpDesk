/**
 * lib/printerStorage.ts — Printer driver file storage (server filesystem)
 *
 * Printer drivers can be large binaries (tens to hundreds of MB), so unlike
 * ticket image attachments (base64 in Postgres) they are stored on the server
 * filesystem. The DB (PrinterDriver) holds only metadata.
 *
 * STORAGE LOCATION:
 * ──────────────────
 * Files live under  <cwd>/uploads/printer-drivers/.  On the server `cwd` is
 * /home/ubuntu/helpdesk (see ecosystem.config.js), and `uploads/` is NOT part
 * of the deploy archive nor the `rm -rf` list in deploy.sh, so uploaded drivers
 * persist across deploys. `uploads/` is git-ignored.
 *
 * The pure helpers (sanitizeFilename / buildStoredName / isAllowedDriverExt)
 * are unit-tested; the fs helpers wrap them.
 */

import { mkdir, writeFile, unlink } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"

/** Hard cap on a single driver upload. The reverse proxy may impose its own
 *  (smaller) limit — raise `client_max_body_size` there for large drivers. */
export const MAX_DRIVER_BYTES = 100 * 1024 * 1024 // 100 MB

/** Extensions we accept for driver uploads (installers / archives). */
export const ALLOWED_DRIVER_EXTENSIONS = [
  ".zip", ".exe", ".msi", ".inf", ".cab", ".rar", ".7z", ".tar", ".gz", ".pkg", ".dmg",
] as const

/** Absolute path to the directory that holds driver files. */
export function driversDir(): string {
  return path.join(process.cwd(), "uploads", "printer-drivers")
}

/** Ensure the drivers directory exists (idempotent). */
export async function ensureDriversDir(): Promise<void> {
  await mkdir(driversDir(), { recursive: true })
}

/**
 * Make a user-supplied filename safe to place on disk:
 *  - strips any directory components (defends against path traversal)
 *  - keeps only [A-Za-z0-9._-], turning everything else (incl. spaces and
 *    non-ASCII) into "_", then collapses repeated underscores
 *  - caps length while preserving the extension
 * Always returns a non-empty string.
 */
export function sanitizeFilename(name: string): string {
  // basename: drop everything up to the last / or \
  const base = String(name ?? "").split(/[/\\]/).pop() ?? ""
  const ext = path.extname(base)
  const stem = base.slice(0, base.length - ext.length)

  const clean = (s: string) =>
    s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[_.]+|_+$/g, "")

  const safeExt = clean(ext).replace(/^_+/, "") // ext without leading separators
  let safeStem = clean(stem)
  if (!safeStem) safeStem = "driver"

  // cap total length at 120 chars, keeping the extension
  const maxStem = Math.max(1, 120 - (safeExt ? safeExt.length + 1 : 0))
  if (safeStem.length > maxStem) safeStem = safeStem.slice(0, maxStem)

  return safeExt ? `${safeStem}.${safeExt}` : safeStem
}

/** Build a unique on-disk name: "<uuid>__<sanitized-original>". The uuid keeps
 *  names unique even when two printers have a driver with the same filename. */
export function buildStoredName(originalName: string): string {
  return `${randomUUID()}__${sanitizeFilename(originalName)}`
}

/** True when the filename has an extension we accept for drivers. */
export function isAllowedDriverExt(name: string): boolean {
  const ext = path.extname(String(name ?? "")).toLowerCase()
  return (ALLOWED_DRIVER_EXTENSIONS as readonly string[]).includes(ext)
}

/** Absolute disk path for a stored driver, guarded against traversal. */
export function driverDiskPath(storedName: string): string {
  return path.join(driversDir(), path.basename(storedName))
}

/** Write a driver file to disk (creates the directory if needed). */
export async function saveDriverFile(storedName: string, data: Buffer): Promise<void> {
  await ensureDriversDir()
  await writeFile(driverDiskPath(storedName), data)
}

/** Delete a driver file from disk. Missing files are ignored. */
export async function deleteDriverFile(storedName: string): Promise<void> {
  try {
    await unlink(driverDiskPath(storedName))
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err
  }
}
