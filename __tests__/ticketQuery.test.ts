/**
 * __tests__/ticketQuery.test.ts — the /api/v1/tickets query string (v3.88).
 * Every filter becomes the Prisma condition it says; anything malformed is an
 * error naming the parameter — all of them at once, not the first.
 */

import { parseTicketListQuery, DEFAULT_LIMIT, MAX_LIMIT, type TicketListQuery } from "@/lib/ticketQuery"

const q = (s: string) => parseTicketListQuery(new URLSearchParams(s))
const ok = (s: string) => {
  const r = q(s)
  if ("errors" in r) throw new Error(r.errors.join("; "))
  return r as TicketListQuery
}
const conditions = (s: string) => (ok(s).where as { AND?: unknown[] }).AND ?? []

describe("defaults", () => {
  it("is the newest first, 50 at a time, no filter", () => {
    const r = ok("")
    expect(r.where).toEqual({})
    expect(r.orderBy).toEqual([{ createdAt: "desc" }, { ticketNumber: "desc" }])
    expect({ skip: r.skip, take: r.take, page: r.page, limit: r.limit }).toEqual({ skip: 0, take: DEFAULT_LIMIT, page: 1, limit: DEFAULT_LIMIT })
  })
})

describe("filters", () => {
  it("takes lists for status, urgency, category and platform", () => {
    expect(conditions("status=פתוח,בטיפול&urgency=דחוף")).toEqual([
      { status: { in: ["פתוח", "בטיפול"] } },
      { urgency: { in: ["דחוף"] } },
    ])
  })

  it("filters by type", () => {
    expect(conditions("type=request")).toEqual([{ type: { in: ["request"] } }])
  })

  it("reads open=true as anything but closed, and open=false as closed", () => {
    expect(conditions("open=true")).toEqual([{ status: { not: "סגור" } }])
    expect(conditions("open=false")).toEqual([{ status: "סגור" }])
  })

  it("matches the technician and the owner by email, ignoring case", () => {
    expect(conditions("assignedTo=Alon@Cristalino.co.il&owner=dana@cristalino.co.il")).toEqual([
      { assignedTo: { equals: "Alon@Cristalino.co.il", mode: "insensitive" } },
      { user: { email: { equals: "dana@cristalino.co.il", mode: "insensitive" } } },
    ])
  })

  it("finds a number under either label", () => {
    expect(conditions("number=REQ-45")).toEqual([{ ticketNumber: 45 }])
    expect(conditions("number=HDTC-45")).toEqual([{ ticketNumber: 45 }])
  })

  it("searches the subject and the description", () => {
    expect(conditions("q=מדפסת")).toEqual([{ OR: [
      { subject: { contains: "מדפסת", mode: "insensitive" } },
      { description: { contains: "מדפסת", mode: "insensitive" } },
    ] }])
  })

  it("reads a bare date in createdTo as the whole of that day", () => {
    const [c] = conditions("createdFrom=2026-09-01&createdTo=2026-09-14") as { createdAt: { gte: Date; lt: Date } }[]
    expect(c.createdAt.gte.toISOString()).toBe("2026-09-01T00:00:00.000Z")
    expect(c.createdAt.lt.toISOString()).toBe("2026-09-15T00:00:00.000Z")
  })

  it("takes an exact time in updatedTo as it is", () => {
    const [c] = conditions("updatedTo=2026-09-14T10:00:00Z") as { updatedAt: { lte: Date } }[]
    expect(c.updatedAt.lte.toISOString()).toBe("2026-09-14T10:00:00.000Z")
  })
})

describe("sorting and paging", () => {
  it("pages", () => {
    const r = ok("page=3&limit=20")
    expect({ skip: r.skip, take: r.take }).toEqual({ skip: 40, take: 20 })
  })

  it("sorts by number without a tie-breaker, and by a date with the number as one", () => {
    expect(ok("sort=ticketNumber&order=asc").orderBy).toEqual([{ ticketNumber: "asc" }])
    expect(ok("sort=updatedAt").orderBy).toEqual([{ updatedAt: "desc" }, { ticketNumber: "desc" }])
  })
})

describe("errors", () => {
  it("names every parameter it did not understand, at once", () => {
    const r = q(`colour=red&type=incident&open=maybe&number=abc&createdFrom=yesterday&sort=subject&order=up&limit=${MAX_LIMIT + 1}&page=0`)
    expect("errors" in r).toBe(true)
    const errors = (r as { errors: string[] }).errors.join(" | ")
    for (const bit of ["colour", "type", "open", "number", "createdFrom", "sort", "order", "limit", "page"]) {
      expect(errors).toContain(bit)
    }
  })
})
