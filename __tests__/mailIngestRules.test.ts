/**
 * __tests__/mailIngestRules.test.ts — "every mail that goes to helpdesk@
 * opens a ticket" (v3.82), and what that must NOT include.
 *
 * Until v3.81 a subject keyword was the only gate on ingestion, and it was
 * quietly doing a second job: keeping the app from ingesting its own mail. The
 * app writes to helpdesk@ itself (a status change on a ticket assigned to
 * helpdesk@, the default assignee). Take "every mail" literally and that mail
 * opens a ticket "from" helpdesk@, whose confirmation goes back to helpdesk@,
 * which opens another — every two minutes, with no end. An out-of-office
 * answering our confirmation is the same loop through someone else's mailbox.
 *
 * These tests pin the rules that make "every mail" safe: the cutoff before the
 * 929-message backlog, our own addresses (with the one exception — mail we
 * relayed for a person), bounces, auto-replies — and the stricter rules for
 * our own automatic reply, including its circuit breaker.
 */

import {
  buildIngestedTicket,
  ingestSince,
  ownAddresses,
  headerValue,
  inboundMeta,
  skipReason,
  isRelayed,
  isNoReplyAddress,
  mayAutoRespond,
  INGEST_DEFAULTS,
  INGEST_START,
  INGEST_FALLBACK_EMAIL,
  KEYWORD_URGENCY,
  HELPDESK_ADDRESS,
  AUTO_RESPOND_MAX_PER_SENDER,
  type HeaderLine,
} from "@/lib/mailIngest"

const h = (key: string, value: string): HeaderLine => ({ key: key.toLowerCase(), line: `${key}: ${value}` })
const NOREPLY = "noreply_helpdesk@cristalino.co.il"
const own = ownAddresses("helpdesk@cristalino.co.il", NOREPLY)

describe("buildIngestedTicket — mail without the keyword", () => {
  // The keyword no longer decides WHETHER; it still decides urgency. Without
  // that, a reply saying "thanks" would open an urgent ticket and top the queue.
  it("opens a ticket at the web-form default urgency, subject untouched", () => {
    const t = buildIngestedTicket({ subject: "המדפסת בקומה 2 לא מדפיסה", text: "x", fromEmail: "a@cristalino.co.il" })
    expect(t.subject).toBe("המדפסת בקומה 2 לא מדפיסה")
    expect(t.urgency).toBe("בינוני")
    expect(t.urgency).toBe(INGEST_DEFAULTS.urgency)
  })

  it("still makes it urgent when the keyword is there, in any case", () => {
    expect(buildIngestedTicket({ subject: "TICKET - מסך שחור", fromEmail: "a@b.co" }).urgency).toBe(KEYWORD_URGENCY)
  })
})

describe("ingestSince — the cutoff", () => {
  it("defaults to INGEST_START", () => {
    expect(ingestSince(undefined).toISOString()).toBe(new Date(INGEST_START).toISOString())
  })

  it("honours INGEST_SINCE when it parses", () => {
    expect(ingestSince("2026-01-01T00:00:00Z").toISOString()).toBe("2026-01-01T00:00:00.000Z")
  })

  // A typo in the env must not silently mean "since the beginning of time" —
  // that is exactly the 929-ticket flood the cutoff exists to prevent.
  it("falls back to INGEST_START on an unparseable value, never to no cutoff", () => {
    expect(ingestSince("next tuesday").toISOString()).toBe(new Date(INGEST_START).toISOString())
  })
})

describe("ownAddresses", () => {
  it("normalises, always includes the helpdesk mailbox, and adds finegold twins once each", () => {
    expect(ownAddresses("  Helpdesk@Cristalino.co.il ")).toEqual(["helpdesk@cristalino.co.il", "helpdesk@finegold.co.il"])
  })

  // v3.82 moved outgoing mail to a no-reply sender. Mail from it that lands in
  // helpdesk@ is still ours and must still be skipped.
  it("covers the no-reply sender alongside SMTP_USER", () => {
    expect(own).toEqual(expect.arrayContaining([
      "helpdesk@cristalino.co.il", NOREPLY, "helpdesk@finegold.co.il", "noreply_helpdesk@finegold.co.il",
    ]))
  })

  it("works with nothing configured at all", () => {
    expect(ownAddresses(undefined, null)).toContain(HELPDESK_ADDRESS)
  })
})

