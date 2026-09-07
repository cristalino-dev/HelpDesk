/**
 * lib/xlsx.ts — a minimal, dependency-free .xlsx writer
 *
 * WHY NOT CSV
 * ───────────
 * Excel mangles this particular dataset. A phone number like `0528287036` loses
 * its leading zero the moment Excel decides the column is numeric, and Hebrew
 * arrives as mojibake unless the file carries a UTF-8 BOM that half the tools
 * downstream then choke on. A real workbook lets each cell declare its own type,
 * so a phone number stays the string it is.
 *
 * WHY NOT A LIBRARY
 * ─────────────────
 * The alternatives are large, and one of them (SheetJS) is no longer published
 * to npm at all. A workbook this simple — one sheet, strings and numbers, no
 * formulas, no styling — is a zip of five small XML files. That is what this is.
 *
 * WHY THE ZIP IS UNCOMPRESSED
 * ───────────────────────────
 * Every entry is STORED (method 0), so no DEFLATE implementation is needed and
 * the same code runs in the browser and in Node. Node's zlib is not available in
 * a client component, and shipping a pure-JS deflate to save a few kilobytes on
 * a file someone downloads once would be a poor trade. A few thousand tickets
 * come out around a megabyte; Excel does not care.
 *
 * WHY DATES ARE STRINGS
 * ─────────────────────
 * Real Excel dates are serial numbers plus a `styles.xml` number format, which
 * is most of the remaining complexity of the format. `YYYY-MM-DD HH:mm` sorts
 * lexicographically in exactly the same order it sorts chronologically, so a
 * text column behaves correctly in a sort or a filter without any of that. The
 * one thing it will not do is arithmetic between two dates.
 */

export type CellValue = string | number | null | undefined

/** One column: a header, and how to read it off a row. */
export type Column<T> = {
  header: string
  /** Return a number for numeric cells; anything else is written as text. */
  value: (row: T) => CellValue
}

// ── XML ─────────────────────────────────────────────────────────────────────

/**
 * Escape text for XML, and drop the control characters XML 1.0 forbids
 * outright — a stray 0x00 from pasted content makes the whole workbook
 * unopenable, which is a worse failure than losing one invisible character.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let n = index, out = ""
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

function cellXml(ref: string, v: CellValue): string {
  if (v === null || v === undefined || v === "") return `<c r="${ref}"/>`
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`
  // inlineStr rather than a shared-string table: the table is an optimisation
  // for repeated text, and it doubles the number of moving parts here.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`
}

function sheetXml<T>(columns: Column<T>[], rows: T[]): string {
  const header = columns
    .map((c, i) => cellXml(`${columnLetter(i)}1`, c.header))
    .join("")

  const body = rows.map((row, r) => {
    const cells = columns
      .map((c, i) => cellXml(`${columnLetter(i)}${r + 2}`, c.value(row)))
      .join("")
    return `<row r="${r + 2}">${cells}</row>`
  }).join("")

  // rightToLeft="1" — the readers are Hebrew, and a sheet that opens with
  // column A on the left reads backwards to them.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView rightToLeft="1" tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetData><row r="1">${header}</row>${body}</sheetData>
<autoFilter ref="A1:${columnLetter(Math.max(0, columns.length - 1))}${rows.length + 1}"/>
</worksheet>`
}

// ── ZIP ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

const utf8 = (s: string) => new TextEncoder().encode(s)

type Entry = { name: string; data: Uint8Array }

/** Build a ZIP archive with every entry STORED. */
function zip(entries: Entry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (n: number) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF])
  const u32 = (n: number) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF])
  const cat = (parts: Uint8Array[]) => {
    const total = parts.reduce((a, p) => a + p.length, 0)
    const out = new Uint8Array(total)
    let at = 0
    for (const p of parts) { out.set(p, at); at += p.length }
    return out
  }

  for (const e of entries) {
    const name = utf8(e.name)
    const crc = crc32(e.data)
    // Flag 0x0800 marks the filename as UTF-8. Times are zeroed: a fixed
    // timestamp keeps the output byte-identical for identical input, which is
    // what makes it testable.
    const local = cat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(name.length), u16(0), name,
    ])
    chunks.push(local, e.data)

    central.push(cat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), name,
    ]))
    offset += local.length + e.data.length
  }

  const cd = cat(central)
  const eocd = cat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  ])
  return cat([...chunks, cd, eocd])
}

// ── The workbook ────────────────────────────────────────────────────────────

/**
 * Build a single-sheet .xlsx.
 *
 * @param sheetName  Shown on the tab. Excel forbids : \\ / ? * [ ] and caps it
 *                   at 31 characters; both are enforced here rather than
 *                   producing a file Excel refuses to open.
 */
export function buildXlsx<T>(columns: Column<T>[], rows: T[], sheetName = "Sheet1"): Uint8Array {
  const safeName = (sheetName.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet1").slice(0, 31)

  return zip([
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(safeName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    },
    { name: "xl/worksheets/sheet1.xml", data: utf8(sheetXml(columns, rows)) },
  ])
}

/** The MIME type Excel expects. */
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
