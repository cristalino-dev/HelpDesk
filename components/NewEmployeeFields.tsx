/**
 * components/NewEmployeeFields.tsx — The four mandatory new-hire details
 *
 * Appears on both ticket forms (the dashboard form and the shared /open page)
 * as soon as the "עובד חדש" category is picked, and disappears again if the
 * category is changed back.
 *
 * The inputs are marked `required`, so the browser blocks the submit and points
 * at the empty one. The server re-checks anyway — see api/tickets POST — since
 * required-ness that only lives in the DOM is a suggestion, not a rule.
 *
 * Both host forms style their controls differently (the dashboard form leans on
 * global CSS, /open passes its own inline style), so the styles come in as
 * props rather than being baked in here.
 *
 * PROPS:
 *   value       {NewEmployeeDetails}  Current values, keyed by field.
 *   onChange    {(next) => void}      Called with the whole next object.
 *   disabled    {boolean}             Read-only while the form submits.
 *   inputStyle  {CSSProperties}       Optional style for each input.
 *   labelStyle  {CSSProperties}       Optional style for each label.
 */

"use client"
import { NEW_EMPLOYEE_FIELDS, type NewEmployeeDetails } from "@/lib/newEmployee"
import { T } from "@/lib/theme"

export default function NewEmployeeFields({
  value,
  onChange,
  disabled = false,
  inputStyle,
  labelStyle,
}: {
  value: NewEmployeeDetails
  onChange: (next: NewEmployeeDetails) => void
  disabled?: boolean
  inputStyle?: React.CSSProperties
  labelStyle?: React.CSSProperties
}) {
  return (
    <div style={{ backgroundColor: T.cardMuted, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ margin: 0, ...labelStyle }}>פרטי העובד החדש</label>
        <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: T.text3 }}>
          פרטים אלה נדרשים לפתיחת המשתמשים, ויתווספו לתיאור הפנייה.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {NEW_EMPLOYEE_FIELDS.map(field => (
          <div key={field.key}>
            <label htmlFor={`new-employee-${field.key}`} style={labelStyle}>
              {field.formLabel} *
            </label>
            <input
              id={`new-employee-${field.key}`}
              required
              disabled={disabled}
              type={field.key === "phone" ? "tel" : "text"}
              value={value[field.key]}
              onChange={e => onChange({ ...value, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
