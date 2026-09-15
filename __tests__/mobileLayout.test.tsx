/**
 * __tests__/mobileLayout.test.tsx — phones get the phone layout (v3.90).
 *
 * On a phone the whole top bar came out as one ~1,500 px row, with the page
 * content a strip beside it. useIsMobile read window.innerWidth, which on a
 * phone is the width of what is on screen at the current zoom: a page zoomed
 * out to show that row reported itself wide, got the desktop layout, and
 * stayed wide. The hook now asks a media query, measured against the layout
 * viewport that no zoom changes; and the header's action row can no longer
 * widen the page even if something in it overflows.
 */

import { act, render, renderHook } from "@testing-library/react"
import { useIsMobile } from "@/lib/useIsMobile"
import AppHeader from "@/components/AppHeader"

type Listener = () => void

function mockMatchMedia(matches: (query: string) => boolean) {
  const listeners: Listener[] = []
  const queries: string[] = []
  const matchMedia = jest.fn((query: string) => {
    queries.push(query)
    return {
      get matches() { return matches(query) },
      media: query,
      addEventListener: (_type: string, l: Listener) => { listeners.push(l) },
      removeEventListener: (_type: string, l: Listener) => {
        const i = listeners.indexOf(l)
        if (i >= 0) listeners.splice(i, 1)
      },
    }
  })
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia })
  return { listeners, queries, fire: () => listeners.forEach(l => l()) }
}

const setInnerWidth = (width: number) =>
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width })

afterEach(() => {
  // jsdom has no matchMedia of its own: put it back that way.
  delete (window as { matchMedia?: unknown }).matchMedia
  setInnerWidth(1024)
})

describe("useIsMobile", () => {
  it("believes the layout viewport, not innerWidth — a zoomed-out phone reports ~1,500 px", () => {
    setInnerWidth(1500)
    const mm = mockMatchMedia(q => q === "(max-width: 767.98px)")
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    expect(mm.queries).toContain("(max-width: 767.98px)")
  })

  it("says desktop on a desktop, whatever innerWidth claims", () => {
    setInnerWidth(400)
    mockMatchMedia(() => false)
    expect(renderHook(() => useIsMobile(1180)).result.current).toBe(false)
  })

  it("asks at the breakpoint it is given", () => {
    const mm = mockMatchMedia(() => true)
    renderHook(() => useIsMobile(1180))
    expect(mm.queries).toContain("(max-width: 1179.98px)")
  })

  it("follows the media query when it changes — a phone turned sideways", () => {
    let phone = true
    const mm = mockMatchMedia(() => phone)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    phone = false
    act(() => mm.fire())
    expect(result.current).toBe(false)
  })

  it("stops listening when the component goes", () => {
    const mm = mockMatchMedia(() => true)
    const { unmount } = renderHook(() => useIsMobile())
    expect(mm.listeners).toHaveLength(1)
    unmount()
    expect(mm.listeners).toHaveLength(0)
  })

  it("uses addListener where a MediaQueryList has no addEventListener (Safari before 14)", () => {
    const added: Listener[] = []
    Object.defineProperty(window, "matchMedia", {
      configurable: true, writable: true,
      value: jest.fn(() => ({ matches: true, addListener: (l: Listener) => { added.push(l) }, removeListener: jest.fn() })),
    })
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
    expect(added).toHaveLength(1)
  })

  it("falls back to innerWidth where there is no matchMedia at all (jsdom)", () => {
    setInnerWidth(500)
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
    setInnerWidth(1000)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
  })
})

describe("AppHeader", () => {
  it("scrolls its action row inside the bar rather than widen the page", () => {
    const { getByText } = render(<AppHeader><span>actions</span></AppHeader>)
    const row = getByText("actions").parentElement as HTMLElement
    expect(["0", "0px"]).toContain(row.style.minWidth) // jsdom keeps React's unitless 0 as "0"
    expect(row.style.overflowX).toBe("auto")
  })
})
