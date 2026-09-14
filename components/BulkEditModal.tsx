/**
 * components/BulkEditModal.tsx — Modal for bulk-updating tickets
 *
 * Allows staff and admins to update fields across all selected tickets in one batch.
 * Each field starts at "ללא שינוי" (No change). Only fields explicitly altered will be updated.
 */

"use client"
import React, { useState, useEffect } from "react"
import { T } from "@/lib/theme"
import { ticketLabel } from "@/lib/ticketType"
import { fetchFieldOptions, FieldOptions, DEFAULT_FIELD_OPTIONS } from "@/lib/fieldOptions"
import { BulkChanges, BulkUpdateResult } from "@/lib/ticketApi"

interface StaffMember {
  email: string
  display: string
}

interface RegisteredUser {
  name: string | null
  email: string
}

interface BulkEditModalProps {
  isOpen: boolean
  onClose: () => void
  selectedCount: number
  onApply: (changes: BulkChanges) => Promise<BulkUpdateResult>
  isAdmin?: boolean
  staffMembers?: StaffMember[]
  registeredUsers?: RegisteredUser[]
}

const NO_CHANGE = "__NO_CHANGE__"
const UNASSIGNED = "__UNASSIGNED__"

export default function BulkEditModal({
  isOpen,
  onClose,
  selectedCount,
  onApply,
  isAdmin = false,
  staffMembers = [],
  registeredUsers = [],
}: BulkEditModalProps) {
  const [fieldOptions, setFieldOptions] = useState<FieldOptions>(DEFAULT_FIELD_OPTIONS)
  const [status, setStatus] = useState<string>(NO_CHANGE)
  const [holdReason, setHoldReason] = useState<string>("")
  const [urgency, setUrgency] = useState<string>(NO_CHANGE)
  const [category, setCategory] = useState<string>(NO_CHANGE)
  const [platform, setPlatform] = useState<string>(NO_CHANGE)
  const [assignedTo, setAssignedTo] = useState<string>(NO_CHANGE)
  const [ownerEmail, setOwnerEmail] = useState<string>(NO_CHANGE)
  const [note, setNote] = useState<string>("")

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resultErrors, setResultErrors] = useState<{ ticketNumber?: number; type?: string; error: string }[] | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchFieldOptions().then(setFieldOptions)
      // Reset form on open
      setStatus(NO_CHANGE)
      setHoldReason("")
      setUrgency(NO_CHANGE)
      setCategory(NO_CHANGE)
      setPlatform(NO_CHANGE)
      setAssignedTo(NO_CHANGE)
      setOwnerEmail(NO_CHANGE)
      setNote("")
      setErrorMsg(null)
      setResultErrors(null)
      setSubmitting(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const hasChanges =
    status !== NO_CHANGE ||
    urgency !== NO_CHANGE ||
    category !== NO_CHANGE ||
    platform !== NO_CHANGE ||
    assignedTo !== NO_CHANGE ||
    ownerEmail !== NO_CHANGE ||
    note.trim().length > 0

  const handleSave = async () => {
    setErrorMsg(null)
    setResultErrors(null)

    if (status === "בהמתנה" && !holdReason.trim()) {
      setErrorMsg("יש להזין סיבת המתנה עבור סטטוס 'בהמתנה'")
      return
    }

    if (!hasChanges) {
      setErrorMsg("לא נבחרו שדות לשינוי")
      return
    }

    const payload: BulkChanges = {}
    if (status !== NO_CHANGE) {
      payload.status = status
      if (status === "בהמתנה") payload.holdReason = holdReason.trim()
    }
    if (urgency !== NO_CHANGE) payload.urgency = urgency
    if (category !== NO_CHANGE) payload.category = category
    if (platform !== NO_CHANGE) payload.platform = platform
    if (assignedTo !== NO_CHANGE) {
      payload.assignedTo = assignedTo === UNASSIGNED ? "" : assignedTo
    }
    if (ownerEmail !== NO_CHANGE && isAdmin) {
      payload.ownerEmail = ownerEmail
    }
    if (note.trim().length > 0) {
      payload.note = note.trim()
    }

    setSubmitting(true)
    try {
      const res = await onApply(payload)
      if (res.ok) {
        if (res.errors && res.errors.length > 0) {
          setResultErrors(res.errors)
        } else {
          onClose()
        }
      } else {
        setErrorMsg(res.error || "שגיאה בביצוע העדכון המרוכז")
      }
    } catch {
      setErrorMsg("שגיאה בביצוע העדכון המרוכז")
    } finally {
      setSubmitting(false)
    }
  }

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: `1px solid ${T.lineStrong}`,
    background: T.card,
    color: T.text,
    fontSize: "0.88rem",
    outline: "none",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: T.text,
    marginBottom: 6,
    display: "block",
  }

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: T.overlay,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(4px)",
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        style={{
          background: T.card,
          border: `1px solid ${T.line}`,
          borderRadius: 18,
          boxShadow: `0 20px 40px ${T.shadow4}`,
          width: "100%",
          maxWidth: 580,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.line}`, paddingBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: T.text }}>
              שינוי מרוכז לפניות
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: T.inkFaint }}>
              השינויים יחולו על <strong style={{ color: T.text }}>{selectedCount}</strong> פניות שנבחרו.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.2rem",
              color: T.inkFaint,
              cursor: submitting ? "default" : "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Partial failure notice if any */}
        {resultErrors && resultErrors.length > 0 && (
          <div
            style={{
              background: T.amberBg,
              border: `1px solid ${T.amberBorder}`,
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: "0.82rem",
              color: T.amberFgDeep,
            }}
          >
            <strong>חלק מהפניות לא עודכנו:</strong>
            <ul style={{ margin: "6px 0 0", paddingRight: 18, lineHeight: 1.5 }}>
              {resultErrors.map((err, idx) => (
                <li key={idx}>
                  {err.ticketNumber ? `${ticketLabel({ ticketNumber: err.ticketNumber, type: err.type })}: ` : ""}
                  {err.error}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  background: T.inverseBg,
                  color: T.inverseText,
                  border: "none",
                  borderRadius: 8,
                  padding: "4px 12px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                סגור
              </button>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div
            style={{
              background: T.redBg,
              border: `1px solid ${T.redBorder}`,
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: "0.82rem",
              color: T.redFgDeep,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Form fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Status */}
          <div>
            <label style={labelStyle}>סטטוס פנייה</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={selectStyle}
              disabled={submitting}
            >
              <option value={NO_CHANGE}>— ללא שינוי —</option>
              <option value="פתוח">פתוח</option>
              <option value="בטיפול">בטיפול</option>
              <option value="בהמתנה">בהמתנה</option>
              <option value="סגור">סגור</option>
            </select>
            {status === "בהמתנה" && (
              <div style={{ marginTop: 8 }}>
                <input
                  type="text"
                  placeholder="הזן סיבת המתנה (חובה)..."
                  value={holdReason}
                  onChange={e => setHoldReason(e.target.value)}
                  disabled={submitting}
                  style={{
                    ...selectStyle,
                    borderColor: !holdReason.trim() ? T.amberBorder : T.lineStrong,
                  }}
                />
              </div>
            )}
            {status === "סגור" && (
              <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: T.inkFaint }}>
                * סגירת פניות תקבע אוטומטית את הדחיפות ל״נמוך״. פניות סגירת משתמש עם פריטים פתוחים ידולגו.
              </p>
            )}
          </div>

          {/* Urgency / Priority */}
          <div>
            <label style={labelStyle}>דחיפות / עדיפות</label>
            <select
              value={urgency}
              onChange={e => setUrgency(e.target.value)}
              style={selectStyle}
              disabled={submitting || status === "סגור"}
            >
              <option value={NO_CHANGE}>— ללא שינוי —</option>
              {fieldOptions.urgency.map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label style={labelStyle}>קטגוריה</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={selectStyle}
              disabled={submitting}
            >
              <option value={NO_CHANGE}>— ללא שינוי —</option>
              {fieldOptions.category.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Platform */}
          <div>
            <label style={labelStyle}>פלטפורמה</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              style={selectStyle}
              disabled={submitting}
            >
              <option value={NO_CHANGE}>— ללא שינוי —</option>
              {fieldOptions.platform.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned To */}
          <div>
            <label style={labelStyle}>שיוך לטכנאי</label>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              style={selectStyle}
              disabled={submitting}
            >
              <option value={NO_CHANGE}>— ללא שינוי —</option>
              <option value={UNASSIGNED}>ללא שיוך (הסרת שיוך)</option>
              {staffMembers.map(m => (
                <option key={m.email} value={m.email}>
                  {m.display} ({m.email})
                </option>
              ))}
            </select>
          </div>

          {/* Reassign Submitter / Owner (Admin Only) */}
          {isAdmin && (
            <div>
              <label style={labelStyle}>שינוי מגיש הפנייה (אדמין בלבד)</label>
              <select
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
                style={selectStyle}
                disabled={submitting}
              >
                <option value={NO_CHANGE}>— ללא שינוי —</option>
                {registeredUsers.map(u => (
                  <option key={u.email} value={u.email}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Internal Technician Note */}
          <div>
            <label style={labelStyle}>הוספת הערת טכנאי פנימית (תוסף לכל הפניות שנבחרו)</label>
            <textarea
              rows={3}
              placeholder="הערה פנימית אופציונלית שתתווסף לכרטיס הפנייה..."
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={submitting}
              style={{
                ...selectStyle,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: T.fill,
              border: `1px solid ${T.border}`,
              color: T.text,
              borderRadius: 10,
              padding: "9px 18px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: submitting ? "default" : "pointer",
            }}
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || submitting}
            style={{
              background: hasChanges && !submitting ? T.inverseBg : T.line,
              color: hasChanges && !submitting ? T.inverseText : T.inkFaint,
              border: "none",
              borderRadius: 10,
              padding: "9px 22px",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: hasChanges && !submitting ? "pointer" : "default",
              boxShadow: hasChanges && !submitting ? `0 2px 8px ${T.shadow2}` : "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {submitting ? "מעדכן פניות..." : "החל שינויים"}
          </button>
        </div>
      </div>
    </div>
  )
}
