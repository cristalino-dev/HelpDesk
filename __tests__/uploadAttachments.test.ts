/**
 * __tests__/uploadAttachments.test.ts — uploading a ticket's pending files and
 * reporting what did not make it (v3.84).
 *
 * All five upload sites used to fire the POSTs and never read the answer, so
 * the person was told an upload worked when it had not — twice, on HDTC-470.
 * The case that mattered most is here: nginx refuses an oversized body with an
 * HTML page, so a failed response must never be assumed to be JSON.
 */

import { uploadAttachments, uploadFailureMessage } from "@/lib/ticketApi"

const item = (filename: string) => ({ dataUrl: "data:application/pdf;base64,YWJj", filename })

const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new SyntaxError("Unexpected token '<'")   // an HTML page
    return body
  },
})

type FetchMock = jest.Mock<Promise<unknown>, [string, RequestInit?]>
const mockFetch = (impl: (url: string) => Promise<unknown>): FetchMock => {
  const fn: FetchMock = jest.fn(impl)
  global.fetch = fn as unknown as typeof fetch
  return fn
}

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

describe("uploadAttachments", () => {
  it("posts each file to the ticket and reports nothing when all succeed", async () => {
    const fetchMock = mockFetch(async () => response(200, { id: "a1" }))
    const failures = await uploadAttachments("t1", [item("a.pdf"), item("b.pdf")])
    expect(failures).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tickets/t1/attachments")
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ dataUrl: item("a.pdf").dataUrl, filename: "a.pdf" })
  })

  it("reports nginx's 413 — an HTML page, not JSON — as too large", async () => {
    mockFetch(async () => response(413))
    const [failure] = await uploadAttachments("t1", [item("photo.jpg")])
    expect(failure.name).toBe("photo.jpg")
    expect(failure.reason).toContain("גדול מדי")
  })

  it("reports a refused type", async () => {
    mockFetch(async () => response(415, { error: "סוג הקובץ אינו נתמך" }))
    const [failure] = await uploadAttachments("t1", [item("x.svg")])
    expect(failure.reason).toBe("סוג הקובץ אינו נתמך")
  })

  it("passes on the server's own reason for another 4xx", async () => {
    mockFetch(async () => response(400, { error: "הקובץ ריק או פגום" }))
    const [failure] = await uploadAttachments("t1", [item("x.pdf")])
    expect(failure.reason).toBe("הקובץ ריק או פגום")
  })

  it("reports a network failure", async () => {
    mockFetch(async () => { throw new TypeError("Failed to fetch") })
    const [failure] = await uploadAttachments("t1", [item("x.pdf")])
    expect(failure.reason).toBe("שגיאת רשת — נסו שוב")
  })

  it("carries on after a failure and hands back the item that failed", async () => {
    let n = 0
    mockFetch(async () => (++n === 1 ? response(413) : response(200, { id: "a2" })))
    const second = item("b.pdf")
    const failures = await uploadAttachments("t1", [item("a.pdf"), second])
    expect(failures.map(f => f.name)).toEqual(["a.pdf"])
    expect(failures[0].item.filename).toBe("a.pdf")
    expect(n).toBe(2)
  })
})

describe("uploadFailureMessage", () => {
  it("is empty when nothing failed", () => {
    expect(uploadFailureMessage([])).toBe("")
  })

  it("names one failure", () => {
    expect(uploadFailureMessage([{ name: "a.pdf", reason: "סוג הקובץ אינו נתמך" }]))
      .toBe("הקובץ לא צורף: a.pdf — סוג הקובץ אינו נתמך")
  })

  it("counts and names several", () => {
    expect(uploadFailureMessage([{ name: "a", reason: "x" }, { name: "b", reason: "y" }]))
      .toBe("2 קבצים לא צורפו: a — x; b — y")
  })
})
