/**
 * @jest-environment node
 */
/**
 * __tests__/docs.test.ts — the IT documentation shelf (v3.99).
 *
 * The shelf has no database behind it: a file in uploads/it-docs/ is a
 * document, and its NAME is the only thing describing it. So what is pinned
 * here is the reading of a name, and the one rule that matters for a directory
 * addressed by URL — a request can never leave it.
 */

import { mkdtemp, writeFile, mkdir } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import {
  docExt, isDocFile, docTitle, docGroupOf, sortDocs, docMimeType, docResponseHeaders, type DocFile,
} from "@/lib/docs"

describe("reading a document's name", () => {
  it("takes the number in front as the file's place in the set", () => {
    expect(docTitle("07_IDENTITY_GOOGLE_WORKSPACE_AND_ZOHO.docx"))
      .toEqual({ index: "07", title: "IDENTITY GOOGLE WORKSPACE AND ZOHO" })
  })

  it("leaves the case alone — these names are acronyms", () => {
    expect(docTitle("05_TELEPHONY_PBX_AND_VOICENTER.docx").title).toBe("TELEPHONY PBX AND VOICENTER")
  })

  it("reads a Hebrew name with no number as it is", () => {
    expect(docTitle("מדריך הקמת נציגים - Zoho Desk.html"))
      .toEqual({ index: null, title: "מדריך הקמת נציגים - Zoho Desk" })
  })

  it("files a numbered document with the infrastructure set and the rest as guides", () => {
    expect(docGroupOf("00_MASTER_IT_ECOSYSTEM_INDEX.docx")).toBe("infra")
    expect(docGroupOf("מדריך פתיחת משתמשים - Google Workspace Admin.html")).toBe("guides")
  })

  it("knows which files belong on the shelf", () => {
    expect(isDocFile("00_MASTER.docx")).toBe(true)
    expect(isDocFile("guide.HTML")).toBe(true)
    expect(isDocFile("notes.pdf")).toBe(true)
    expect(isDocFile("secrets.env")).toBe(false)
    expect(isDocFile("archive.zip")).toBe(false)
    expect(isDocFile("noextension")).toBe(false)
    expect(docExt("A.DocX")).toBe(".docx")
  })
})

describe("the order on the shelf", () => {
  const doc = (name: string): DocFile => {
    const { index, title } = docTitle(name)
    return { name, title, index, group: docGroupOf(name), ext: docExt(name), size: 1, updatedAt: "2026-09-29T00:00:00.000Z" }
  }

  it("puts the numbered set first, in its numbers, then the guides by name", () => {
    const shelf = sortDocs([
      doc("מדריך פתיחת משתמשים - Google Workspace Admin.html"),
      doc("09_SECURITY_OPERATIONS_AND_INCIDENT_RUNBOOK.docx"),
      doc("00_MASTER_IT_ECOSYSTEM_INDEX.docx"),
      doc("מדריך הקמת נציגים - Zoho Desk.html"),
      doc("02_NETWORK_TOPOLOGY_SUBNETS_AND_PRINTERS.docx"),
    ])
    expect(shelf.map(d => d.index ?? d.title)).toEqual([
      "00", "02", "09", "מדריך הקמת נציגים - Zoho Desk", "מדריך פתיחת משתמשים - Google Workspace Admin",
    ])
  })
})

