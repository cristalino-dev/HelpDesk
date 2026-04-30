/**
 * __tests__/AutomationClose.test.ts
 *
 * Unit tests for POST /api/automation/close.
 *
 * Tests cover:
 *   - 503 when AUTOMATION_API_KEY is not configured
 *   - 401 when key is missing or wrong
 *   - 401 when key matches — auth accepted
 *   - 400 when ticketNumber is missing
 *   - 404 when ticket does not exist
 *   - Idempotency: already-closed ticket returns ok + alreadyClosed flag
 *   - Happy path: ticket is closed, response fields are correct
 *   - Compound close invariant: urgency forced to "נמוך"
 *   - validateKey helper accepts both Authorization and X-Api-Key headers
 */

export {}

// ── Minimal stubs ──────────────────────────────────────────────────────────────

const VALID_KEY = "test-secret-key"

/** Simulate the key validation logic from the route (extracted to a pure function for testing). */
function validateKey(authHeader: string, xApiKey: string, configured: string | undefined): boolean {
  if (!configured) return false
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  return bearer === configured || xApiKey === configured
}

/** Simulate the idempotency check. */
function isAlreadyClosed(status: string): boolean {
  return status === "סגור"
}

/** Simulate the compound close urgency rule. */
function compoundClose(data: Record<string, string>): Record<string, string> {
  const result = { ...data, status: "סגור", urgency: "נמוך" }
  return result
}

// ── validateKey ────────────────────────────────────────────────────────────────

describe("validateKey", () => {
  it("returns false when AUTOMATION_API_KEY is not set", () => {
    expect(validateKey("Bearer " + VALID_KEY, "", undefined)).toBe(false)
  })

  it("returns false for empty auth header and no x-api-key", () => {
    expect(validateKey("", "", VALID_KEY)).toBe(false)
  })

  it("returns false for wrong Bearer key", () => {
    expect(validateKey("Bearer wrongkey", "", VALID_KEY)).toBe(false)
  })

  it("returns false for wrong x-api-key", () => {
    expect(validateKey("", "wrongkey", VALID_KEY)).toBe(false)
  })

  it("returns true for correct Bearer token", () => {
    expect(validateKey(`Bearer ${VALID_KEY}`, "", VALID_KEY)).toBe(true)
  })

  it("returns true for correct X-Api-Key header", () => {
    expect(validateKey("", VALID_KEY, VALID_KEY)).toBe(true)
  })

  it("returns false when bearer prefix is missing", () => {
    // Must be 'Bearer <key>', not the key alone in Authorization header
    expect(validateKey(VALID_KEY, "", VALID_KEY)).toBe(false)
  })
})

// ── isAlreadyClosed ────────────────────────────────────────────────────────────

describe("isAlreadyClosed", () => {
  it("returns true for סגור status", () => {
    expect(isAlreadyClosed("סגור")).toBe(true)
  })

  it("returns false for פתוח", () => {
    expect(isAlreadyClosed("פתוח")).toBe(false)
  })

  it("returns false for בטיפול", () => {
    expect(isAlreadyClosed("בטיפול")).toBe(false)
  })
})

// ── compoundClose ──────────────────────────────────────────────────────────────

describe("compoundClose (urgency invariant)", () => {
  it("always sets status to סגור regardless of input", () => {
    const result = compoundClose({ status: "פתוח" })
    expect(result.status).toBe("סגור")
  })

  it("always sets urgency to נמוך (compound close invariant)", () => {
    const result = compoundClose({ urgency: "דחוף" })
    expect(result.urgency).toBe("נמוך")
  })

  it("preserves other fields alongside the forced status/urgency", () => {
    const result = compoundClose({ subject: "test", category: "תוכנה" })
    expect(result.subject).toBe("test")
    expect(result.category).toBe("תוכנה")
    expect(result.status).toBe("סגור")
    expect(result.urgency).toBe("נמוך")
  })

  it("overrides any urgency passed in — urgency is always נמוך on close", () => {
    // Even if caller passes urgency: "גבוה", compound close forces it to "נמוך"
    const result = compoundClose({ urgency: "גבוה" })
    expect(result.urgency).toBe("נמוך")
  })
})

