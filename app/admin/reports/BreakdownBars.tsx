/**
 * app/admin/reports/BreakdownBars.tsx — ranked horizontal bars
 *
 * "Which kind of ticket was it" as a picture: one row per value, longest
 * first, with the count and its share of the period.
 */

"use client"
import { T } from "@/lib/theme"
import type { Slice } from "@/lib/reports"

/**
 * Ranked horizontal bars. The categories are nominal — "תוכנה" is not more or
 * less than "חומרה" — so every bar takes the SAME hue (categorical slot 1) and
 * length alone carries the magnitude. Coloring each bar differently would
 * spend the identity channel re-encoding what length already shows.
 */
export default function BreakdownBars({ rows, colors }: { rows: Slice[]; colors?: Record<string, { bg: string; fg: string }> }) {
  if (rows.length === 0) return <p style={{ color: T.muted, fontSize: "0.85rem", margin: 0 }}>אין נתונים בטווח הזה</p>
  const max = Math.max(...rows.map(r => r.count))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(74px, 128px) 1fr auto", alignItems: "center", gap: 11 }}>
          <span style={{ fontSize: "0.82rem", color: T.text2, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>
            {r.label}
          </span>
          <div style={{ background: T.cardMuted, borderRadius: 4, height: 18, overflow: "hidden" }}>
            <div
              title={`${r.label}: ${r.count}`}
              style={{
                width: `${(r.count / max) * 100}%`, height: "100%", minWidth: 3,
                // Growing right→left inside the RTL page: the rounded data-end
                // is the LEFT edge, square against the baseline on the right.
                borderRadius: "4px 0 0 4px",
                background: colors?.[r.label]?.fg ?? "#2a78d6",
              }}
            />
          </div>
          <span style={{ fontSize: "0.82rem", color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 52, textAlign: "left" }}>
            {r.count}
            <span style={{ color: T.muted, fontWeight: 500, fontSize: "0.74rem" }}> {Math.round(r.share * 100)}%</span>
          </span>
        </div>
      ))}
    </div>
  )
}
