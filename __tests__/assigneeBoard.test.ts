/**
 * __tests__/assigneeBoard.test.ts — the open tickets by who holds them (v3.107).
 *
 * The admin console's "לפי מטפל" tab: filter by assignee, then by urgency and
 * internal priority; rank by the internal priority, the SLA clock inside a
 * level, and unclassified tickets last; one lane per helpdesk member.
 */

import {
  NO_FILTERS, assigneeLanes, compareForBoard, filterBoard, isOnBoard, type BoardClock, type BoardTicket,
} from "@/lib/assigneeBoard"
import { DEFAULT_PRIORITY_SLA } from "@/lib/internalPriority"
import { DEFAULT_SLA } from "@/lib/ticketType"

// Monday 9 November 2026, noon — clear of daylight-saving changes.
const NOW = new Date(2026, 10, 9, 12)
const clock: BoardClock = { sla: DEFAULT_SLA, prioritySla: DEFAULT_PRIORITY_SLA, now: NOW }
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

let n = 0
const t = (over: Partial<BoardTicket> = {}): BoardTicket => ({
  id: `t${++n}`, status: "פתוח", urgency: "בינוני", assignedTo: "dana@cristalino.co.il",
  createdAt: hoursAgo(1), type: "ticket", internalPriority: null, ...over,
})

const ROSTER = [
  { email: "dana@cristalino.co.il", display: "דנה" },
  { email: "yossi@cristalino.co.il", display: "יוסי" },
  { email: "bot@cristalino.co.il", display: "🤖 בוט" },
]

describe("what is on the board", () => {
  it("is every ticket that is not closed and not merged away", () => {
    expect(isOnBoard(t())).toBe(true)
    expect(isOnBoard(t({ status: "בהמתנה" }))).toBe(true)
    expect(isOnBoard(t({ status: "סגור" }))).toBe(false)
    expect(isOnBoard(t({ mergedIntoId: "x" }))).toBe(false)
  })
})

describe("filterBoard", () => {
  const dana = t({ urgency: "דחוף", internalPriority: "P1" })
  const yossi = t({ assignedTo: "Yossi@Cristalino.co.il", urgency: "נמוך", internalPriority: "P4" })
  const unassigned = t({ assignedTo: "" })
  const closed = t({ status: "סגור" })
  const all = [dana, yossi, unassigned, closed]

  it("keeps every open ticket with no filters", () => {
    expect(filterBoard(all, NO_FILTERS, clock)).toEqual([dana, yossi, unassigned])
  })

  it("filters by assignee, whatever the address's case", () => {
    expect(filterBoard(all, { ...NO_FILTERS, assignee: "yossi@cristalino.co.il" }, clock)).toEqual([yossi])
  })

  it("can pick the unassigned", () => {
    expect(filterBoard(all, { ...NO_FILTERS, assignee: "" }, clock)).toEqual([unassigned])
  })

  it("then by the reporter's urgency", () => {
    expect(filterBoard(all, { ...NO_FILTERS, urgencies: ["דחוף", "נמוך"] }, clock)).toEqual([dana, yossi])
  })

  it("and by the internal priority, unclassified included as a choice", () => {
    expect(filterBoard(all, { ...NO_FILTERS, priorities: ["P4"] }, clock)).toEqual([yossi])
    expect(filterBoard(all, { ...NO_FILTERS, priorities: ["none"] }, clock)).toEqual([unassigned])
    expect(filterBoard(all, { ...NO_FILTERS, priorities: ["P1", "none"] }, clock)).toEqual([dana, unassigned])
  })

  it("combines the assignee with the secondary filters", () => {
    expect(filterBoard(all, { ...NO_FILTERS, assignee: "dana@cristalino.co.il", priorities: ["P4"] }, clock)).toEqual([])
  })

  it("can keep only what is past its SLA", () => {
    const late = t({ internalPriority: "P1", createdAt: hoursAgo(6) })
    const inTime = t({ internalPriority: "P1", createdAt: hoursAgo(1) })
    const parked = t({ internalPriority: "P1", createdAt: hoursAgo(6), status: "בהמתנה" })
    expect(filterBoard([late, inTime, parked], { ...NO_FILTERS, overdueOnly: true }, clock)).toEqual([late])
  })
})

