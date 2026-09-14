/**
 * components/RequestsDivider.tsx — where a queue's tickets end and its
 * requests begin (v3.87).
 *
 * The user asked for requests to sit below the tickets, separated from them.
 * The same language as the dashboard's "assigned to me" break: a label, a
 * count, and a rule that reads as a different kind of line from the edge of a
 * card. Placed by lib/ticketType.ts's withRequestsDivider().
 */

import { T } from "@/lib/theme"

export default function RequestsDivider({ count }: { count: number }) {
  return (
    <div role="separator" aria-label={`בקשות — ${count}`}
      style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 4px" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.greenInk, flexShrink: 0 }} />
      <span style={{ fontSize: "0.95rem", fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>בקשות</span>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: T.muted }}>{count}</span>
      <span style={{ flex: 1, height: 2, background: T.line, borderRadius: 1 }} />
    </div>
  )
}