describe("headerValue / inboundMeta", () => {
  const lines: HeaderLine[] = [
    h("Auto-Submitted", "auto-replied"),
    { key: "content-type", line: "Content-Type: multipart/report;\r\n report-type=delivery-status" },
  ]

  it("reads a header's value by case-insensitive key", () => {
    expect(headerValue(lines, "AUTO-SUBMITTED")).toBe("auto-replied")
  })

  it("unfolds a header that spans lines", () => {
    expect(headerValue(lines, "content-type")).toBe("multipart/report; report-type=delivery-status")
  })

  it("returns '' for a missing header, or no headers at all", () => {
    expect(headerValue(lines, "precedence")).toBe("")
    expect(headerValue(undefined, "precedence")).toBe("")
  })

  it("lowercases the addresses it keeps", () => {
    const m = inboundMeta(" Dana@Cristalino.co.il ", "s", null, [], "Moshe@Cristalino.co.il")
    expect(m.fromEmail).toBe("dana@cristalino.co.il")
    expect(m.replyTo).toBe("moshe@cristalino.co.il")
  })
})

describe("skipReason — machinery, not a person writing in", () => {
  const since = new Date("2026-09-14T00:00:00+03:00")
  const later = new Date("2026-09-15T10:00:00+03:00")
  const meta = (from: string, lines: HeaderLine[] = [], receivedAt: Date | null = later, replyTo?: string) =>
    inboundMeta(from, "נושא", receivedAt, lines, replyTo)

  it("lets an ordinary email through", () => {
    expect(skipReason(meta("dana@cristalino.co.il"), { since, own })).toBeNull()
  })

  it("lets an external sender through — every mail means every mail", () => {
    expect(skipReason(meta("orders@supplier.co.il"), { since, own })).toBeNull()
  })

  // The 929-message backlog.
  it("skips mail that arrived before the cutoff", () => {
    expect(skipReason(meta("dana@cristalino.co.il", [], new Date("2026-08-01")), { since, own })).toBe("before-start")
  })

  it("does not treat a message with no receive date as backlog", () => {
    expect(skipReason(meta("dana@cristalino.co.il", [], null), { since, own })).toBeNull()
  })

  // The loop.
  it("skips mail from any of our own addresses, in either domain and any case", () => {
    expect(skipReason(meta("helpdesk@cristalino.co.il"), { since, own })).toBe("own-address")
    expect(skipReason(meta("HELPDESK@finegold.co.il"), { since, own })).toBe("own-address")
    expect(skipReason(meta(NOREPLY), { since, own })).toBe("own-address")
  })

  it("skips bounces — by sender, and by delivery-status report", () => {
    expect(skipReason(meta("mailer-daemon@googlemail.com"), { since, own })).toBe("bounce")
    expect(skipReason(meta("postmaster@partner.co.il"), { since, own })).toBe("bounce")
    expect(skipReason(meta("x@y.co", [h("Content-Type", "multipart/report; report-type=delivery-status")]), { since, own })).toBe("bounce")
  })

  it("skips auto-replies, however they label themselves", () => {
    for (const header of [
      h("Auto-Submitted", "auto-replied"),
      h("Auto-Submitted", "auto-generated"),
      h("X-Autoreply", "yes"),
      h("X-Autorespond", "1"),
      h("Precedence", "auto_reply"),
    ]) {
      expect(skipReason(meta("dana@cristalino.co.il", [header]), { since, own })).toBe("auto-reply")
    }
  })

  it("does not skip mail that explicitly says Auto-Submitted: no", () => {
    expect(skipReason(meta("dana@cristalino.co.il", [h("Auto-Submitted", "no")]), { since, own })).toBeNull()
  })

  // Ingestion takes list and bulk mail — "every mail" — but our automatic
  // reply does not answer it; see mayAutoRespond.
  it("does not skip list or bulk mail", () => {
    expect(skipReason(meta("news@vendor.com", [h("Precedence", "bulk")]), { since, own })).toBeNull()
  })

  // The contact form mails helpdesk@ as the system with the employee in
  // Reply-To. That is a person writing in, and it must not be lost as "ours".
  it("lets through mail we relayed for a person — the contact form", () => {
    expect(skipReason(meta("helpdesk@cristalino.co.il", [], later, "dana@cristalino.co.il"), { since, own })).toBeNull()
  })
})

