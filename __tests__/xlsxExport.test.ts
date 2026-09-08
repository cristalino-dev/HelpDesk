/**
 * __tests__/xlsxExport.test.ts — the workbook writer and what goes in it
 *
 * The reason this is a real .xlsx and not a CSV is one column: a phone number
 * like "0528287036" loses its leading zero the moment Excel decides a column is
 * numeric. That is asserted directly, because it is the whole argument for
 * carrying a zip writer in the repository.
 *
 * The rest is structural. A workbook that is a byte wrong is not "slightly
 * broken" — Excel refuses to open it and reports nothing useful — so the zip
 * signature, the entry list and the XML are all pinned, and the assertions read
 * the file back rather than trusting the code that produced it.
 */

import { inflateSync } from "zlib"
import { buildXlsx, crc32, columnLetter, xmlEscape, XLSX_MIME, type Column } from "@/lib/xlsx"
import {
  EXPORT_COLUMNS, applyScope, parseScope, exportFilename, sheetName,
  formatDateTime, hoursToClose, closedAtCell, CLOSED_DATE_UNKNOWN, type ExportRow,
} from "@/lib/reportExport"

// ── A tiny zip reader, so the assertions read the file, not the writer ───────

type Parsed = Record<string, string>

/** Read a STORED-entry zip back into { name: text }. */
function readZip(bytes: Uint8Array): Parsed {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Parsed = {}
  let i = 0
  while (i < bytes.length - 4) {
    if (dv.getUint32(i, true) !== 0x04034b50) break
    const method = dv.getUint16(i + 8, true)
    const size = dv.getUint32(i + 18, true)
    const nameLen = dv.getUint16(i + 26, true)
    const extraLen = dv.getUint16(i + 28, true)
    const name = new TextDecoder().decode(bytes.slice(i + 30, i + 30 + nameLen))
    const start = i + 30 + nameLen + extraLen
    const raw = bytes.slice(start, start + size)
    out[name] = new TextDecoder().decode(method === 0 ? raw : inflateSync(Buffer.from(raw)))
    i = start + size
  }
  return out
}

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  ticketNumber: 565,
  subject: "כונן G (גוגל דרייב) לא זמין",
  description: "לא נטען",
  status: "פתוח", urgency: "בינוני", category: "אחר", platform: "מחשב אישי",
  submitterName: "משה בר עוז", submitterEmail: "moshe.ba@cristalino.co.il",
  phone: "0528287036", computerName: "", assignedTo: "helpdesk@cristalino.co.il",
  createdAt: "2026-09-01T09:00:00.000Z", closedAt: null,
  ...over,
})

const cols: Column<{ a: string; n: number }>[] = [
  { header: "טקסט", value: r => r.a },
  { header: "מספר", value: r => r.n },
]

