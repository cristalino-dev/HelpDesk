/**
 * components/BulkActionBar.tsx — Floating/Sticky Bar for Bulk Ticket Actions
 *
 * Appears when 1 or more tickets are selected.
 * Provides quick actions: bulk edit modal trigger, quick close, quick technician assignment,
 * and clear selection.
 */

"use client"
import React, { useState } from "react"
import { T } from "@/lib/theme"

interface StaffMember {
  email: string
  display: string
}

interface BulkActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  onOpenBulkEdit: () => void
  onQuickClose?: () => void
  onQuickAssign?: (staffEmail: string) => void
  staffMembers?: StaffMember[]
  loading?: boolean
}

export default function BulkActionBar({
  selectedCount,
  onClearSelection,
  onOpenBulkEdit,
  onQuickClose,
  onQuickAssign,
  staffMembers = [],
  loading = false,
}: BulkActionBarProps) {
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)

  if (selectedCount === 0) return null

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        width: "calc(100% - 32px)",
        maxWidth: 720,
        background: T.card,
        border: `1px solid ${T.lineStrong}`,
        borderRadius: 16,
        padding: "12px 18px",
        boxShadow: `0 8px 30px ${T.shadow4}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Selection count and clear button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            background: T.codeBg,
            color: T.text,
            fontWeight: 800,
            fontSize: "0.85rem",
            padding: "4px 10px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
          }}
        >
          {selectedCount} נבחרו
        </div>
        <button
          onClick={onClearSelection}
          disabled={loading}
          style={{
            background: "none",
            border: "none",
            color: T.inkFaint,
            fontSize: "0.82rem",
            cursor: loading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: 6,
          }}
          onMouseOver={e => (e.currentTarget.style.color = T.text)}
          onMouseOut={e => (e.currentTarget.style.color = T.inkFaint)}
        >
          <span>✕</span>
          <span>בטל בחירה</span>
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Quick Assign Dropdown */}
        {onQuickAssign && staffMembers.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowAssignDropdown(p => !p)}
              disabled={loading}
              style={{
                background: T.fill,
                border: `1px solid ${T.border}`,
                color: T.text,
                fontSize: "0.82rem",
                fontWeight: 600,
                padding: "8px 12px",
                borderRadius: 10,
                cursor: loading ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>👤 שיוך מהיר</span>
              <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>▼</span>
            </button>

            {showAssignDropdown && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  right: 0,
                  background: T.card,
                  border: `1px solid ${T.line}`,
                  borderRadius: 12,
                  boxShadow: `0 8px 24px ${T.shadow3}`,
                  padding: "6px",
                  zIndex: 110,
                  minWidth: 180,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <button
                  onClick={() => {
                    setShowAssignDropdown(false)
                    onQuickAssign("")
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    textAlign: "right",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: "0.82rem",
                    color: T.inkFaint,
                    cursor: "pointer",
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = T.fill)}
                  onMouseOut={e => (e.currentTarget.style.background = "none")}
                >
                  ללא שיוך (הסרת שיוך)
                </button>
                {staffMembers.map(m => (
                  <button
                    key={m.email}
                    onClick={() => {
                      setShowAssignDropdown(false)
                      onQuickAssign(m.email)
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      textAlign: "right",
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      color: T.text,
                      cursor: "pointer",
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = T.fill)}
                    onMouseOut={e => (e.currentTarget.style.background = "none")}
                  >
                    {m.display}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Close Button */}
        {onQuickClose && (
          <button
            onClick={onQuickClose}
            disabled={loading}
            style={{
              background: T.greenSBg,
              border: `1px solid ${T.greenSBorder}`,
              color: T.greenSFgDeep,
              fontSize: "0.82rem",
              fontWeight: 700,
              padding: "8px 14px",
              borderRadius: 10,
              cursor: loading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            סגור פניות
          </button>
        )}

        {/* Full Bulk Edit Button */}
        <button
          onClick={onOpenBulkEdit}
          disabled={loading}
          style={{
            background: T.inverseBg,
            border: "none",
            color: T.inverseText,
            fontSize: "0.82rem",
            fontWeight: 700,
            padding: "8px 16px",
            borderRadius: 10,
            cursor: loading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: `0 2px 6px ${T.shadow2}`,
          }}
        >
          <span>✏️ שינוי מרוכז</span>
        </button>
      </div>
    </div>
  )
}