describe("isRelayed — the one exception to 'our own mail'", () => {
  const meta = (from: string, replyTo?: string, lines: HeaderLine[] = []) => inboundMeta(from, "s", null, lines, replyTo)

  it("is true for our address with a person in Reply-To", () => {
    expect(isRelayed(meta("helpdesk@cristalino.co.il", "dana@cristalino.co.il"), own)).toBe(true)
  })

  it("is false for mail from anyone else, Reply-To or not", () => {
    expect(isRelayed(meta("dana@cristalino.co.il", "moshe@cristalino.co.il"), own)).toBe(false)
  })

  it("is false when there is no Reply-To, or it points back at us", () => {
    expect(isRelayed(meta("helpdesk@cristalino.co.il"), own)).toBe(false)
    expect(isRelayed(meta("helpdesk@cristalino.co.il", NOREPLY), own)).toBe(false)
  })

  // sendMail() marks every automated mail Auto-Submitted. Even if a Reply-To
  // were ever added to it, our own notifications must not qualify.
  it("is never true for automated mail, whatever the Reply-To says", () => {
    expect(isRelayed(meta(NOREPLY, "dana@cristalino.co.il", [h("Auto-Submitted", "auto-generated")]), own)).toBe(false)
  })
})

describe("mayAutoRespond — the stricter rules for our automatic reply", () => {
  const meta = (from: string, lines: HeaderLine[] = []) => inboundMeta(from, "s", new Date(), lines)
  const reply = (from: string, lines: HeaderLine[] = [], sent = 0) => mayAutoRespond(meta(from, lines), from, sent)

  it("answers an ordinary sender", () => {
    expect(reply("dana@cristalino.co.il")).toBe(true)
  })

  it("never answers mailing lists or bulk mail (RFC 3834)", () => {
    expect(reply("a@b.co", [h("Precedence", "list")])).toBe(false)
    expect(reply("a@b.co", [h("Precedence", "bulk")])).toBe(false)
    expect(reply("a@b.co", [h("Precedence", "junk")])).toBe(false)
    expect(reply("a@b.co", [h("List-Id", "<it.cristalino.co.il>")])).toBe(false)
  })

  it("never answers an address that cannot read it", () => {
    expect(reply("no-reply@accounts.google.com")).toBe(false)
    expect(mayAutoRespond(meta(""), "", 0)).toBe(false)
    expect(mayAutoRespond(meta(""), INGEST_FALLBACK_EMAIL, 0)).toBe(false)
  })

  // Relayed mail arrives FROM our no-reply sender. The reply is addressed to
  // the person in Reply-To, and it is their address the rules must judge.
  it("judges the recipient, not the From — so a relayed message is still answered", () => {
    expect(mayAutoRespond(meta(NOREPLY), "dana@cristalino.co.il", 0)).toBe(true)
  })

  it("honours a sender that asked for no auto-replies — only for the values that mean it", () => {
    expect(reply("a@b.co", [h("X-Auto-Response-Suppress", "All")])).toBe(false)
    expect(reply("a@b.co", [h("X-Auto-Response-Suppress", "DR, AutoReply")])).toBe(false)
    expect(reply("a@b.co", [h("X-Auto-Response-Suppress", "DR")])).toBe(true)
  })

  // The circuit breaker. An auto-responder that does not label itself would
  // ping-pong with us forever; stop answering and it has nothing to answer.
  it("stops answering one sender once the per-sender budget is spent", () => {
    expect(reply("dana@cristalino.co.il", [], AUTO_RESPOND_MAX_PER_SENDER - 1)).toBe(true)
    expect(reply("dana@cristalino.co.il", [], AUTO_RESPOND_MAX_PER_SENDER)).toBe(false)
  })
})

describe("isNoReplyAddress", () => {
  it.each([
    "noreply@x.co", "no-reply@x.co", "no_reply@x.co", "donotreply@x.co",
    "do-not-reply@x.co", "notifications-noreply@x.co", NOREPLY,
  ])("recognises %s", a => expect(isNoReplyAddress(a)).toBe(true))

  it("leaves a real person alone", () => {
    expect(isNoReplyAddress("reply.person@x.co")).toBe(false)
  })
})
