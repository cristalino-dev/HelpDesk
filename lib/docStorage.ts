/**
 * lib/docStorage.ts — where the IT documents sit on the server (v3.99).
 *
 * uploads/it-docs/, beside the printer drivers and the ticket attachments:
 * outside the deploy archive and outside the `rm -rf` list in deploy.sh, so a
 * deploy never touches them, and git-ignored, so internal documents — one of
 * them a security runbook — are not in the repository. Adding a document is
 * copying a file in; nothing else knows about it.
 *
 * Server only. The naming rules it goes by are in lib/docs.ts, which the admin
 * panel reads too.
 */

import { mkdir, readdir, readFile, stat } from "fs/promises"
import path from "path"
import { isDocFile, docTitle, docGroupOf, docExt, type DocFile } from "@/lib/docs"

/** Absolute path to the directory that holds the documents. */
export function docsDir(): string {
  return path.join(process.cwd(), "uploads", "it-docs")
}

export async function ensureDocsDir(): Promise<void> {
  await mkdir(docsDir(), { recursive: true })
}

/**
 * Everything on the shelf, with what the panel needs to draw it. A directory
 * that does not exist yet is an empty shelf, not an error: a fresh server has
 * no documents until someone copies them in.
 */
export async function listDocs(): Promise<DocFile[]> {
  let entries: string[]
  try {
    entries = await readdir(docsDir())
  } catch {
    return []
  }

  const docs: DocFile[] = []
  for (const name of entries) {
    if (!isDocFile(name)) continue
    try {
      const info = await stat(path.join(docsDir(), name))
      if (!info.isFile()) continue
      const { index, title } = docTitle(name)
      docs.push({
        name, title, index,
        group: docGroupOf(name),
        ext: docExt(name),
        size: info.size,
        updatedAt: info.mtime.toISOString(),
      })
    } catch {
      // A file that vanished between the listing and the stat is simply not on
      // the shelf; it must not take the whole list down with it.
    }
  }
  return docs
}

/**
 * The bytes of one document, or null when it is not on the shelf.
 *
 * The name is a filename, never a path: `basename` strips any directory the
 * caller sent, and the result must still be a file we would have listed. That
 * is what stops `..%2F..%2F.env` from reading anything but this directory.
 */
export async function readDoc(name: string): Promise<Buffer | null> {
  const safe = path.basename(decodeURIComponent(name))
  if (!safe || safe.startsWith(".") || !isDocFile(safe)) return null
  const full = path.join(docsDir(), safe)
  if (path.dirname(full) !== docsDir()) return null
  try {
    const info = await stat(full)
    if (!info.isFile()) return null
    return await readFile(full)
  } catch {
    return null
  }
}