describe("the file really is a workbook", () => {
  const file = buildXlsx(cols, [{ a: "שלום", n: 42 }], "גיליון")
  const parts = readZip(file)

  it("starts with the zip signature", () => {
    expect([file[0], file[1], file[2], file[3]]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it("contains exactly the five parts Excel requires", () => {
    expect(Object.keys(parts).sort()).toEqual([
      "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml", "xl/worksheets/sheet1.xml",
    ])
  })

  it("writes complete XML in every part", () => {
    for (const xml of Object.values(parts)) {
      expect(xml.startsWith("<?xml")).toBe(true)
      // Catches the truncation an off-by-one in the zip offsets produces.
      expect(xml.trim().endsWith(">")).toBe(true)
    }
  })

  it("names the sheet, and sets it right-to-left for Hebrew readers", () => {
    expect(parts["xl/workbook.xml"]).toContain('name="גיליון"')
    expect(parts["xl/worksheets/sheet1.xml"]).toContain('rightToLeft="1"')
  })

  it("freezes the header row and turns on the filter", () => {
    const sheet = parts["xl/worksheets/sheet1.xml"]
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain("<autoFilter")
  })

  it("declares the MIME type Excel expects", () => {
    expect(XLSX_MIME).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })
})

describe("cells keep their type", () => {
  it("writes a phone number as TEXT — the whole reason this is not a CSV", () => {
    const file = buildXlsx(EXPORT_COLUMNS, [row({ phone: "0528287036" })], "s")
    const sheet = readZip(file)["xl/worksheets/sheet1.xml"]
    // As an inline string the leading zero survives; as a number it would not.
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">0528287036</t>')
  })

  it("writes the ticket number as a NUMBER, so it sorts numerically", () => {
    const file = buildXlsx(EXPORT_COLUMNS, [row({ ticketNumber: 565 })], "s")
    expect(readZip(file)["xl/worksheets/sheet1.xml"]).toContain("<v>565</v>")
  })

  it("leaves an empty cell empty rather than writing 'null' into it", () => {
    const file = buildXlsx(EXPORT_COLUMNS, [row({ computerName: "" })], "s")
    const sheet = readZip(file)["xl/worksheets/sheet1.xml"]
    expect(sheet).not.toContain("null")
    expect(sheet).not.toContain("undefined")
  })

  it("escapes free text instead of producing a corrupt file", () => {
    const file = buildXlsx(EXPORT_COLUMNS, [row({ subject: 'תקלה <b>&</b> "מרכאות"' })], "s")
    const sheet = readZip(file)["xl/worksheets/sheet1.xml"]
    expect(sheet).toContain("&lt;b&gt;&amp;&lt;/b&gt;")
    expect(sheet).not.toContain("<b>")
  })

  it("strips the control characters XML forbids, and keeps the ones it allows", () => {
    // A stray NUL from pasted content makes the whole workbook unopenable.
    expect(xmlEscape("a\u0000b\u0001c")).toBe("abc")
    expect(xmlEscape("keeps\nnewlines\tand tabs")).toBe("keeps\nnewlines\tand tabs")
  })
})

describe("the plumbing", () => {
  it("computes the standard CRC32 check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xCBF43926)
  })

  it("numbers columns past Z", () => {
    expect(columnLetter(0)).toBe("A")
    expect(columnLetter(25)).toBe("Z")
    expect(columnLetter(26)).toBe("AA")
    expect(columnLetter(51)).toBe("AZ")
  })

  it("survives a sheet with no rows", () => {
    const parts = readZip(buildXlsx(EXPORT_COLUMNS, [], "ריק"))
    expect(parts["xl/worksheets/sheet1.xml"]).toContain('<row r="1">')
  })

  it("sanitises a sheet name Excel would reject", () => {
    const parts = readZip(buildXlsx(cols, [], "a/b:c*d?e[f]g"))
    expect(parts["xl/workbook.xml"]).not.toMatch(/name="[^"]*[/:*?[\]]/)
  })

  it("truncates a sheet name past Excel's 31-character limit", () => {
    const parts = readZip(buildXlsx(cols, [], "x".repeat(60)))
    const name = /name="([^"]*)"/.exec(parts["xl/workbook.xml"])![1]
    expect(name.length).toBeLessThanOrEqual(31)
  })
})

describe("what the export contains", () => {
  it("carries the fields the thin reports payload does not", () => {
    const headers = EXPORT_COLUMNS.map(c => c.header)
    for (const h of ["נושא", "מגיש", "טלפון", "נפתחה", "נסגרה"]) expect(headers).toContain(h)
  })

  it("formats dates so they sort chronologically as text", () => {
    // 09:00 UTC is midday in Israel, comfortably clear of a date boundary.
    expect(formatDateTime("2026-09-01T09:00:00Z")).toBe("2026-09-01 12:00")
    expect(formatDateTime(null)).toBe("")
    expect(formatDateTime("nonsense")).toBe("")
  })

  it("reports hours to close, and nothing while the ticket is open", () => {
    expect(hoursToClose(row({ closedAt: "2026-09-01T13:00:00.000Z" }))).toBe(4)
    expect(hoursToClose(row())).toBeNull()
  })
})

