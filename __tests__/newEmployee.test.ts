/**
 * __tests__/newEmployee.test.ts
 *
 * Unit tests for lib/newEmployee.ts — the four mandatory details of an
 * onboarding ticket and the block they are written into the description as.
 *
 * The behaviours that matter:
 *   - a blank or whitespace-only field is caught, wherever it comes from
 *   - the block written into the description can be read back out unchanged
 *   - re-writing the block replaces it instead of stacking duplicates, so an
 *     edited-then-saved ticket never grows a second copy
 *   - stripping the block leaves exactly what the user originally typed
 */

export {}

import {
  NEW_EMPLOYEE_FIELDS,
  NEW_EMPLOYEE_BLOCK_HEADER,
  EMPTY_NEW_EMPLOYEE,
  MAX_VALUE_LENGTH,
  normalizeNewEmployee,
  missingNewEmployeeFields,
  missingFieldLabels,
  isNewEmployeeComplete,
  formatNewEmployeeBlock,
  stripNewEmployeeBlock,
  withNewEmployeeDetails,
  parseNewEmployeeBlock,
  newEmployeeFullName,
} from "@/lib/newEmployee"

const full = {
  firstName: "דני",
  lastName:  "כהן",
  phone:     "050-1234567",
  jobTitle:  "נציג מכירות, סניף מרכז",
}

// ── Field definitions ────────────────────────────────────────────────────────

describe("field definitions", () => {
  it("collects exactly the four facts the technician needs", () => {
    expect(NEW_EMPLOYEE_FIELDS.map(f => f.key))
      .toEqual(["firstName", "lastName", "phone", "jobTitle"])
  })

  it("labels them in Hebrew", () => {
    expect(NEW_EMPLOYEE_FIELDS.map(f => f.label))
      .toEqual(["שם פרטי", "שם משפחה", "טלפון", "תיאור תפקיד"])
  })

  it("starts blank", () => {
    expect(Object.values(EMPTY_NEW_EMPLOYEE).every(v => v === "")).toBe(true)
  })
})

// ── normalizeNewEmployee ─────────────────────────────────────────────────────

describe("normalizeNewEmployee", () => {
  it("keeps clean values as they are", () => {
    expect(normalizeNewEmployee(full)).toEqual(full)
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeNewEmployee({ ...full, firstName: "  דני  " }).firstName).toBe("דני")
  })

  it("collapses a pasted multi-line value to one line", () => {
    // Keeps the block parseable — a newline inside a value would break it.
    const result = normalizeNewEmployee({ ...full, jobTitle: "מנהל\nמשמרת   ערב" })
    expect(result.jobTitle).toBe("מנהל משמרת ערב")
  })

  it("caps an absurdly long value", () => {
    const result = normalizeNewEmployee({ ...full, jobTitle: "א".repeat(500) })
    expect(result.jobTitle).toHaveLength(MAX_VALUE_LENGTH)
  })

  it("always returns all four keys, even from an empty payload", () => {
    expect(normalizeNewEmployee({})).toEqual(EMPTY_NEW_EMPLOYEE)
  })

  it("survives junk input", () => {
    expect(normalizeNewEmployee(undefined)).toEqual(EMPTY_NEW_EMPLOYEE)
    expect(normalizeNewEmployee(null)).toEqual(EMPTY_NEW_EMPLOYEE)
    expect(normalizeNewEmployee("דני")).toEqual(EMPTY_NEW_EMPLOYEE)
    expect(normalizeNewEmployee(42)).toEqual(EMPTY_NEW_EMPLOYEE)
  })

  it("ignores keys it does not know", () => {
    const result = normalizeNewEmployee({ ...full, salary: "20000" }) as Record<string, string>
    expect(result.salary).toBeUndefined()
  })

  it("stringifies a non-string value rather than dropping it", () => {
    expect(normalizeNewEmployee({ ...full, phone: 501234567 }).phone).toBe("501234567")
  })
})

// ── Validation ───────────────────────────────────────────────────────────────

describe("missingNewEmployeeFields", () => {
  it("is empty when everything is filled", () => {
    expect(missingNewEmployeeFields(full)).toEqual([])
    expect(isNewEmployeeComplete(full)).toBe(true)
  })

  it("names every blank field", () => {
    expect(missingNewEmployeeFields({ ...EMPTY_NEW_EMPLOYEE, firstName: "דני" }))
      .toEqual(["lastName", "phone", "jobTitle"])
  })

  it("treats a whitespace-only value as missing", () => {
    // The browser's own `required` happily accepts a single space.
    expect(missingNewEmployeeFields({ ...full, lastName: "   " })).toEqual(["lastName"])
    expect(isNewEmployeeComplete({ ...full, lastName: "   " })).toBe(false)
  })

  it("reports the Hebrew labels for the error message", () => {
    expect(missingFieldLabels({ ...full, phone: "", jobTitle: "" }))
      .toEqual(["טלפון", "תיאור תפקיד"])
  })
})

// ── Formatting into the description ──────────────────────────────────────────

