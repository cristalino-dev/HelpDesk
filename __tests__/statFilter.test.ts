/**
 * __tests__/statFilter.test.ts
 *
 * Unit tests for the stat-card filter logic used in the tickets page (/tickets)
 * and admin page (/admin). The filter is pure client-side derived state, so we
 * test it as plain functions mirroring what the useMemo does.
 */

// Make this file a module so its declarations don't collide with other test files.
export {}

// ── Types ──────────────────────────────────────────────────────────────────────

interface MinTicket {
  status:    string
  urgency:   string
  createdAt: string
  updatedAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const today   = new Date().toDateString()
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

/** Apply the /tickets page statFilter logic to a list. */
function applyTicketsStatFilter(tickets: MinTicket[], statFilter: string | null): MinTicket[] {
  let list = [...tickets]
  if      (statFilter === "open")         list = list.filter(t => t.status === "פתוח")
  else if (statFilter === "inprog")       list = list.filter(t => t.status === "בטיפול")
  else if (statFilter === "closed")       list = list.filter(t => t.status === "סגור")
  else if (statFilter === "openedToday")  list = list.filter(t => new Date(t.createdAt).toDateString() === today)
  else if (statFilter === "closedToday")  list = list.filter(t => t.status === "סגור" && new Date(t.updatedAt).toDateString() === today)
  // weekly filter keys
  else if (statFilter === "weekAll")      list = list.filter(t => new Date(t.createdAt) >= weekAgo)
  else if (statFilter === "weekOpen")     list = list.filter(t => t.status === "פתוח"   && new Date(t.createdAt) >= weekAgo)
  else if (statFilter === "weekInprog")   list = list.filter(t => t.status === "בטיפול" && new Date(t.createdAt) >= weekAgo)
  else if (statFilter === "weekClosed")   list = list.filter(t => t.status === "סגור"   && new Date(t.updatedAt) >= weekAgo)
  return list
}

/** Apply the /admin page statFilter logic to a list. */
function applyAdminStatFilter(tickets: MinTicket[], statFilter: string | null): MinTicket[] {
  let list = [...tickets]
  if (statFilter === "queue")        list = list.filter(t => t.status !== "סגור")
  else if (statFilter === "urgent")  list = list.filter(t => t.urgency === "דחוף" && t.status !== "סגור")
  else if (statFilter === "high")    list = list.filter(t => t.urgency === "גבוה"  && t.status !== "סגור")
  else if (statFilter === "inprog")  list = list.filter(t => t.status === "בטיפול")
  else if (statFilter === "closed")  list = list.filter(t => t.status === "סגור")
  return list
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const pastDate   = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()  // 5 days ago — within this week
const oldDate    = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days ago — outside this week
const todayDate  = new Date().toISOString()

const tickets: MinTicket[] = [
  { status: "פתוח",   urgency: "דחוף",   createdAt: todayDate, updatedAt: todayDate }, // #0 open, created today
  { status: "פתוח",   urgency: "גבוה",   createdAt: oldDate,   updatedAt: oldDate   }, // #1 open, created 14d ago
  { status: "בטיפול", urgency: "בינוני", createdAt: pastDate,  updatedAt: todayDate }, // #2 in-progress, created 5d ago
  { status: "סגור",   urgency: "נמוך",   createdAt: pastDate,  updatedAt: todayDate }, // #3 closed today, created 5d ago
  { status: "סגור",   urgency: "דחוף",   createdAt: oldDate,   updatedAt: oldDate   }, // #4 closed 14d ago
]

// ── /tickets stat filter ───────────────────────────────────────────────────────

describe("applyTicketsStatFilter", () => {
  it("null filter returns all tickets unchanged", () => {
    expect(applyTicketsStatFilter(tickets, null)).toHaveLength(5)
  })

  it('"open" returns only פתוח tickets', () => {
    const result = applyTicketsStatFilter(tickets, "open")
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === "פתוח")).toBe(true)
  })

  it('"inprog" returns only בטיפול tickets', () => {
    const result = applyTicketsStatFilter(tickets, "inprog")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("בטיפול")
  })

  it('"closed" returns only סגור tickets', () => {
    const result = applyTicketsStatFilter(tickets, "closed")
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === "סגור")).toBe(true)
  })

  it('"openedToday" returns tickets created today regardless of status', () => {
    const result = applyTicketsStatFilter(tickets, "openedToday")
    expect(result).toHaveLength(1)
    expect(new Date(result[0].createdAt).toDateString()).toBe(today)
  })

  it('"closedToday" returns closed tickets updated today', () => {
    // One סגור ticket has updatedAt = today, one has updatedAt = past
    const result = applyTicketsStatFilter(tickets, "closedToday")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("סגור")
    expect(new Date(result[0].updatedAt).toDateString()).toBe(today)
  })

  it('"closedToday" does not include non-closed tickets updated today', () => {
    // The בטיפול ticket has updatedAt = today but status is not סגור
    const result = applyTicketsStatFilter(tickets, "closedToday")
    expect(result.every(t => t.status === "סגור")).toBe(true)
  })

  it("unknown filter key returns all tickets unchanged", () => {
    // Future-proofing: if an unknown key is passed nothing gets filtered
    expect(applyTicketsStatFilter(tickets, "nonexistent")).toHaveLength(5)
  })

  // ── Weekly filter keys ──────────────────────────────────────────────────────
  it('"weekAll" returns tickets created in the last 7 days', () => {
    // #0 (today), #2 (5d ago), #3 (created 5d ago) are within 7 days; #1 and #4 are 14d ago
    const result = applyTicketsStatFilter(tickets, "weekAll")
    expect(result).toHaveLength(3)
    result.forEach(t => expect(new Date(t.createdAt).getTime()).toBeGreaterThanOrEqual(weekAgo.getTime()))
  })

  it('"weekOpen" returns פתוח tickets created this week', () => {
    // #0 is פתוח and created today; #1 is פתוח but created 14d ago (excluded)
    const result = applyTicketsStatFilter(tickets, "weekOpen")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("פתוח")
    expect(new Date(result[0].createdAt).getTime()).toBeGreaterThanOrEqual(weekAgo.getTime())
  })

  it('"weekInprog" returns בטיפול tickets created this week', () => {
    // #2 is בטיפול and created 5d ago (within week)
    const result = applyTicketsStatFilter(tickets, "weekInprog")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("בטיפול")
  })

  it('"weekClosed" returns סגור tickets closed (updatedAt) this week', () => {
    // #3 was closed today (updatedAt=today); #4 was closed 14d ago (excluded)
    const result = applyTicketsStatFilter(tickets, "weekClosed")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("סגור")
    expect(new Date(result[0].updatedAt).getTime()).toBeGreaterThanOrEqual(weekAgo.getTime())
  })

  it('"weekClosed" excludes open/in-progress tickets even if recent', () => {
    const result = applyTicketsStatFilter(tickets, "weekClosed")
    expect(result.every(t => t.status === "סגור")).toBe(true)
  })
})