describe("scopes", () => {
  const rows = [
    row({ ticketNumber: 1, createdAt: "2026-08-01T09:00:00Z" }),
    row({ ticketNumber: 2, createdAt: "2026-09-02T09:00:00Z" }),
    row({ ticketNumber: 3, createdAt: "2026-09-20T09:00:00Z" }),
  ]
  const q = (s: string) => parseScope(new URLSearchParams(s))

  it("defaults to everything", () => {
    expect(q("")).toEqual({ kind: "all" })
    expect(applyScope(rows, { kind: "all" })).toHaveLength(3)
  })

  it("keeps only what was opened inside the range", () => {
    const scope = q("scope=range&from=2026-09-01&to=2026-09-30")
    expect(scope).toEqual({ kind: "range", from: "2026-09-01", to: "2026-09-30" })
    expect(applyScope(rows, scope as never).map(r => r.ticketNumber)).toEqual([2, 3])
  })

  it("picks out a single ticket", () => {
    const scope = q("scope=ticket&ticket=2")
    expect(applyScope(rows, scope as never).map(r => r.ticketNumber)).toEqual([2])
  })

  it("refuses a bad ticket number rather than silently exporting everything", () => {
    // Asking for one ticket and receiving all of them would be a lie.
    expect(q("scope=ticket&ticket=abc")).toHaveProperty("error")
    expect(q("scope=ticket&ticket=-3")).toHaveProperty("error")
    expect(q("scope=ticket")).toHaveProperty("error")
  })

  it("refuses a malformed or inverted range", () => {
    expect(q("scope=range&from=nope&to=2026-09-30")).toHaveProperty("error")
    expect(q("scope=range&from=2026-09-30&to=2026-09-01")).toHaveProperty("error")
  })

  it("falls back to everything for an unrecognised scope", () => {
    expect(q("scope=banana")).toEqual({ kind: "all" })
  })

  it("names the file after what is in it", () => {
    expect(exportFilename({ kind: "all" }, "2026-09-07")).toBe("helpdesk-tickets-all-2026-09-07.xlsx")
    expect(exportFilename({ kind: "range", from: "2026-08-01", to: "2026-08-31" }))
      .toBe("helpdesk-tickets-2026-08-01_2026-08-31.xlsx")
    expect(exportFilename({ kind: "ticket", ticketNumber: 565 })).toBe("helpdesk-HDTC-565.xlsx")
  })

  it("names the sheet after it too", () => {
    expect(sheetName({ kind: "all" })).toBe("כל הפניות")
    expect(sheetName({ kind: "ticket", ticketNumber: 565 })).toBe("HDTC-565")
  })
})


describe("the closing-date column has three states, not two", () => {
  /**
   * The reported symptom: "the export sometimes has no closing date". A blank
   * cell was doing two jobs — "still open" and "closed, but nobody recorded
   * when" — so the column looked broken rather than incomplete.
   *
   * The second case is real and has three causes, counted by
   * scripts/audit-close-dates.mjs: tickets closed before TicketHistory existed
   * (migration 20260426071446, while tickets date from 20260407073347), closes
   * whose history row was lost because the two writes were not atomic, and
   * closes made directly in the database.
   */
  it("shows the date when there is one", () => {
    expect(closedAtCell(row({ status: "סגור", closedAt: "2026-09-02T09:00:00Z" })))
      .toBe("2026-09-02 12:00")
  })

  it("leaves the cell EMPTY for a ticket that is still open", () => {
    expect(closedAtCell(row({ status: "פתוח", closedAt: null }))).toBe("")
    expect(closedAtCell(row({ status: "בטיפול", closedAt: null }))).toBe("")
    expect(closedAtCell(row({ status: "בהמתנה", closedAt: null }))).toBe("")
  })

  it("says so explicitly for a CLOSED ticket with no recorded date", () => {
    // Blank here is what made the column look untrustworthy.
    expect(closedAtCell(row({ status: "סגור", closedAt: null }))).toBe(CLOSED_DATE_UNKNOWN)
  })

  it("puts that note in the workbook, where a reader will see it", () => {
    const file = buildXlsx(EXPORT_COLUMNS, [row({ status: "סגור", closedAt: null })], "s")
    expect(readZip(file)["xl/worksheets/sheet1.xml"]).toContain(CLOSED_DATE_UNKNOWN)
  })

  it("still reports no handling time for such a ticket, rather than a wrong one", () => {
    expect(hoursToClose(row({ status: "סגור", closedAt: null }))).toBeNull()
  })
})
