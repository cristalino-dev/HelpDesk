/**
 * lib/mailSubjects.ts — the notification subjects that used to go out without
 * their ticket's number.
 *
 * Every subject about a ticket carries its label — HDTC-N, or REQ-N for a
 * request (v3.87). Since v3.83 that is not decoration: notifications are sent
 * from noreply_helpdesk@, which is an alias of the helpdesk mailbox, so a reply
 * to one lands back in the intake inbox — and the label in its subject ("Re:
 * תגובה חדשה על פנייתך HDTC-597: …") is how intake knows to add it to ticket
 * 597 instead of opening a new one. A subject without it turns every reply to
 * it into a duplicate ticket.
 *
 * Each subject takes the ticket (anything with ticketNumber and type), or just
 * its number, which is labelled HDTC. The subjects that always carried the
 * label (received, closed, reopened, the two new-ticket mails) build it with
 * ticketLabel() where they are. __tests__/mailSubjects.test.ts reads app/ and
 * lib/ and refuses any ticket subject without one, so a new subject cannot
 * quietly bring the problem back.
 */

import { ticketLabel } from "@/lib/ticketType"

type Ref = number | { ticketNumber: number; type?: string | null }

const tag = (t: Ref) => (typeof t === "number" ? `HDTC-${t}` : ticketLabel(t))

export const subjects = {
  /** Staff: a field or status on the ticket changed. */
  updatedStaff:    (t: Ref, subject: string) => `עדכון פנייה ${tag(t)}: ${subject}`,
  /** Owner: staff started working on it. */
  inProgressUser:  (t: Ref) => `עדכון על פנייתך ${tag(t)} – בטיפול`,
  /** Owner: staff wrote in the conversation. */
  newMessageUser:  (t: Ref, subject: string) => `תגובה חדשה על פנייתך ${tag(t)}: ${subject}`,
  /** Staff: the owner wrote in the conversation. */
  newMessageStaff: (t: Ref, subject: string) => `תגובת משתמש על פנייה ${tag(t)}: ${subject}`,
  /** One participant: someone replied to them directly. */
  repliedToYou:    (author: string, t: Ref, subject: string) => `${author} ענה לך בפנייה ${tag(t)}: ${subject}`,
  /** Staff: they were @mentioned in an internal note. */
  mentioned:       (t: Ref, subject: string) => `הוזכרת בפנייה ${tag(t)}: ${subject}`,
  /** Owner and participants of a merged ticket: where it went (v3.92). */
  merged:          (source: Ref, target: Ref) => `פנייתך ${tag(source)} אוחדה עם פנייה ${tag(target)}`,
  /** Participant: the ticket they follow closed (v3.92). */
  closedParticipant: (t: Ref, subject: string) => `הפנייה ${tag(t)} נסגרה: ${subject}`,
} as const
