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
 *   סברובסקי - מספרי לקוח וכתובות משלוח.html
 *                                      → a Swarovski document (v3.106): the name
 *                                        starts with סברובסקי or Swarovski;
 *   מדריך הקמת נציגים - Zoho Desk.html → a working guide, ordered by name.
 *
 * Pure and client-safe: the panel, the viewer page (v3.104) and the route agree
 * because they all read this file, and it is unit-tested without a filesystem.
 */

/** What may sit on the shelf. Anything else in the directory is ignored. */
export const DOC_EXTENSIONS = [".html", ".htm", ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".md", ".txt"] as const

export const DOC_GROUPS = { infra: "תיעוד תשתיות IT", guides: "מדריכי עבודה", swarovski: "מסמכי סברובסקי" } as const

export type DocGroup = keyof typeof DOC_GROUPS

/** The order the sections are shown in, top to bottom. */
export const DOC_GROUP_ORDER: readonly DocGroup[] = ["infra", "guides", "swarovski"]

/**
 * The Hebrew name the shelf shows for a document whose file is named in English
 * (v3.104), keyed by the title docTitle() reads from that file. The files keep
 * their English names — the documents are written in English and the numbered
 * set refers to itself by them — so the Hebrew lives here. A document missing
 * from this list is shown by its English title, as before.
 */
export const DOC_TITLES_HE: Readonly<Record<string, string>> = {
  "MASTER IT ECOSYSTEM INDEX":                 "מפתח ראשי למערכות ה-IT",
  "CLOUD INFRASTRUCTURE AND SERVERS":          "תשתית ענן ושרתים",
  "NETWORK TOPOLOGY SUBNETS AND PRINTERS":     "טופולוגיית רשת, תת-רשתות ומדפסות",
  "BEZEQ CARRIER TRUNKS AND RETAIL CIRCUITS":  "קווי בזק ומעגלי תקשורת לסניפים",
  "RETAIL BRANCHES DIRECTORY AND HARDWARE":    "רשימת סניפים וחומרה",
  "TELEPHONY PBX AND VOICENTER":               "טלפוניה, מרכזייה ו-Voicenter",
  "ERP COMAX INTEGRATIONS AND AUTOMATION":     "ERP קומקס, אינטגרציות ואוטומציות",
  "IDENTITY GOOGLE WORKSPACE AND ZOHO":        "ניהול זהויות — Google Workspace ו-Zoho",
  "INTERNAL APPLICATIONS AND CODEBASES":       "אפליקציות פנימיות וקוד",
  "SECURITY OPERATIONS AND INCIDENT RUNBOOK":  "אבטחת מידע ונוהל טיפול באירועים",
}

/** One document, as the API hands it to the panel. */
export type DocFile = {
  /** The filename on disk — also the URL segment. */
  name: string
  title: string
  /** The Hebrew name from DOC_TITLES_HE, or null when the file has none. */
  titleHe: string | null
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

/** The name to show a person: the Hebrew one when there is one. */
export function docHebrewTitle(title: string): string | null {
  return DOC_TITLES_HE[title.toUpperCase()] ?? null
}

/**
 * A numbered file belongs to the infrastructure set; a name that starts with
 * סברובסקי or Swarovski to the Swarovski documents (v3.106); everything else is
 * a guide.
 */
export function docGroupOf(name: string): DocGroup {
  if (docTitle(name).index !== null) return "infra"
  if (/^(סברובסקי|swarovski)/i.test(name.trim())) return "swarovski"
  return "guides"
}

/** The shelf's order: section by section, the infrastructure set by its numbers, the rest by name. */
export function sortDocs(docs: readonly DocFile[]): DocFile[] {
  const rank = (d: DocFile) => DOC_GROUP_ORDER.indexOf(d.group)
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

/** What the browser can show by itself: HTML, PDF and plain text. */
export function docOpensInline(name: string): boolean {
  const ext = docExt(name)
  return ext === ".html" || ext === ".htm" || ext === ".pdf" || ext === ".txt" || ext === ".md"
}

/**
 * How the viewer page (app/admin/docs/[name], v3.104) shows a document:
 *
 *   "word"  — a .docx, drawn page by page in the browser (docx-preview), with
 *             its fonts, colours, shaded tables and lists as Word has them;
 *   "frame" — what the browser shows by itself, in a frame on the page;
 *   "none"  — no preview (.doc, Excel, CSV): the page offers the download.
 */
export type DocViewKind = "word" | "frame" | "none"

export function docViewKind(name: string): DocViewKind {
  if (docExt(name) === ".docx") return "word"
  return docOpensInline(name) ? "frame" : "none"
}

/** The shelf itself: the admin console, opened on its מסמכים tab (v3.105). */
export const DOCS_SHELF_HREF = "/admin?tab=docs"

/** The viewer page for a document — where the shelf links. */
export function docViewHref(name: string): string {
  return `/admin/docs/${encodeURIComponent(name)}`
}

/** The file itself; `download` asks for it as an attachment whatever its type. */
export function docFileHref(name: string, download = false): string {
  return `/api/admin/docs/${encodeURIComponent(name)}${download ? "?download=1" : ""}`
}

/**
 * A link inside a rendered Word document keeps its target only when it is an
 * address, a mail or phone link, or a place in the document. A .docx can carry
 * any string as a hyperlink — `javascript:` included — and the viewer draws it
 * on our own origin.
 */
export function isSafeDocLink(href: string): boolean {
  const h = href.trim()
  if (h.startsWith("#")) return true
  return /^(https?:|mailto:|tel:)/i.test(h)
}

/**
 * A document opens in the tab when the browser can show it — that is the point
 * of the shelf — and downloads otherwise, or whenever `download` asks (the
 * viewer's download button, v3.104). HTML gets a sandbox of a CSP either way:
 * these files are written by hand and served from our own origin, so anything
 * they could reach, they could reach as us (the lesson of the SVG attachments
 * in v3.84).
 */
export function docResponseHeaders(name: string, length: number, download = false): Record<string, string> {
  const ext = docExt(name)
  const inline = !download && docOpensInline(name)
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
