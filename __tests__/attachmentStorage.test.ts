/**
 * __tests__/attachmentStorage.test.ts
 *
 * Tests for the pure helpers in lib/attachmentStorage.ts — the parsing and
 * naming logic behind filesystem-stored ticket attachments (v3.48).
 * The fs wrappers are thin and exercised in production; what matters here is
 * that the data-URL parser accepts exactly what the upload route should
 * accept and rejects everything else.
 */

import {
  parseImageDataUrl, extensionForMime, buildAttachmentName, attachmentDiskPath, attachmentsDir,
} from "@/lib/attachmentStorage"
import path from "path"

// A real 1x1 transparent PNG, base64-encoded.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const PNG_DATAURL = `data:image/png;base64,${PNG_B64}`

describe("parseImageDataUrl", () => {
  it("parses a valid PNG data URL into mime type and bytes", () => {
    const parsed = parseImageDataUrl(PNG_DATAURL)
    expect(parsed).not.toBeNull()
    expect(parsed!.mimeType).toBe("image/png")
    expect(parsed!.buffer.length).toBeGreaterThan(0)
    // PNG magic bytes
    expect(parsed!.buffer[0]).toBe(0x89)
    expect(parsed!.buffer.subarray(1, 4).toString("ascii")).toBe("PNG")
  })

  it("accepts an uppercase subtype and lowercases the mime type", () => {
    const parsed = parseImageDataUrl(`data:image/PNG;base64,${PNG_B64}`)
    expect(parsed).not.toBeNull()
    expect(parsed!.mimeType).toBe("image/png")
  })

  it("rejects non-image data URLs", () => {
    expect(parseImageDataUrl(`data:text/html;base64,${PNG_B64}`)).toBeNull()
    expect(parseImageDataUrl(`data:application/pdf;base64,${PNG_B64}`)).toBeNull()
  })

  it("rejects non-base64 data URLs", () => {
    expect(parseImageDataUrl("data:image/png,rawpixels")).toBeNull()
    expect(parseImageDataUrl("data:image/svg+xml;utf8,<svg/>")).toBeNull()
  })

  it("rejects garbage and empty input", () => {
    expect(parseImageDataUrl("")).toBeNull()
    expect(parseImageDataUrl("not a data url")).toBeNull()
    expect(parseImageDataUrl("https://example.com/x.png")).toBeNull()
    expect(parseImageDataUrl("data:image/png;base64,")).toBeNull()
  })
})

describe("extensionForMime", () => {
  it("maps common image types", () => {
    expect(extensionForMime("image/png")).toBe("png")
    expect(extensionForMime("image/jpeg")).toBe("jpg")
    expect(extensionForMime("image/webp")).toBe("webp")
    expect(extensionForMime("image/svg+xml")).toBe("svg")
  })

  it("is case-insensitive and falls back to bin", () => {
    expect(extensionForMime("IMAGE/PNG")).toBe("png")
    expect(extensionForMime("image/x-weird")).toBe("bin")
  })
})

describe("buildAttachmentName", () => {
  it("produces unique uuid.ext names", () => {
    const a = buildAttachmentName("image/png")
    const b = buildAttachmentName("image/png")
    expect(a).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(a).not.toBe(b)
  })
})

describe("attachmentDiskPath", () => {
  it("resolves inside the attachments directory", () => {
    const p = attachmentDiskPath("abc.png")
    expect(p).toBe(path.join(attachmentsDir(), "abc.png"))
  })

  it("defends against path traversal in storedName", () => {
    const p = attachmentDiskPath("../../etc/passwd")
    expect(p.startsWith(attachmentsDir())).toBe(true)
    expect(p).toBe(path.join(attachmentsDir(), "passwd"))
  })
})
