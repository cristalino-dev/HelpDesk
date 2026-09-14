/**
 * __tests__/mailAttachments.test.ts — which attachments on an inbound mail are
 * kept (v3.84). Until then every one was dropped without a word; now the
 * allowed ones are saved onto the ticket and the rest are named in it.
 */

import {
  planMailAttachments, droppedAttachmentsNote, MAX_MAIL_ATTACHMENTS, SIGNATURE_IMAGE_BYTES,
} from "@/lib/mailAttachments"
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachmentTypes"

const att = (filename: string | null, contentType: string, bytes = 1000, related = false) =>
  ({ filename, contentType, related, content: { length: bytes } })

describe("planMailAttachments", () => {
  it("keeps what the upload route would accept, with the type to store it under", () => {
    const plan = planMailAttachments([
      att("טופס.pdf", "application/pdf"),
      att("report.docx", "application/octet-stream"),   // mail clients love octet-stream
      att("list.csv", "application/vnd.ms-excel"),       // Windows' label for .csv
    ])
    expect(plan.dropped).toEqual([])
    expect(plan.keep).toEqual([
      { index: 0, filename: "טופס.pdf", mimeType: "application/pdf" },
      { index: 1, filename: "report.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { index: 2, filename: "list.csv", mimeType: "text/csv" },
    ])
  })

  it("skips the small inline images of a signature, without listing them", () => {
    const plan = planMailAttachments([att("image001.png", "image/png", SIGNATURE_IMAGE_BYTES - 1, true)])
    expect(plan).toEqual({ keep: [], dropped: [] })
  })

  it("keeps a large inline image — a screenshot pasted into the body", () => {
    const plan = planMailAttachments([att("image002.png", "image/png", 300_000, true)])
    expect(plan.keep).toHaveLength(1)
  })

  it("names what it will not keep, with the reason", () => {
    const plan = planMailAttachments([
      att("logo.svg", "image/svg+xml"),
      att("setup.exe", "application/octet-stream"),
      att("page.html", "text/html"),
      att("empty.pdf", "application/pdf", 0),
      att("huge.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1),
    ])
    expect(plan.keep).toEqual([])
    expect(plan.dropped.map(d => d.name)).toEqual(["logo.svg", "setup.exe", "page.html", "empty.pdf", "huge.pdf"])
    expect(plan.dropped[0].reason).toBe("סוג הקובץ אינו נתמך")
    expect(plan.dropped[3].reason).toBe("הקובץ ריק")
    expect(plan.dropped[4].reason).toContain("גדול מדי")
  })

  it(`keeps at most ${MAX_MAIL_ATTACHMENTS} and names the rest`, () => {
    const many = Array.from({ length: MAX_MAIL_ATTACHMENTS + 2 }, (_, i) => att(`scan${i}.pdf`, "application/pdf"))
    const plan = planMailAttachments(many)
    expect(plan.keep).toHaveLength(MAX_MAIL_ATTACHMENTS)
    expect(plan.dropped.map(d => d.name)).toEqual([`scan${MAX_MAIL_ATTACHMENTS}.pdf`, `scan${MAX_MAIL_ATTACHMENTS + 1}.pdf`])
  })

  it("names a nameless file it cannot keep", () => {
    expect(planMailAttachments([att(null, "application/zip")]).dropped[0].name).toBe("קובץ ללא שם")
  })

  it("is empty for a mail with no attachments", () => {
    expect(planMailAttachments(undefined)).toEqual({ keep: [], dropped: [] })
    expect(planMailAttachments([])).toEqual({ keep: [], dropped: [] })
  })
})

describe("droppedAttachmentsNote", () => {
  it("is empty when nothing was dropped", () => {
    expect(droppedAttachmentsNote([])).toBe("")
  })

  it("lists each dropped file with its reason under a heading", () => {
    const note = droppedAttachmentsNote([{ name: "logo.svg", reason: "סוג הקובץ אינו נתמך" }])
    expect(note).toBe("\n\n── קבצים מצורפים שלא נשמרו ──\n• logo.svg — סוג הקובץ אינו נתמך")
  })
})
