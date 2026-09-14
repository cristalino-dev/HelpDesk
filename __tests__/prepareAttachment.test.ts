/**
 * __tests__/prepareAttachment.test.ts — a picked, dropped or pasted file on its
 * way to the upload route (v3.84): typed the way the server will type it,
 * refused early with a reason when the server would refuse it, and never
 * dropped without a word — which is what happened to every non-image before.
 *
 * jsdom has no createImageBitmap or canvas, so images go through unshrunk
 * here; that fallback is exactly the path under test for them.
 */

import { prepareAttachment, prepareAttachments, dataUrlBytes, withMime } from "@/lib/prepareAttachment"
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachmentTypes"

const fileOf = (name: string, type: string, bytes = 100) =>
  new File([new Uint8Array(bytes).fill(65)], name, { type })

describe("prepareAttachment", () => {
  it("accepts a PDF: typed, measured, and declared in its data URL", async () => {
    const r = await prepareAttachment(fileOf("חשבונית.pdf", "application/pdf", 300))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.item).toMatchObject({ filename: "חשבונית.pdf", mimeType: "application/pdf", size: 300 })
    expect(r.item.dataUrl.startsWith("data:application/pdf;base64,")).toBe(true)
  })

  it("types a file the browser could not, from its extension", async () => {
    const r = await prepareAttachment(fileOf("report.xlsx", ""))
    expect(r.ok && r.item.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(r.ok && r.item.dataUrl.startsWith("data:application/vnd.openxmlformats")).toBe(true)
  })

  it("refuses a type that is not on the list, naming the extension", async () => {
    const r = await prepareAttachment(fileOf("setup.exe", "application/x-msdownload"))
    expect(r).toEqual({ ok: false, name: "setup.exe", reason: expect.stringContaining(".exe") })
  })

  it("refuses SVG — it can carry script", async () => {
    expect((await prepareAttachment(fileOf("logo.svg", "image/svg+xml"))).ok).toBe(false)
  })

  it("refuses a non-image over the limit", async () => {
    const big = fileOf("scan.pdf", "application/pdf", 10)
    Object.defineProperty(big, "size", { value: MAX_ATTACHMENT_BYTES + 1 })
    const r = await prepareAttachment(big)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("גדול מדי")
  })

  it("refuses an empty file", async () => {
    const r = await prepareAttachment(fileOf("empty.pdf", "application/pdf", 0))
    expect(r).toEqual({ ok: false, name: "empty.pdf", reason: "הקובץ ריק" })
  })

  it("sends an image as it is where the browser cannot shrink it", async () => {
    const r = await prepareAttachment(fileOf("shot.png", "image/png", 120))
    expect(r.ok && r.item).toMatchObject({ filename: "shot.png", mimeType: "image/png", size: 120 })
  })

  it("names a nameless file with the fallback", async () => {
    const r = await prepareAttachment(fileOf("", "image/png"), "screenshot.png")
    expect(r.ok && r.item.filename).toBe("screenshot.png")
  })
})

describe("prepareAttachments", () => {
  it("returns what can be attached and what cannot, in one go", async () => {
    const { items, failures } = await prepareAttachments([
      fileOf("a.pdf", "application/pdf"),
      fileOf("b.exe", "application/x-msdownload"),
      fileOf("c.png", "image/png"),
    ])
    expect(items.map(i => i.filename)).toEqual(["a.pdf", "c.png"])
    expect(failures.map(f => f.name)).toEqual(["b.exe"])
  })
})

describe("dataUrlBytes and withMime", () => {
  it("counts the decoded bytes, padding included", () => {
    expect(dataUrlBytes("data:text/plain;base64,YQ==")).toBe(1)
    expect(dataUrlBytes("data:text/plain;base64,YWI=")).toBe(2)
    expect(dataUrlBytes("data:text/plain;base64,YWJj")).toBe(3)
    expect(dataUrlBytes("not a data url")).toBe(0)
  })

  it("re-declares the type and keeps the bytes", () => {
    expect(withMime("data:application/octet-stream;base64,YWJj", "application/pdf")).toBe("data:application/pdf;base64,YWJj")
  })
})
