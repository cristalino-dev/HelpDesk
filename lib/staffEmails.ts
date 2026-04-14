export const STAFF_EMAILS = [
  "alon@cristalino.co.il",
  "dev@cristalino.co.il",
  "helpdesk@cristalino.co.il",
  "daniel.l@cristalino.co.il",
]

/** Staff members with @mention handles for the notes system */
export const STAFF_MEMBERS = [
  { email: "alon@cristalino.co.il",     handle: "alon",     display: "אלון" },
  { email: "dev@cristalino.co.il",      handle: "dev",      display: "Dev" },
  { email: "helpdesk@cristalino.co.il", handle: "helpdesk", display: "Helpdesk" },
  { email: "daniel.l@cristalino.co.il", handle: "daniel",   display: "דניאל" },
]

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
