/**
 * lib/mailSubjects.ts — the notification subjects that used to go out without
 * their ticket's number.
 *
 * Every subject about a ticket carries HDTC-N. Since v3.83 that is not
 * decoration: notifications are sent from noreply_helpdesk@, which is an alias
 * of the helpdesk mailbox, so a reply to one lands back in the intake inbox —
 * and the number in its subject ("Re: תגובה חדשה על פנייתך HDTC-597: …") is
 * how intake knows to add it to ticket 597 instead of opening a new one.
 * A subject without the number turns every reply to it into a duplicate ticket.
 *
 * The subjects that always carried the number (received, closed, reopened,
 * the two new-ticket mails) stay where they are. __tests__/mailSubjects.test.ts
 * reads app/ and lib/ and refuses any ticket subject without "HDTC-", so a new
 * one cannot quietly bring the problem back.
 */

const tag = (n: number) => `HDTC-${n}`

export const subjects = {
  /** Staff: a field or status on the ticket changed. */
  updatedStaff:    (n: number, subject: string) => `עדכון פנייה ${tag(n)}: ${subject}`,
  /** Owner: staff started working on it. */
  inProgressUser:  (n: number) => `עדכון על פנייתך ${tag(n)} – בטיפול`,
  /** Owner: staff wrote in the conversation. */
  newMessageUser:  (n: number, subject: string) => `תגובה חדשה על פנייתך ${tag(n)}: ${subject}`,
  /** Staff: the owner wrote in the conversation. */
  newMessageStaff: (n: number, subject: string) => `תגובת משתמש על פנייה ${tag(n)}: ${subject}`,
  /** One participant: someone replied to them directly. */
  repliedToYou:    (author: string, n: number, subject: string) => `${author} ענה לך בפנייה ${tag(n)}: ${subject}`,
  /** Staff: they were @mentioned in an internal note. */
  mentioned:       (n: number, subject: string) => `הוזכרת בפנייה ${tag(n)}: ${subject}`,
} as const
