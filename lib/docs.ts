/**
 * lib/docs.ts — the IT documentation shelf (v3.99), as both sides see it.
 *
 * The team's own documents — the infrastructure write-ups, the working guides —
 * live on the server under uploads/it-docs/ and are served to admins only
 * (app/api/admin/docs). Nothing about them is in the database and nothing is in
 * git: they are internal, one of them a security runbook, and the repository is
 * not where that belongs. Dropping a file into that directory publishes it;
 * removing it takes it away.
 *
 * What a file is CALLED is therefore the only thing describing it, so the
 * naming does the work:
 *
 *   00_MASTER_IT_ECOSYSTEM_INDEX.docx  → "00" · "MASTER IT ECOSYSTEM INDEX",
 *                                        filed under the infrastructure set and
 *                                        ordered by its number;
 *   מדריך הקמת נציגים - Zoho Desk.html → a working guide, ordered by name.
 *
 * Pure and client-safe: the panel and the route agree because they both read
 * this file, and it is unit-tested without a filesystem.
 */

/** What may sit on the shelf. Anything else in the directory is ignored. */
export const DOC_EXTENSIONS = [".html", ".htm", ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".md", ".txt"] as const

export const DOC_GROUPS = { infra: "תיעוד תשתיות IT", guides: "מדריכי עבודה" } as const

export type DocGroup = keyof typeof DOC_GROUPS

/** One document, as the API hands it to the panel. */
export type DocFile = {
  /** The filename on disk — also the URL segment. */
  name: string
  title: string
  /** The number a file carries in front of its name, or null. Orders the set. */
  index: string | null
  group: DocGroup
  ext: string
  size: number
  updatedAt: string
}

/** ".docx" — lowercase, empty for a file with no extension. */
export function docExt(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot).toLowerCase()
}

export function isDocFile(name: string): boolean {
  return (DOC_EXTENSIONS as readonly string[]).includes(docExt(name))
}

/**
 * The number in front of a name, and the name without it or its extension.
 * Underscores become spaces; the case is left exactly as it is, because these
 * names are mostly acronyms (ERP, PBX, IT) that title-casing would ruin.
 */
export function docTitle(name: string): { index: string | null; title: string } {
  const withoutExt = name.slice(0, name.length - docExt(name).length) || name
  const numbered = /^(\d{1,3})[_\-. ]+(.+)$/.exec(withoutExt)
  const rest = (numbered ? numbered[2] : withoutExt).replace(/_+/g, " ").trim()
  return { index: numbered ? numbered[1] : null, title: rest || withoutExt }
}

/** A numbered file belongs to the infrastructure set; everything else is a guide. */
export function docGroupOf(name: string): DocGroup {
  return docTitle(name).index === null ? "guides" : "infra"
}

/** The shelf's order: the infrastructure set by its numbers, then the guides by name. */
export function sortDocs(docs: readonly DocFile[]): DocFile[] {
  const rank = (d: DocFile) => (d.group === "infra" ? 0 : 1)
  return [...docs].sort((a, b) =>
    rank(a) - rank(b) ||
    (a.index ?? "").localeCompare(b.index ?? "", "en", { numeric: true }) ||
    a.title.localeCompare(b.title, "he"))
}

/** What the browser is told a document is. */
export function docMimeType(name: string): string {
  switch (docExt(name)) {
    case ".html":
    case ".htm":  return "text/html; charset=utf-8"
    case ".pdf":  return "application/pdf"
    case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case ".doc":  return "application/msword"
    case ".xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case ".xls":  return "application/vnd.ms-excel"
    case ".csv":  return "text/csv; charset=utf-8"
    case ".md":
    case ".txt":  return "text/plain; charset=utf-8"
    default:      return "application/octet-stream"
  }
}

/**
 * A document opens in a new tab when the browser can show it — that is the
 * point of the shelf — and downloads otherwise. HTML gets a sandbox of a CSP
 * either way: these files are written by hand and served from our own origin,
 * so anything they could reach, they could reach as us (the lesson of the SVG
 * attachments in v3.84).
 */
export function docResponseHeaders(name: string, length: number): Record<string, string> {
  const ext = docExt(name)
  const inline = ext === ".html" || ext === ".htm" || ext === ".pdf" || ext === ".txt" || ext === ".md"
  const headers: Record<string, string> = {
    "Content-Type": docMimeType(name),
    "Content-Length": String(length),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    // Internal documents: never a shared cache, and no trace in one.
    "Cache-Control": "private, no-store",
  }
  if (ext === ".html" || ext === ".htm") {
    headers["Content-Security-Policy"] =
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
  }
  return headers
}
