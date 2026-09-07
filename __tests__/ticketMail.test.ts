/**
 * __tests__/ticketMail.test.ts — the new-ticket emails
 *
 * The staff notification shipped for a long time without the ticket number
 * anywhere in it: not in the body, not in the subject. A technician reading it
 * on a phone had the subject, the reporter and the description, and no way to
 * say which ticket it was without opening the app. That is the regression
 * these tests exist to hold shut — `ticketNumber` is on `TicketInfo`, so it is
 * silently easy to build a correct-looking mail that never renders it.
 *
 * The rest is about the mail surviving contact with a real client:
 *   • Ticket subjects and descriptions are free text. An unescaped `<` in one
 *     truncates the remainder of the message in most readers, so the escaping
 *     is asserted rather than assumed.
 *   • Hebrew mail renders left-to-right unless `dir="rtl"` is on the content
 *     elements themselves — Gmail drops it from <html>/<body>.
 *   • Colours are asserted against `lib/theme.ts` rather than hardcoded hexes,
 *     so re-branding the app cannot leave the mail behind.
 *
 * Nothing here touches the database or sends anything.
 */

import {
  mailTicketOpenedStaff,
  mailTicketOpenedUser,
  mailTicketStatusUser,
  mailNewMessageToUser,
  mailReplyNotification,
  mailDailyDigest,
  ticketUrl,
} from "@/lib/mail"
import { T, URGENCY } from "@/lib/theme"

const ticket = (overrides: Partial<Parameters<typeof mailTicketOpenedStaff>[0]> = {}) => ({
  id: "clx0000000000000000000000",
  ticketNumber: 528,
  subject: "פתיחת עובדים חדשים",
  description: "היי, ביום שלישי ב-1.9 מתחיל עובד חדש בשם יהונתן דוניץ",
  urgency: "דחוף",
  category: "אחר",
  platform: "מחשב אישי",
  phone: "0528897115",
  computerName: "",
  status: "פתוח",
  submitterName: "שירן לביא",
  submitterEmail: "shiran.l@cristalino.co.il",
  ...overrides,
})

describe("the ticket number is in the mail", () => {
  it("renders HDTC-<n> in the staff notification — the bug this file exists for", () => {
    expect(mailTicketOpenedStaff(ticket())).toContain("HDTC-528")
  })

  it("renders HDTC-<n> in the submitter's confirmation", () => {
    expect(mailTicketOpenedUser(ticket())).toContain("HDTC-528")
  })

  it("puts it in the header chip, so it is visible above the fold in both", () => {
    // The chip is the run that carries the brand green; the body mentions the
    // number too, so a bare toContain would pass without the chip.
    const chip = new RegExp(`${T.green.replace("#", "#")}[^<]*">HDTC-528<`, "i")
    expect(mailTicketOpenedStaff(ticket())).toMatch(chip)
    expect(mailTicketOpenedUser(ticket())).toMatch(chip)
  })

  it("links to that exact ticket", () => {
    expect(mailTicketOpenedStaff(ticket())).toContain(ticketUrl(528))
    expect(ticketUrl(528)).toContain("/tickets/HDTC-528")
  })

  it("does not render a chip where there is no single ticket (the digest)", () => {
    const html = mailDailyDigest([])
    expect(html).not.toMatch(/">HDTC-undefined</)
    expect(html).not.toContain("HDTC-NaN")
  })
})

describe("free text cannot break the message", () => {
  it("escapes a subject containing angle brackets", () => {
    const html = mailTicketOpenedStaff(ticket({ subject: "<script>alert(1)</script> תקלה" }))
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>alert(1)</script>")
  })

  it("escapes the description too", () => {
    const html = mailTicketOpenedStaff(ticket({ description: "צריך <b>דחוף</b> & מהר" }))
    expect(html).toContain("&lt;b&gt;")
    expect(html).toContain("&amp;")
  })

  it("escapes the submitter name and address", () => {
    const html = mailTicketOpenedStaff(ticket({ submitterName: "A <b>B</b>" }))
    expect(html).toContain("A &lt;b&gt;B&lt;/b&gt;")
  })

  it("still shows the angle brackets around the address as literal text", () => {
    // The staff mail formats the reporter as `Name <address>`; those brackets
    // are decoration and must survive escaping of the address itself.
    expect(mailTicketOpenedStaff(ticket())).toContain("&lt;shiran.l@cristalino.co.il&gt;")
  })
})

describe("empty optional fields", () => {
  it("falls back to an em dash rather than an empty row", () => {
    const html = mailTicketOpenedStaff(ticket({ phone: "", computerName: "" }))
    expect(html).toContain("—")
  })
})

describe("brand and direction", () => {
  it("uses the Cristalino dark bar and green accent from lib/theme.ts", () => {
    const html = mailTicketOpenedStaff(ticket())
    expect(html).toContain(T.dark)
    expect(html).toContain(T.green)
  })

  it("colours the urgency pill from the app's own urgency map", () => {
    const html = mailTicketOpenedStaff(ticket({ urgency: "דחוף" }))
    expect(html).toContain(`background:${URGENCY["דחוף"].bg}`)
    expect(html).toContain(`color:${URGENCY["דחוף"].fg}`)
  })

  it("marks the content right-to-left on the elements, not only on <html>", () => {
    const html = mailTicketOpenedStaff(ticket())
    // Gmail strips <html dir> and the <style> body rule; the inline ones are
    // what actually make Hebrew render correctly.
    expect(html).toContain('dir="rtl" style="direction:rtl;text-align:right')
  })

  it("frames the content in a bordered card", () => {
    expect(mailTicketOpenedStaff(ticket())).toContain(`border:1px solid ${T.border}`)
  })
})


describe("every template wears the same face", () => {
  /**
   * v3.67 rebuilt the two new-ticket mails on the brand palette and left the
   * other eight carrying Tailwind's default greys and a blue accent, so which
   * design you got depended on which mail it was. These pin the shared
   * identity: the dark header bar, the green rule, and no stray blue.
   */
  const samples = () => [
    ["staff opened",  mailTicketOpenedStaff(ticket())],
    ["user opened",   mailTicketOpenedUser(ticket())],
    ["status change", mailTicketStatusUser(ticket({ status: "בטיפול" }))],
    ["new message",   mailNewMessageToUser(ticket(), "בדקנו", "אביאל")],
    ["reply",         mailReplyNotification(ticket(), "תודה", "משה", "אביאל", "m1")],
  ] as const

  it.each(samples())("%s carries the brand dark and green", (_name, html) => {
    expect(html).toContain(T.dark)
    expect(html).toContain(T.green)
  })

  it.each(samples())("%s has no leftover Tailwind grey or blue", (_name, html) => {
    // The exact values that used to differ between templates.
    for (const stale of ["#6b7280", "#374151", "#2563eb", "#f0f9ff", "#f9fafb", "#6366f1"]) {
      expect(html.toLowerCase()).not.toContain(stale)
    }
  })

  it("escapes free text in the templates v3.67 did not touch", () => {
    // An unescaped "<" in a reply truncates the rest of the message.
    const html = mailReplyNotification(
      ticket({ subject: "<b>דחוף</b>" }), "<script>alert(1)</script>", "משה", "אביאל", "m1",
    )
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;b&gt;")
  })

  it("escapes the message body on its way to a technician", () => {
    const html = mailNewMessageToUser(ticket(), "צריך <b>עכשיו</b>", "אביאל")
    expect(html).toContain("&lt;b&gt;")
  })
})
