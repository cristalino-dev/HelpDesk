/**
 * __tests__/selectValues.test.ts — a dropdown submits the value in the code,
 * whatever the browser shows (v3.99).
 *
 * An `<option>` with no `value` attribute submits its own TEXT. Chrome's page
 * translation rewrites that text, so a translated page filed HDTC-738 with
 * urgency "urgent" instead of "דחוף" — the queue drew it without a colour, the
 * urgency sort did not know where to put it, and the reports could not count
 * it. Every one of these values is a Hebrew business value compared by string
 * across the app (status, urgency, category, platform), so the browser must
 * not be able to change it.
 *
 * Two lines of defence, both pinned here: every option carries its value, and
 * knownValue() replaces anything the field does not allow.
 */

import { readFileSync, readdirSync } from "fs"
import { join, relative } from "path"
import { knownValue, DEFAULT_URGENCIES } from "@/lib/fieldOptions"

const ROOT = process.cwd()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sourceFiles(full)
    return /\.tsx$/.test(e.name) ? [full] : []
  })
}

const OPTION_TAG = /<option\b[^>]*>/g

describe("every <option> carries its own value", () => {
  const files = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components"))]

  it("finds the files to check", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("leaves none submitting its text instead", () => {
    const offenders = files.flatMap(file =>
      [...readFileSync(file, "utf8").matchAll(OPTION_TAG)]
        .filter(m => !/\bvalue=/.test(m[0]))
        .map(m => `${relative(ROOT, file)}: ${m[0]}`))
    expect(offenders).toEqual([])
  })
})

describe("knownValue", () => {
  it("keeps a value the field allows", () => {
    expect(knownValue("דחוף", DEFAULT_URGENCIES, "בינוני")).toBe("דחוף")
  })

  it("replaces the translated word a form submitted", () => {
    expect(knownValue("urgent", DEFAULT_URGENCIES, "בינוני")).toBe("בינוני")
  })

  it("trims before deciding", () => {
    expect(knownValue("  גבוה  ", DEFAULT_URGENCIES, "בינוני")).toBe("גבוה")
  })

  it("replaces anything that is not a string, and the empty string", () => {
    expect(knownValue(undefined, DEFAULT_URGENCIES, "בינוני")).toBe("בינוני")
    expect(knownValue(null, DEFAULT_URGENCIES, "בינוני")).toBe("בינוני")
    expect(knownValue(7, DEFAULT_URGENCIES, "בינוני")).toBe("בינוני")
    expect(knownValue("", DEFAULT_URGENCIES, "בינוני")).toBe("בינוני")
  })

  it("checks against the list it is given, not a hardcoded one", () => {
    expect(knownValue("קריטי", ["קריטי", "רגיל"], "רגיל")).toBe("קריטי")
    expect(knownValue("דחוף", ["קריטי", "רגיל"], "רגיל")).toBe("רגיל")
  })
})
