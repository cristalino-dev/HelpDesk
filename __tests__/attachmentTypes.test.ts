/**
 * __tests__/attachmentTypes.test.ts — what may be attached (v3.83).
 *
 * One list serves the picker, the server and mail ingestion. These tests pin
 * what is on it, what is deliberately NOT (SVG, which was a stored-XSS hole;
 * HTML; executables; HEIC), how a file's type is decided when browsers and
 * mail clients mislabel it, when a photo is shrunk, and how a failed upload is
 * explained to the person who tried it.
 */

import {
  MAX_ATTACHMENT_BYTES,
  ACCEPT_ATTRIBUTE,
  SHRINK_MAX_SIDE,
  SHRINK_ABOVE_BYTES,
  isAllowedType,
  isInlineImageType,
  mimeForFile,
  extensionOf,
  formatBytes,
  fileKind,
  shrinkPlan,
  describeUploadFailure,
} from "@/lib/attachmentTypes"

describe("the size limit", () => {
  // Uploads travel as base64 JSON; the limit must fit nginx's 10 MB body cap
  // with room to spare, or nginx rejects them silently the way it did at 1 MB.
  it("fits inside nginx's 10 MB body limit once base64-encoded", () => {
    const onTheWire = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 1024
    expect(onTheWire).toBeLessThan(10 * 1024 * 1024)
  })

  it("comfortably covers the 3.8 MB upload that was lost on Aug 23", () => {
    expect(MAX_ATTACHMENT_BYTES).toBeGreaterThan(3.8 * 1024 * 1024)
  })
})

describe("what is on the list", () => {
  it.each(["image/png", "image/jpeg", "image/gif", "image/webp"])("images: %s, shown inline", t => {
    expect(isAllowedType(t)).toBe(true)
    expect(isInlineImageType(t)).toBe(true)
  })

  it.each([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword", "application/vnd.ms-excel", "text/plain", "text/csv",
  ])("files: %s, never inline", t => {
    expect(isAllowedType(t)).toBe(true)
    expect(isInlineImageType(t)).toBe(false)
  })

  // SVG can carry <script>; served from our origin it ran with the viewer's
  // session. The rest are worse or unviewable.
  it.each(["image/svg+xml", "text/html", "application/x-msdownload", "application/zip", "image/heic", "application/javascript"])(
    "refuses %s", t => expect(isAllowedType(t)).toBe(false))

  it("ignores parameters and case", () => {
    expect(isAllowedType("Text/Plain; charset=utf-8")).toBe(true)
  })

  it("offers types and extensions to the picker, and never SVG", () => {
    expect(ACCEPT_ATTRIBUTE).toContain("image/png")
    expect(ACCEPT_ATTRIBUTE).toContain(".pdf")
    expect(ACCEPT_ATTRIBUTE).toContain(".docx")
    expect(ACCEPT_ATTRIBUTE).not.toMatch(/svg/i)
  })
})

describe("mimeForFile — deciding a file's type", () => {
  it("takes an allowed declared type as it is", () => {
    expect(mimeForFile("scan.pdf", "application/pdf")).toBe("application/pdf")
  })

  it("normalises image/jpg to image/jpeg", () => {
    expect(mimeForFile("a.jpg", "image/jpg")).toBe("image/jpeg")
  })

  // Mail clients send application/octet-stream for almost anything.
  it("falls back to the extension when the declared type is missing or generic", () => {
    expect(mimeForFile("הצעת מחיר.xlsx", "application/octet-stream"))
      .toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(mimeForFile("notes.TXT", "")).toBe("text/plain")
    expect(mimeForFile("photo.JPEG", undefined)).toBe("image/jpeg")
  })

  // Windows labels .csv as Excel.
  it("corrects the Windows .csv label", () => {
    expect(mimeForFile("report.csv", "application/vnd.ms-excel")).toBe("text/csv")
  })

  it("refuses a declared type that is not on the list, whatever the extension claims", () => {
    expect(mimeForFile("invoice.pdf", "text/html")).toBeNull()
    expect(mimeForFile("logo.svg", "image/svg+xml")).toBeNull()
  })

  it("refuses an unknown extension with a generic type", () => {
    expect(mimeForFile("setup.exe", "application/octet-stream")).toBeNull()
    expect(mimeForFile("noextension", "")).toBeNull()
  })
})

describe("small helpers", () => {
  it("extensionOf", () => {
    expect(extensionOf("Invoice.PDF")).toBe("pdf")
    expect(extensionOf("no-extension")).toBe("")
  })

  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(812 * 1024)).toBe("812 KB")
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB")
    expect(formatBytes(MAX_ATTACHMENT_BYTES)).toBe("7 MB")
  })

  it("fileKind labels each family", () => {
    expect(fileKind("application/pdf").label).toBe("PDF")
    expect(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document").label).toBe("Word")
    expect(fileKind("application/vnd.ms-excel").label).toBe("Excel")
    expect(fileKind("text/csv").label).toBe("CSV")
    expect(fileKind("application/octet-stream").label).toBe("קובץ")
  })
})

describe("shrinkPlan — when a photo is made smaller before upload", () => {
  it("leaves a small image alone", () => {
    expect(shrinkPlan(1280, 720, 300_000, "image/png")).toBeNull()
  })

  // The Aug 23 failure: a phone photo.
  it("shrinks a large photo to the maximum side, as JPEG", () => {
    expect(shrinkPlan(4032, 3024, 2_900_000, "image/jpeg"))
      .toEqual({ width: SHRINK_MAX_SIDE, height: 1500, mime: "image/jpeg" })
  })

  it("keeps a screenshot a PNG, so its text stays sharp", () => {
    expect(shrinkPlan(3840, 2160, 4_000_000, "image/png")?.mime).toBe("image/png")
  })

  it("re-encodes a heavy image even when its pixel size is fine", () => {
    expect(shrinkPlan(1800, 1200, SHRINK_ABOVE_BYTES + 1, "image/jpeg"))
      .toEqual({ width: 1800, height: 1200, mime: "image/jpeg" })
  })

  it("never touches a GIF (animation) or a non-image", () => {
    expect(shrinkPlan(4000, 4000, 5_000_000, "image/gif")).toBeNull()
    expect(shrinkPlan(4000, 4000, 5_000_000, "application/pdf")).toBeNull()
  })
})

describe("describeUploadFailure — in words for the person who tried", () => {
  // nginx answers 413 with an HTML page, never JSON.
  it("explains a 413 by the size limit, without needing a body", () => {
    expect(describeUploadFailure(413)).toBe("הקובץ גדול מדי (עד 7 MB)")
  })

  it("explains a refused type", () => {
    expect(describeUploadFailure(415)).toBe("סוג הקובץ אינו נתמך")
  })

  it("passes on the server's own message for other client errors", () => {
    expect(describeUploadFailure(400, "הקובץ פגום")).toBe("הקובץ פגום")
  })

  it("names a network failure as one", () => {
    expect(describeUploadFailure(null)).toMatch("שגיאת רשת")
  })

  it("falls back to the status code for a server error", () => {
    expect(describeUploadFailure(500, "Server error")).toBe("שגיאה בהעלאה (500)")
  })
})
