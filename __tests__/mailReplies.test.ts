/**
 * __tests__/mailReplies.test.ts — replies to notifications (v3.83).
 *
 * Notifications go out from noreply_helpdesk@, an alias of the helpdesk
 * mailbox, so replies to them land in the intake inbox — where every mail
 * opens a ticket. The user chose: a reply is added to the ticket it is about.
 * That rests on two small things tested here: finding the ticket from the
 * HDTC-N in the subject, and cutting the quoted conversation off the reply so
 * the ticket gets what the person actually wrote. And on a third: every
 * notification subject having a number to find.
 */

import { ticketNumberFromSubject, stripQuotedReply } from "@/lib/mailIngest"
import { subjects } from "@/lib/mailSubjects"

describe("ticketNumberFromSubject", () => {
  it("finds the number in a reply to each kind of notification", () => {
    expect(ticketNumberFromSubject("Re: פנייתך התקבלה — HDTC-597")).toBe(597)
    expect(ticketNumberFromSubject("RE: תגובה חדשה על פנייתך HDTC-12: מדפסת")).toBe(12)
    expect(ticketNumberFromSubject("השב: עדכון על פנייתך HDTC-470 – בטיפול")).toBe(470)
  })

  it("ignores case", () => {
    expect(ticketNumberFromSubject("re: hdtc-5")).toBe(5)
  })

  // A forwarded thread can name several; the first is the one being continued.
  it("takes the first number when there are several", () => {
    expect(ticketNumberFromSubject("FW: HDTC-1 and HDTC-2")).toBe(1)
  })

  it("is null when the subject names no ticket", () => {
    expect(ticketNumberFromSubject("המחשב לא נדלק")).toBeNull()
    expect(ticketNumberFromSubject(undefined)).toBeNull()
  })
})

describe("stripQuotedReply", () => {
  it("cuts a Gmail reply at its English header line", () => {
    const text = "עדיין לא עובד\n\nOn Mon, Sep 14, 2026 at 11:08 AM Cristalino Helpdesk <noreply_helpdesk@cristalino.co.il> wrote:\n> פנייתך התקבלה"
    expect(stripQuotedReply(text)).toBe("עדיין לא עובד")
  })

  // Gmail's Hebrew header is wrapped in bidi marks, and ends "<addr>:".
  it("cuts a Gmail reply at its Hebrew header line, bidi marks and all", () => {
    const text = "תודה רבה!\n\n\u202bבתאריך יום ב׳, 14 בספט׳ 2026 ב-11:08 מאת \u202aCristalino Helpdesk\u202c\u200f <\u202anoreply_helpdesk@cristalino.co.il\u202c\u200f>:\u202c\n\nפנייתך התקבלה"
    expect(stripQuotedReply(text)).toBe("תודה רבה!")
  })

  it("cuts when Gmail wraps its header, leaving 'wrote:' on its own line", () => {
    const text = "ok, thanks\n\nOn Mon, Sep 14, 2026 at 11:08 AM Cristalino Helpdesk <noreply_helpdesk@cristalino.co.il>\nwrote:\n> quoted"
    expect(stripQuotedReply(text)).toBe("ok, thanks")
  })

  it("cuts an Outlook reply at its From/Sent header, in Hebrew or English", () => {
    expect(stripQuotedReply("המסך עדיין שחור\n\nמאת: Cristalino Helpdesk <noreply_helpdesk@cristalino.co.il>\nנשלח: יום שני 14 ספטמבר 2026 11:08\nאל: דנה"))
      .toBe("המסך עדיין שחור")
    expect(stripQuotedReply("still black\n\nFrom: Cristalino Helpdesk\nSent: Monday, September 14, 2026 11:08\nTo: Dana"))
      .toBe("still black")
  })

  it("cuts at an Outlook rule or Original Message marker", () => {
    expect(stripQuotedReply("fixed\n________________________________\nFrom: x")).toBe("fixed")
    expect(stripQuotedReply("fixed\n-----Original Message-----\nFrom: x")).toBe("fixed")
  })

  it("drops '>' quoted lines but keeps what is between them", () => {
    expect(stripQuotedReply("> old line\nמה שכתבתי\n> another old line")).toBe("מה שכתבתי")
  })

  it("keeps an ordinary message whole", () => {
    expect(stripQuotedReply("שורה ראשונה\nשורה שנייה: עם נקודתיים")).toBe("שורה ראשונה\nשורה שנייה: עם נקודתיים")
  })

  // Better a message with the quote still in it than an empty one.
  it("keeps the original when nothing new was written above the quote", () => {
    const text = "On Mon, Sep 14, 2026 at 11:08 AM X <x@y.co> wrote:\n> only the quote"
    expect(stripQuotedReply(text)).toBe(text)
  })
})

describe("subjects — every one names its ticket", () => {
  it.each([
    ["updatedStaff",    subjects.updatedStaff(597, "מדפסת")],
    ["inProgressUser",  subjects.inProgressUser(597)],
    ["newMessageUser",  subjects.newMessageUser(597, "מדפסת")],
    ["newMessageStaff", subjects.newMessageStaff(597, "מדפסת")],
    ["repliedToYou",    subjects.repliedToYou("דנה", 597, "מדפסת")],
    ["mentioned",       subjects.mentioned(597, "מדפסת")],
  ])("%s carries HDTC-597, findable by intake", (_name, subject) => {
    expect(subject).toContain("HDTC-597")
    expect(ticketNumberFromSubject(`Re: ${subject}`)).toBe(597)
  })
})
