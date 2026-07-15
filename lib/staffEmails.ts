// NOTE: this list is used for AUTHORIZATION (who may act as staff) and as a
// last-resort fallback. Email NOTIFICATION recipients are DB-driven — every
// user flagged isAdmin in the admin users table (lib/staffMembers.ts).
export const STAFF_EMAILS = [
  "alon@cristalino.co.il",
  "dev@cristalino.co.il",
  "helpdesk@cristalino.co.il",
]

/** Read-only observers — can view all tickets but cannot modify anything */
export const VIEWER_EMAILS = [
  "ran@cristalino.co.il",
  "itay@cristalino.co.il",
]

/** Staff members with @mention handles for the notes system */
export const STAFF_MEMBERS = [
  { email: "alon@cristalino.co.il",     handle: "alon",     display: "אלון" },
  { email: "dev@cristalino.co.il",      handle: "dev",      display: "Dev" },
  { email: "helpdesk@cristalino.co.il", handle: "helpdesk", display: "Helpdesk" },
]

/**
 * The automation bot — a virtual assignee for tickets handled by an external
 * script (not a real person, not a DB user). It is always offered in the
 * "assign to" dropdown (see lib/staffMembers.ts getAssignableMembers), but is
 * NEVER a notification recipient and has no staff privileges: the external
 * script picks up its tickets by querying assignedTo === BOT_EMAIL. sendMail
 * filters this address out so nothing bounces off a non-existent mailbox.
 * The 🤖 in the display shows as a robot icon in the native <select> options.
 */
export const BOT_EMAIL = "bot@cristalino.co.il"
export const BOT_MEMBER = { email: BOT_EMAIL, handle: "bot", display: "🤖 בוט" }

/** Roster shown in assignment dropdowns before /api/staff resolves (client
 *  fallback): the hardcoded staff plus the automation bot. */
export const ASSIGNABLE_FALLBACK = [...STAFF_MEMBERS, BOT_MEMBER]

/** Extract mentioned staff emails from note content (e.g. "@alon" → email) */
export function parseMentions(content: string): string[] {
  const mentioned: string[] = []
  for (const m of STAFF_MEMBERS) {
    if (content.toLowerCase().includes(`@${m.handle}`)) {
      mentioned.push(m.email)
    }
  }
  return mentioned
}