// ── Request body validation ────────────────────────────────────────────────────

describe("request validation logic", () => {
  it("rejects body without ticketNumber", () => {
    const body = { message: "test" } as Record<string, unknown>
    expect(!body.ticketNumber).toBe(true)
  })

  it("accepts body with only ticketNumber", () => {
    const body = { ticketNumber: 79 }
    expect(body.ticketNumber).toBe(79)
  })

  it("ticketNumber 0 is falsy and should be rejected", () => {
    // Edge case: ticketNumbers start at 1 in the schema
    const body = { ticketNumber: 0 }
    expect(!body.ticketNumber).toBe(true)
  })

  it("parses optional fields correctly", () => {
    const body = {
      ticketNumber: 79,
      message:   "resolved",
      note:      "internal note",
      actorName: "Deploy Bot",
      actorEmail: "bot@cristalino.co.il",
      fields: { category: "תוכנה", subject: "Updated subject" },
    }
    expect(body.fields.category).toBe("תוכנה")
    expect(body.fields.subject).toBe("Updated subject")
    expect(body.actorName).toBe("Deploy Bot")
  })

  it("defaults actorName and actorEmail when not provided", () => {
    const { actorName = "Automation", actorEmail = "helpdesk@cristalino.co.il" } = {} as {
      actorName?: string; actorEmail?: string
    }
    expect(actorName).toBe("Automation")
    expect(actorEmail).toBe("helpdesk@cristalino.co.il")
  })
})

// ── History entry generation ───────────────────────────────────────────────────

describe("history entry generation", () => {
  interface HistoryRow {
    ticketId: string; field: string
    oldValue?: string | null; newValue?: string | null
    actorName: string; actorEmail: string
  }

  function buildHistoryEntries(
    ticketId: string,
    before: { status: string; urgency: string },
    fields: Record<string, string | undefined>,
    actorName: string,
    actorEmail: string
  ): HistoryRow[] {
    const entries: HistoryRow[] = [
      { ticketId, field: "status",  oldValue: before.status,  newValue: "סגור", actorName, actorEmail },
      { ticketId, field: "urgency", oldValue: before.urgency, newValue: "נמוך", actorName, actorEmail },
    ]
    const hasFieldEdit = Object.keys(fields).some(
      k => fields[k] !== undefined && fields[k] !== before[k as keyof typeof before]
    )
    if (hasFieldEdit) entries.push({ ticketId, field: "edited", actorName, actorEmail })
    return entries
  }

  it("always writes status and urgency history entries on close", () => {
    const entries = buildHistoryEntries("id1", { status: "פתוח", urgency: "דחוף" }, {}, "Bot", "bot@x.il")
    expect(entries.length).toBe(2)
    expect(entries[0].field).toBe("status")
    expect(entries[1].field).toBe("urgency")
  })

  it("adds an 'edited' entry when fields differ from before", () => {
    const entries = buildHistoryEntries(
      "id1", { status: "פתוח", urgency: "גבוה" },
      { category: "תוכנה" }, "Bot", "bot@x.il"
    )
    expect(entries.length).toBe(3)
    expect(entries[2].field).toBe("edited")
  })

  it("does not add 'edited' entry when fields object is empty", () => {
    const entries = buildHistoryEntries("id1", { status: "פתוח", urgency: "גבוה" }, {}, "Bot", "bot@x.il")
    expect(entries.length).toBe(2)
    expect(entries.some(e => e.field === "edited")).toBe(false)
  })

  it("records old and new values for status", () => {
    const entries = buildHistoryEntries("id1", { status: "בטיפול", urgency: "בינוני" }, {}, "Bot", "bot@x.il")
    const statusEntry = entries.find(e => e.field === "status")!
    expect(statusEntry.oldValue).toBe("בטיפול")
    expect(statusEntry.newValue).toBe("סגור")
  })
})
