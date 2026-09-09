/**
 * __tests__/ThemeToggle.test.tsx — the light/dark switch and what remembers it
 *
 * Three things have to hold, and each of them is a bug people notice:
 *
 *   • The default is light. Not "light unless your laptop says dark" — light,
 *     for everybody, until they touch the switch.
 *   • The choice survives a reload. That is the whole point of a switch rather
 *     than a button.
 *   • The page is already the right colour on the first frame. The boot script
 *     is what does that, so it is tested as the string it actually is: it runs
 *     from an inline <script> before React exists, and cannot be imported.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ThemeToggle from "@/components/ThemeToggle"
import { themeBootScript, applyTheme, currentTheme, THEME_KEY, DEFAULT_THEME } from "@/lib/themeBoot"

/** Runs the boot script the way the browser would, before anything renders. */
function boot() {
  new Function(themeBootScript())()
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute("data-theme")
})

describe("the default", () => {
  it("is light", () => {
    expect(DEFAULT_THEME).toBe("light")
  })

  it("leaves the document unmarked, so bare :root (light) applies", () => {
    boot()
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false)
    expect(currentTheme()).toBe("light")
  })

  // The switch is not a system-preference mirror. Somebody on a dark laptop
  // who has never opened this app gets the light theme.
  it("does not consult prefers-color-scheme", () => {
    expect(themeBootScript()).not.toContain("prefers-color-scheme")
    expect(themeBootScript()).not.toContain("matchMedia")
  })
})

describe("the boot script", () => {
  it("applies a stored dark preference before anything renders", () => {
    localStorage.setItem(THEME_KEY, "dark")
    boot()
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("applies nothing for a stored light preference", () => {
    localStorage.setItem(THEME_KEY, "light")
    boot()
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false)
  })

  // Private browsing throws on localStorage access. A theme is not worth a
  // blank page, so the script swallows it and the default stands.
  it("survives localStorage throwing", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    expect(() => boot()).not.toThrow()
    expect(currentTheme()).toBe("light")
    spy.mockRestore()
  })
})

describe("the switch", () => {
  it("is a switch, not a button, and starts off", () => {
    render(<ThemeToggle />)
    const el = screen.getByRole("switch")
    expect(el).toHaveAttribute("aria-checked", "false")
    expect(el).toHaveAccessibleName("עבור למצב כהה")
  })

  it("turns the page dark and says so", async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("switch"))

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("switch")).toHaveAccessibleName("עבור למצב בהיר")
  })

  it("remembers the choice", async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("switch"))
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")
  })

  // Going back to light must WRITE "light", not just clear the attribute:
  // a person who deliberately chose light should keep it if the default
  // ever changes.
  it("remembers a deliberate return to light", async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("switch"))
    await user.click(screen.getByRole("switch"))

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe("light")
  })

  it("shows the stored theme on load, without a click", () => {
    localStorage.setItem(THEME_KEY, "dark")
    boot()

    render(<ThemeToggle />)
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  })

  it("is reachable and operable from the keyboard", async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.tab()
    expect(screen.getByRole("switch")).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(currentTheme()).toBe("dark")
  })

  // Two switches on one page must not disagree. They share no parent and no
  // state — they subscribe to the document, which is why this works.
  it("keeps every switch on the page in step", async () => {
    const user = userEvent.setup()
    render(<><ThemeToggle /><ThemeToggle /></>)

    const [first, second] = screen.getAllByRole("switch")
    await user.click(first)

    expect(first).toHaveAttribute("aria-checked", "true")
    expect(second).toHaveAttribute("aria-checked", "true")
  })
})

describe("applyTheme", () => {
  it("does not throw when storage is unavailable", () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    expect(() => applyTheme("dark")).not.toThrow()
    // The theme still applies to this page; it just will not survive a reload.
    expect(currentTheme()).toBe("dark")
    spy.mockRestore()
  })
})