describe("what the browser is told", () => {
  it("names the type of each kind", () => {
    expect(docMimeType("a.html")).toBe("text/html; charset=utf-8")
    expect(docMimeType("a.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(docMimeType("a.pdf")).toBe("application/pdf")
    expect(docMimeType("a.unknown")).toBe("application/octet-stream")
  })

  it("opens what a browser can show, and downloads the rest", () => {
    expect(docResponseHeaders("guide.html", 10)["Content-Disposition"]).toMatch(/^inline/)
    expect(docResponseHeaders("notes.pdf", 10)["Content-Disposition"]).toMatch(/^inline/)
    expect(docResponseHeaders("00_MASTER.docx", 10)["Content-Disposition"]).toMatch(/^attachment/)
  })

  it("carries a Hebrew filename through the header intact", () => {
    const name = "מדריך הקמת נציגים - Zoho Desk.html"
    expect(docResponseHeaders(name, 10)["Content-Disposition"]).toContain(encodeURIComponent(name))
  })

  // Served from our own origin: anything the document could reach, it could
  // reach as us. It may style itself and nothing else.
  it("sandboxes HTML with a CSP, and never sniffs a type", () => {
    const h = docResponseHeaders("guide.html", 10)
    expect(h["Content-Security-Policy"]).toContain("default-src 'none'")
    expect(h["Content-Security-Policy"]).toContain("style-src 'unsafe-inline'")
    expect(h["X-Content-Type-Options"]).toBe("nosniff")
    expect(h["Cache-Control"]).toBe("private, no-store")
  })
})

// ── the directory itself ──────────────────────────────────────────────────────

describe("listDocs / readDoc", () => {
  let dir = ""
  let listDocs: typeof import("@/lib/docStorage").listDocs
  let readDoc: typeof import("@/lib/docStorage").readDoc

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "helpdesk-docs-"))
    await mkdir(join(dir, "uploads", "it-docs"), { recursive: true })
    await writeFile(join(dir, "uploads", "it-docs", "00_MASTER_IT_ECOSYSTEM_INDEX.docx"), "docx")
    await writeFile(join(dir, "uploads", "it-docs", "מדריך הקמת נציגים - Zoho Desk.html"), "<p>שלום</p>")
    await writeFile(join(dir, "uploads", "it-docs", "notes.zip"), "not a document")
    // The file a traversal would be after, one level above the shelf.
    await writeFile(join(dir, "uploads", "secret.txt"), "TOP SECRET")
    jest.spyOn(process, "cwd").mockReturnValue(dir)
    ;({ listDocs, readDoc } = await import("@/lib/docStorage"))
  })

  afterAll(() => jest.restoreAllMocks())

  it("lists what belongs on the shelf and ignores the rest", async () => {
    const names = (await listDocs()).map(d => d.name).sort()
    expect(names).toEqual(["00_MASTER_IT_ECOSYSTEM_INDEX.docx", "מדריך הקמת נציגים - Zoho Desk.html"])
  })

  it("describes each file from its name and its stat", async () => {
    const docx = (await listDocs()).find(d => d.ext === ".docx")!
    expect(docx).toMatchObject({ index: "00", group: "infra", title: "MASTER IT ECOSYSTEM INDEX", size: 4 })
    expect(Date.parse(docx.updatedAt)).toBeGreaterThan(0)
  })

  it("reads a document by its name, Hebrew and all", async () => {
    expect((await readDoc("מדריך הקמת נציגים - Zoho Desk.html"))?.toString()).toBe("<p>שלום</p>")
    expect((await readDoc(encodeURIComponent("מדריך הקמת נציגים - Zoho Desk.html")))?.toString()).toBe("<p>שלום</p>")
  })

  // The one rule for a directory addressed by URL.
  it("never leaves the shelf", async () => {
    for (const attempt of [
      "../secret.txt", "..%2Fsecret.txt", "../../etc/passwd", "uploads/secret.txt",
      "..\\secret.txt", "/etc/passwd", ".env", "", ".",
    ]) {
      expect(await readDoc(attempt)).toBeNull()
    }
  })

  it("refuses a file that is not a document, even when it is there", async () => {
    expect(await readDoc("notes.zip")).toBeNull()
  })

  it("answers an empty shelf rather than failing when there is no directory", async () => {
    const empty = await mkdtemp(join(tmpdir(), "helpdesk-nodocs-"))
    jest.spyOn(process, "cwd").mockReturnValue(empty)
    expect(await listDocs()).toEqual([])
    jest.spyOn(process, "cwd").mockReturnValue(dir)
  })
})
