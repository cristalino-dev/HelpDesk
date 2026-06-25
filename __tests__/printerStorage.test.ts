/**
 * __tests__/printerStorage.test.ts
 *
 * Tests for the pure helpers in lib/printerStorage.ts — filename sanitization
 * (path-traversal defense + safe on-disk names), stored-name construction, and
 * the allowed-extension gate. The fs wrappers are not exercised here.
 */

import {
  sanitizeFilename, buildStoredName, isAllowedDriverExt, driverDiskPath, driversDir,
} from "@/lib/printerStorage"

describe("sanitizeFilename", () => {
  it("keeps a normal filename with its extension", () => {
    expect(sanitizeFilename("HP_LaserJet_M404.zip")).toBe("HP_LaserJet_M404.zip")
  })

  it("strips directory components (POSIX and Windows) to defend against traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd")
    expect(sanitizeFilename("..\\..\\windows\\system32\\driver.inf")).toBe("driver.inf")
    expect(sanitizeFilename("/var/tmp/evil.exe")).toBe("evil.exe")
  })

  it("replaces spaces and unusual characters with underscores", () => {
    expect(sanitizeFilename("Canon Driver (v2).exe")).toBe("Canon_Driver_v2.exe")
  })

  it("turns non-ASCII (Hebrew) names into a safe ascii stem, preserving the extension", () => {
    const out = sanitizeFilename("מדפסת.zip")
    expect(out.endsWith(".zip")).toBe(true)
    expect(/^[A-Za-z0-9._-]+$/.test(out)).toBe(true)
  })

  it("collapses repeated separators", () => {
    expect(sanitizeFilename("a___b...c.zip")).toBe("a_b...c.zip")
  })

  it("falls back to 'driver' when the stem becomes empty", () => {
    expect(sanitizeFilename("???.exe")).toBe("driver.exe")
  })

  it("treats a leading-dot name as a stem (Node has no extension for dotfiles)", () => {
    // path.extname(".zip") === "" → ".zip" sanitizes to a safe, non-empty stem
    expect(sanitizeFilename(".zip")).toBe("zip")
  })

  it("never returns an empty string", () => {
    expect(sanitizeFilename("")).not.toBe("")
    expect(sanitizeFilename("///")).not.toBe("")
  })

  it("caps overly long names while keeping the extension", () => {
    const long = "x".repeat(500) + ".zip"
    const out = sanitizeFilename(long)
    expect(out.length).toBeLessThanOrEqual(124) // 120 stem cap + ".zip"
    expect(out.endsWith(".zip")).toBe(true)
  })
})

describe("buildStoredName", () => {
  it("prefixes a unique id and keeps the sanitized original after '__'", () => {
    const s = buildStoredName("HP Driver.zip")
    expect(s.includes("__")).toBe(true)
    expect(s.endsWith("__HP_Driver.zip")).toBe(true)
  })

  it("produces a different stored name on each call (uniqueness)", () => {
    expect(buildStoredName("same.zip")).not.toBe(buildStoredName("same.zip"))
  })

  it("yields a stored name safe to drop into a directory (no separators in basename)", () => {
    const s = buildStoredName("../../x.exe")
    expect(s.includes("/")).toBe(false)
    expect(s.includes("\\")).toBe(false)
    expect(s.endsWith("__x.exe")).toBe(true)
  })
})

describe("isAllowedDriverExt", () => {
  it("accepts common driver/installer/archive extensions (case-insensitive)", () => {
    for (const n of ["a.zip", "b.EXE", "c.msi", "d.inf", "e.cab", "f.7z", "g.rar", "h.tar", "i.gz"]) {
      expect(isAllowedDriverExt(n)).toBe(true)
    }
  })

  it("rejects unrelated or dangerous file types", () => {
    for (const n of ["note.txt", "x.js", "y.sh", "z", "photo.png", "data.json"]) {
      expect(isAllowedDriverExt(n)).toBe(false)
    }
  })
})

describe("driverDiskPath", () => {
  it("resolves under the drivers directory and ignores any path in the stored name", () => {
    const p = driverDiskPath("../../escape.zip")
    expect(p.startsWith(driversDir())).toBe(true)
    expect(p.endsWith("escape.zip")).toBe(true)
  })
})