describe("the ranking", () => {
  const sorted = (list: BoardTicket[]) => [...list].sort((a, b) => compareForBoard(a, b, clock)).map(x => x.id)

  it("puts P1 first and an unclassified ticket after P5", () => {
    const p5 = t({ internalPriority: "P5" })
    const none = t({ urgency: "דחוף" })
    const p1 = t({ internalPriority: "P1" })
    const p3 = t({ internalPriority: "P3" })
    expect(sorted([p5, none, p1, p3])).toEqual([p1.id, p3.id, p5.id, none.id])
  })

  it("within a level, puts the least time left first — overdue leads", () => {
    const fresh = t({ internalPriority: "P2", createdAt: hoursAgo(1) })
    const late = t({ internalPriority: "P2", createdAt: hoursAgo(10) })
    const middling = t({ internalPriority: "P2", createdAt: hoursAgo(5) })
    expect(sorted([fresh, late, middling])).toEqual([late.id, middling.id, fresh.id])
  })

  it("puts a parked ticket after the running ones of its level", () => {
    const parked = t({ internalPriority: "P2", createdAt: hoursAgo(10), status: "ממתין לגורם חיצוני" })
    const running = t({ internalPriority: "P2", createdAt: hoursAgo(1) })
    expect(sorted([parked, running])).toEqual([running.id, parked.id])
  })

  it("orders unclassified tickets by the reporter's urgency, then oldest first", () => {
    const lowOld = t({ urgency: "נמוך", createdAt: hoursAgo(30) })
    const urgentNew = t({ urgency: "דחוף", createdAt: hoursAgo(1) })
    const urgentOld = t({ urgency: "דחוף", createdAt: hoursAgo(20) })
    expect(sorted([lowOld, urgentNew, urgentOld])).toEqual([urgentOld.id, urgentNew.id, lowOld.id])
  })
})

describe("assigneeLanes", () => {
  it("gives everybody on the roster a lane — an empty one says they are free", () => {
    const lanes = assigneeLanes([t()], ROSTER, clock)
    expect(lanes.map(l => l.display).sort()).toEqual(["דנה", "יוסי", "🤖 בוט"].sort())
    expect(lanes[0].display).toBe("דנה")
    expect(lanes.find(l => l.display === "יוסי")?.tickets).toEqual([])
  })

  it("leaves out an empty lane it is told to hide — the bot", () => {
    const lanes = assigneeLanes([t()], ROSTER, clock, ["bot@cristalino.co.il"])
    expect(lanes.map(l => l.display)).toEqual(["דנה", "יוסי"])
    const botBusy = assigneeLanes([t({ assignedTo: "bot@cristalino.co.il" })], ROSTER, clock, ["bot@cristalino.co.il"])
    expect(botBusy.map(l => l.display)).toContain("🤖 בוט")
  })

  it("adds a lane for somebody off the roster who still holds tickets, and for the unassigned", () => {
    const lanes = assigneeLanes([t({ assignedTo: "former@cristalino.co.il" }), t({ assignedTo: "" })], ROSTER, clock)
    expect(lanes.map(l => l.display)).toEqual(expect.arrayContaining(["former", "לא משויך"]))
  })

  it("matches the roster whatever the address's case, so one person is one lane", () => {
    const lanes = assigneeLanes([t({ assignedTo: "DANA@cristalino.co.il" })], ROSTER, clock)
    expect(lanes.filter(l => l.display === "דנה")).toHaveLength(1)
    expect(lanes.find(l => l.display === "דנה")?.tickets).toHaveLength(1)
  })

  it("counts what is overdue, each level, and what is not classified", () => {
    const lanes = assigneeLanes([
      t({ internalPriority: "P1", createdAt: hoursAgo(6) }),
      t({ internalPriority: "P1" }),
      t({ internalPriority: "P3" }),
      t(),
    ], ROSTER, clock)
    const dana = lanes.find(l => l.display === "דנה")!
    expect(dana.overdue).toBe(1)
    expect(dana.byPriority).toEqual({ P1: 2, P2: 0, P3: 1, P4: 0, P5: 0 })
    expect(dana.unclassified).toBe(1)
  })

  it("puts the busiest first, and ranks each lane's tickets", () => {
    const p4 = t({ assignedTo: "yossi@cristalino.co.il", internalPriority: "P4" })
    const p1 = t({ assignedTo: "yossi@cristalino.co.il", internalPriority: "P1" })
    const lanes = assigneeLanes([t(), p4, p1], ROSTER, clock, ["bot@cristalino.co.il"])
    expect(lanes[0].display).toBe("יוסי")
    expect(lanes[0].tickets.map(x => x.id)).toEqual([p1.id, p4.id])
  })
})