describe("formatNewEmployeeBlock", () => {
  it("opens with the header line", () => {
    expect(formatNewEmployeeBlock(full).split("\n")[0]).toBe(NEW_EMPLOYEE_BLOCK_HEADER)
  })

  it("writes one labelled line per field, in order", () => {
    expect(formatNewEmployeeBlock(full).split("\n").slice(1)).toEqual([
      "שם פרטי: דני",
      "שם משפחה: כהן",
      "טלפון: 050-1234567",
      "תיאור תפקיד: נציג מכירות, סניף מרכז",
    ])
  })
})

describe("withNewEmployeeDetails", () => {
  it("keeps what the user wrote and appends the block", () => {
    const result = withNewEmployeeDetails("צריך לפתוח משתמשים לעובד שמתחיל ביום ראשון", full)
    expect(result.startsWith("צריך לפתוח משתמשים לעובד שמתחיל ביום ראשון")).toBe(true)
    expect(result).toContain("שם פרטי: דני")
  })

  it("separates the block from the description with a blank line", () => {
    expect(withNewEmployeeDetails("תיאור", full)).toContain(`תיאור\n\n${NEW_EMPLOYEE_BLOCK_HEADER}`)
  })

  it("is the block alone when the description is empty", () => {
    expect(withNewEmployeeDetails("", full)).toBe(formatNewEmployeeBlock(full))
    expect(withNewEmployeeDetails("   ", full)).toBe(formatNewEmployeeBlock(full))
  })

  it("replaces an existing block instead of stacking a second one", () => {
    const once  = withNewEmployeeDetails("תיאור", full)
    const twice = withNewEmployeeDetails(once, { ...full, firstName: "רון" })

    expect(twice.split(NEW_EMPLOYEE_BLOCK_HEADER)).toHaveLength(2)
    expect(twice).toContain("שם פרטי: רון")
    expect(twice).not.toContain("שם פרטי: דני")
  })

  it("preserves the user's own multi-line text", () => {
    const description = "שורה ראשונה\nשורה שנייה\n\nשורה אחרונה"
    expect(withNewEmployeeDetails(description, full).startsWith(description)).toBe(true)
  })
})

// ── Reading it back out ──────────────────────────────────────────────────────

describe("parseNewEmployeeBlock", () => {
  it("round-trips the details it wrote", () => {
    expect(parseNewEmployeeBlock(withNewEmployeeDetails("תיאור", full))).toEqual(full)
  })

  it("returns null on an ordinary ticket", () => {
    expect(parseNewEmployeeBlock("המדפסת לא מדפיסה")).toBeNull()
    expect(parseNewEmployeeBlock("")).toBeNull()
  })

  it("returns the fields that survived a hand-blanked line", () => {
    // Staff edit the description freely; a half-filled block still parses.
    const edited = `${NEW_EMPLOYEE_BLOCK_HEADER}\nשם פרטי: דני\nשם משפחה: \nטלפון: 050-1234567`
    expect(parseNewEmployeeBlock(edited)).toEqual({
      firstName: "דני", lastName: "", phone: "050-1234567", jobTitle: "",
    })
  })

  it("stops at the first line that is not one of our fields", () => {
    const trailing = `${withNewEmployeeDetails("תיאור", full)}\n\nהערה: העובד מתחיל ביום ראשון`
    expect(parseNewEmployeeBlock(trailing)).toEqual(full)
  })

  it("is not fooled by a label written in the free text above the block", () => {
    const description = withNewEmployeeDetails("שם פרטי: מישהו אחר", full)
    expect(parseNewEmployeeBlock(description)).toEqual(full)
  })
})

describe("stripNewEmployeeBlock", () => {
  it("gives back exactly what the user typed", () => {
    const description = "צריך לפתוח משתמשים"
    expect(stripNewEmployeeBlock(withNewEmployeeDetails(description, full))).toBe(description)
  })

  it("leaves a description without a block untouched", () => {
    expect(stripNewEmployeeBlock("המדפסת לא מדפיסה")).toBe("המדפסת לא מדפיסה")
  })

  it("keeps text written after the block", () => {
    const withNote = `${withNewEmployeeDetails("תיאור", full)}\nהערה: דחוף`
    expect(stripNewEmployeeBlock(withNote)).toBe("תיאור\nהערה: דחוף")
  })

  it("is empty when the description was only the block", () => {
    expect(stripNewEmployeeBlock(formatNewEmployeeBlock(full))).toBe("")
  })
})

// ── newEmployeeFullName ──────────────────────────────────────────────────────

describe("newEmployeeFullName", () => {
  it("joins the two name parts", () => {
    expect(newEmployeeFullName(full)).toBe("דני כהן")
  })

  it("copes with only one part filled", () => {
    expect(newEmployeeFullName({ ...full, lastName: "" })).toBe("דני")
  })

  it("is empty when neither part is filled", () => {
    expect(newEmployeeFullName(EMPTY_NEW_EMPLOYEE)).toBe("")
  })
})
