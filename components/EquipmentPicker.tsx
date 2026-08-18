/**
 * components/EquipmentPicker.tsx — New-employee equipment selection
 *
 * Shown on the ticket form once the "עובד חדש" category is chosen, and reused
 * by staff on the ticket detail page to add items that were forgotten.
 *
 * Each item is a toggle: click to request it, click again to drop it. A
 * selected item gets a quantity stepper (−/+) so one line can cover "two
 * screens" without adding the item twice.
 *
 * The available items come from the admin "שדות מערכת" tab (FieldOption,
 * field = "equipment") — this component only renders what it is handed.
 *
 * PROPS:
 *   options   {string[]}  Item labels to offer.
 *   value     {Record<string, number>}  label → quantity for selected items.
 *   onChange  {(next) => void}  Called with the next selection map.
 *   disabled  {boolean}  Renders read-only (during submit).
 */

"use client"
import { MAX_QUANTITY } from "@/lib/equipment"
import { T } from "@/lib/theme"

export default function EquipmentPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: string[]
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
  disabled?: boolean
}) {
  const toggle = (label: string) => {
    if (disabled) return
    const next = { ...value }
    if (next[label]) delete next[label]
    else next[label] = 1
    onChange(next)
  }

  const setQty = (label: string, qty: number) => {
    if (disabled) return
    const clamped = Math.min(MAX_QUANTITY, Math.max(1, qty))
    onChange({ ...value, [label]: clamped })
  }

  const selectedCount = Object.keys(value).length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map(label => {
          const qty = value[label]
          const selected = qty !== undefined
          return (
            <div
              key={label}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                borderRadius: 999,
                border: selected ? `1.5px solid ${T.green}` : `1px solid ${T.border}`,
                background: selected ? T.greenBg : "#fff",
                padding: selected ? "3px 6px 3px 12px" : "6px 12px",
                transition: "all 0.12s",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(label)}
                disabled={disabled}
                aria-pressed={selected}
                style={{
                  background: "none", border: "none", padding: 0,
                  cursor: disabled ? "default" : "pointer",
                  fontSize: "0.82rem",
                  fontWeight: selected ? 700 : 500,
                  color: selected ? T.greenInk : T.text2,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ fontSize: "0.75rem" }}>{selected ? "✓" : "+"}</span>
                {label}
              </button>

              {/* Quantity stepper — only once the item is actually requested */}
              {selected && (
                <span style={{ display: "flex", alignItems: "center", gap: 2, background: "#fff", borderRadius: 999, padding: "1px 3px", border: `1px solid ${T.border}` }}>
                  <button
                    type="button"
                    onClick={() => (qty <= 1 ? toggle(label) : setQty(label, qty - 1))}
                    disabled={disabled}
                    aria-label={`הפחת ${label}`}
                    style={stepBtn}
                  >−</button>
                  <span aria-label={`כמות ${label}`} style={{ minWidth: 16, textAlign: "center", fontSize: "0.78rem", fontWeight: 800, color: T.text }}>{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(label, qty + 1)}
                    disabled={disabled}
                    aria-label={`הוסף ${label}`}
                    style={stepBtn}
                  >+</button>
                </span>
              )}
            </div>
          )
        })}
      </div>

      {options.length === 0 && (
        <p style={{ margin: 0, fontSize: "0.8rem", color: T.text3 }}>
          לא הוגדרו פריטי ציוד. ניתן להוסיף אותם בלשונית &quot;שדות מערכת&quot;.
        </p>
      )}

      {selectedCount > 0 && (
        <p style={{ margin: 0, fontSize: "0.78rem", color: T.text3 }}>
          נבחרו {selectedCount} סוגי פריטים · סה&quot;כ {Object.values(value).reduce((a, b) => a + b, 0)} יחידות
        </p>
      )}
    </div>
  )
}

const stepBtn: React.CSSProperties = {
  width: 20, height: 20, borderRadius: "50%",
  border: "none", background: "#f3f4f6", color: "#374151",
  cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, lineHeight: 1,
  display: "flex", alignItems: "center", justifyContent: "center",
}