// ── /admin stat filter ─────────────────────────────────────────────────────────

describe("applyAdminStatFilter", () => {
  it("null filter returns all tickets unchanged", () => {
    expect(applyAdminStatFilter(tickets, null)).toHaveLength(5)
  })

  it('"queue" returns all non-closed tickets', () => {
    const result = applyAdminStatFilter(tickets, "queue")
    expect(result).toHaveLength(3) // 2 פתוח + 1 בטיפול
    expect(result.every(t => t.status !== "סגור")).toBe(true)
  })

  it('"urgent" returns non-closed דחוף tickets only', () => {
    const result = applyAdminStatFilter(tickets, "urgent")
    expect(result).toHaveLength(1) // only the open דחוף; closed דחוף excluded
    expect(result[0].status).toBe("פתוח")
    expect(result[0].urgency).toBe("דחוף")
  })

  it('"high" returns non-closed גבוה tickets only', () => {
    const result = applyAdminStatFilter(tickets, "high")
    expect(result).toHaveLength(1)
    expect(result[0].urgency).toBe("גבוה")
    expect(result[0].status).not.toBe("סגור")
  })

  it('"inprog" returns only בטיפול tickets', () => {
    const result = applyAdminStatFilter(tickets, "inprog")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("בטיפול")
  })

  it('"closed" returns only סגור tickets', () => {
    const result = applyAdminStatFilter(tickets, "closed")
    expect(result).toHaveLength(2)
    expect(result.every(t => t.status === "סגור")).toBe(true)
  })

  it("closed urgent ticket is NOT included in urgent filter", () => {
    // Ensures closed tickets are excluded from urgency filters
    const result = applyAdminStatFilter(tickets, "urgent")
    expect(result.some(t => t.status === "סגור")).toBe(false)
  })
})
