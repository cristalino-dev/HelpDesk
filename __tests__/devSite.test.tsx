/**
 * __tests__/devSite.test.tsx — the dev copy can be told apart from production,
 * and cannot mail real people (v3.86).
 *
 * The dev copy runs on a copy of production's data, so every ticket on it
 * carries a real employee's address. What stands between that and a real
 * inbox is lib/mail.ts's devRedirect(): on the dev copy mail goes to
 * MAIL_REDIRECT_TO alone — and nowhere at all when that is not set.
 */

import nodemailer from "nodemailer"
import { render, screen } from "@testing-library/react"
import { appEnv, isDevSite } from "@/lib/appEnv"
import { devRedirect, sendMail } from "@/lib/mail"
import DevBanner from "@/components/DevBanner"

jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: jest.fn() } }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn().mockResolvedValue(undefined) }))

const send = jest.fn()
;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: send })

const env = process.env
beforeEach(() => {
  send.mockReset().mockResolvedValue({})
  process.env = { ...env, SMTP_USER: "helpdesk@cristalino.co.il", SMTP_PASS: "app-password" }
  delete process.env.NEXT_PUBLIC_APP_ENV
  delete process.env.MAIL_REDIRECT_TO
})
afterAll(() => { process.env = env })

describe("appEnv", () => {
  it("is production unless told it is the dev copy", () => {
    expect(appEnv()).toBe("production")
    process.env.NEXT_PUBLIC_APP_ENV = "production"
    expect(isDevSite()).toBe(false)
    process.env.NEXT_PUBLIC_APP_ENV = " DEV "
    expect(appEnv()).toBe("dev")
    expect(isDevSite()).toBe(true)
  })
})

describe("devRedirect", () => {
  it("leaves production's mail exactly as addressed", () => {
    expect(devRedirect(["dana@cristalino.co.il"], "נושא", "<p>x</p>"))
      .toEqual({ recipients: ["dana@cristalino.co.il"], subject: "נושא", html: "<p>x</p>" })
  })

  it("sends the dev copy's mail to the redirect alone, marked, naming who it was for", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "dev"
    process.env.MAIL_REDIRECT_TO = "tester@cristalino.co.il"
    const routed = devRedirect(["dana@cristalino.co.il", "moshe@cristalino.co.il"], "פנייה חדשה HDTC-1", "<p>x</p>")
    expect(routed?.recipients).toEqual(["tester@cristalino.co.il"])
    expect(routed?.subject).toBe("[DEV] פנייה חדשה HDTC-1")
    expect(routed?.html).toContain("dana@cristalino.co.il, moshe@cristalino.co.il")
    expect(routed?.html.endsWith("<p>x</p>")).toBe(true)
  })

  it("sends nothing from the dev copy when no redirect is set", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "dev"
    expect(devRedirect(["dana@cristalino.co.il"], "s", "h")).toBeNull()
  })
})

describe("sendMail on the dev copy", () => {
  it("delivers to the redirect only", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "dev"
    process.env.MAIL_REDIRECT_TO = "tester@cristalino.co.il"
    await sendMail({ to: ["dana@cristalino.co.il"], subject: "פנייה חדשה", html: "<p>x</p>" })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].to).toEqual(["tester@cristalino.co.il"])
    expect(send.mock.calls[0][0].subject).toBe("[DEV] פנייה חדשה")
  })

  it("delivers nothing when no redirect is set", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "dev"
    await sendMail({ to: "dana@cristalino.co.il", subject: "פנייה חדשה", html: "<p>x</p>" })
    expect(send).not.toHaveBeenCalled()
  })

  it("is untouched on production", async () => {
    await sendMail({ to: "dana@cristalino.co.il", subject: "פנייה חדשה", html: "<p>x</p>" })
    expect(send.mock.calls[0][0].to).toEqual(["dana@cristalino.co.il"])
  })
})

describe("DevBanner", () => {
  it("says this is the dev copy, without naming the redirect address", () => {
    process.env.MAIL_REDIRECT_TO = "tester@cristalino.co.il"
    render(<DevBanner />)
    const note = screen.getByRole("note")
    expect(note.textContent).toContain("DEV")
    expect(note.textContent).not.toContain("tester@")
  })
})
