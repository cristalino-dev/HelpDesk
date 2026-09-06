/**
 * __tests__/mailRetry.test.ts — sendMail's retry behaviour
 *
 * From the production error log:
 *
 *   Mail send failed: Invalid greeting. response=421-4.4.5 Server busy, try
 *   again later. (smtp.gmail.com)
 *
 * Gmail reaches for 421 under load, and it means "try again later". sendMail
 * tried once, logged, and dropped the message — so a ticket was created and
 * nobody was told. These tests pin which failures are retried and which are
 * not: retrying a permanent 5xx would just delay the same rejection three
 * times, and retrying nothing loses mail Gmail was willing to accept.
 */

import { isTransientMailError, MAIL_ATTEMPTS, sendMail } from "@/lib/mail"
import nodemailer from "nodemailer"
import { logError } from "@/lib/logError"

jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport: jest.fn() } }))
jest.mock("@/lib/logError", () => ({ logError: jest.fn().mockResolvedValue(undefined) }))

const send = jest.fn()
;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: send })

process.env.SMTP_USER = "helpdesk@cristalino.co.il"
process.env.SMTP_PASS = "app-password"

const mail = { to: "a@b.c", subject: "פנייה חדשה", html: "<p>x</p>" }

/** Run the send, fast-forwarding through every backoff wait. */
async function runWithoutWaiting(p: Promise<unknown>) {
  for (let i = 0; i < MAIL_ATTEMPTS + 1; i++) {
    await Promise.resolve()
    jest.runAllTimers()
  }
  return p
}

/** The real shape nodemailer throws for the logged failure. */
const greeting421 = Object.assign(
  new Error("Invalid greeting. response=421-4.4.5 Server busy, try again later. (smtp.gmail.com)"),
  { code: "EPROTOCOL", response: "421-4.4.5 Server busy, try again later." },
)

describe("which failures are worth retrying", () => {
  it("retries the 421 that fills the log", () => {
    expect(isTransientMailError(greeting421)).toBe(true)
  })

  it("retries any 4xx reply code", () => {
    for (const responseCode of [421, 450, 451, 452]) {
      expect(isTransientMailError(Object.assign(new Error("busy"), { responseCode }))).toBe(true)
    }
  })

  it("does NOT retry a permanent 5xx — the rejection would not change", () => {
    for (const responseCode of [550, 552, 553]) {
      expect(isTransientMailError(Object.assign(new Error("nope"), { responseCode }))).toBe(false)
    }
  })

  it("does not retry a 5xx that only appears in the message text", () => {
    // "550 mailbox unavailable" is a bad address; retrying spams the log and
    // never succeeds.
    expect(isTransientMailError(
      Object.assign(new Error("Message failed. response=550-5.1.1 mailbox unavailable"), { code: "EENVELOPE" }),
    )).toBe(false)
  })

  it("lets a permanent code in the text override a retryable-looking error code", () => {
    expect(isTransientMailError(
      Object.assign(new Error("response=550-5.7.1 rejected"), { code: "ECONNECTION" }),
    )).toBe(false)
  })

  it("retries connection-level failures that never got a reply code", () => {
    for (const code of ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET", "EDNS", "ECONNREFUSED"]) {
      expect(isTransientMailError(Object.assign(new Error("net"), { code }))).toBe(true)
    }
  })

  it("does not retry an error it cannot classify", () => {
    // Better to log once than to hammer Gmail over something we do not
    // understand.
    expect(isTransientMailError(new Error("something odd"))).toBe(false)
    expect(isTransientMailError(undefined)).toBe(false)
    expect(isTransientMailError(null)).toBe(false)
  })

  it("makes more than one attempt", () => {
    expect(MAIL_ATTEMPTS).toBeGreaterThan(1)
  })
})

describe("the retry loop", () => {
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers() })
  afterEach(() => { jest.useRealTimers() })

  it("sends once when the first attempt works", async () => {
    send.mockResolvedValueOnce({ messageId: "1" })
    await runWithoutWaiting(sendMail(mail))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("recovers a mail that Gmail deferred with 421 — the reported failure", async () => {
    send.mockRejectedValueOnce(greeting421).mockResolvedValueOnce({ messageId: "1" })
    await runWithoutWaiting(sendMail(mail))
    expect(send).toHaveBeenCalledTimes(2)
    expect(logError).not.toHaveBeenCalled()
  })

  it("gives up after the configured number of attempts and logs once", async () => {
    send.mockRejectedValue(greeting421)
    await runWithoutWaiting(sendMail(mail))
    expect(send).toHaveBeenCalledTimes(MAIL_ATTEMPTS)
    expect(logError).toHaveBeenCalledTimes(1)
    expect((logError as jest.Mock).mock.calls[0][0]).toContain(`after ${MAIL_ATTEMPTS} attempts`)
  })

  it("does not retry a permanent rejection — one attempt, one log", async () => {
    send.mockRejectedValue(Object.assign(new Error("bad address"), { responseCode: 550 }))
    await runWithoutWaiting(sendMail(mail))
    expect(send).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledTimes(1)
  })
})
