/**
 * __tests__/BulkEditUI.test.tsx
 *
 * Unit tests for BulkActionBar and BulkEditModal components:
 *   - BulkActionBar renders selection count and handles button clicks
 *   - Quick assign and Quick close handlers
 *   - BulkEditModal field changing and submission
 */

import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import BulkActionBar from "@/components/BulkActionBar"
import BulkEditModal from "@/components/BulkEditModal"

describe("BulkActionBar Component", () => {
  const staffMembers = [
    { email: "alon@cristalino.co.il", handle: "alon", display: "אלון כרם" },
    { email: "staff@cristalino.co.il", handle: "staff", display: "צוות IT" },
  ]

  it("does not render when selectedCount is 0", () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        onClearSelection={jest.fn()}
        onOpenBulkEdit={jest.fn()}
        onQuickClose={jest.fn()}
        onQuickAssign={jest.fn()}
        staffMembers={staffMembers}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders selection count and triggers actions when items are selected", () => {
    const onClear = jest.fn()
    const onOpenEdit = jest.fn()
    const onQuickClose = jest.fn()
    const onQuickAssign = jest.fn()

    render(
      <BulkActionBar
        selectedCount={3}
        onClearSelection={onClear}
        onOpenBulkEdit={onOpenEdit}
        onQuickClose={onQuickClose}
        onQuickAssign={onQuickAssign}
        staffMembers={staffMembers}
      />
    )

    expect(screen.getByText(/3/i)).toBeInTheDocument()
    expect(screen.getByText(/נבחרו/i)).toBeInTheDocument()

    // Test Open Edit Modal button
    const editBtn = screen.getByText(/שינוי מרוכז/i)
    fireEvent.click(editBtn)
    expect(onOpenEdit).toHaveBeenCalledTimes(1)

    // Test Quick Close button
    const closeBtn = screen.getByText(/סגור פניות/i)
    fireEvent.click(closeBtn)
    expect(onQuickClose).toHaveBeenCalledTimes(1)

    // Test Clear button
    const clearBtn = screen.getByText(/בטל בחירה/i)
    fireEvent.click(clearBtn)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it("triggers onQuickAssign when staff member is selected from quick assign menu", () => {
    const onQuickAssign = jest.fn()
    render(
      <BulkActionBar
        selectedCount={2}
        onClearSelection={jest.fn()}
        onOpenBulkEdit={jest.fn()}
        onQuickClose={jest.fn()}
        onQuickAssign={onQuickAssign}
        staffMembers={staffMembers}
      />
    )

    // Open quick assign dropdown menu
    const assignMenuBtn = screen.getByText(/שיוך מהיר/i)
    fireEvent.click(assignMenuBtn)

    // Select "אלון כרם" from menu
    const alonOption = screen.getByText(/אלון כרם/i)
    fireEvent.click(alonOption)

    expect(onQuickAssign).toHaveBeenCalledWith("alon@cristalino.co.il")
  })
})

describe("BulkEditModal Component", () => {
  const staffMembers = [
    { email: "alon@cristalino.co.il", handle: "alon", display: "אלון כרם" },
  ]
  const registeredUsers = [
    { id: "u1", name: "דני כהן", email: "dani@cristalino.co.il", phone: null, station: null, isAdmin: false },
  ]

  it("renders when isOpen is true and shows selected count", () => {
    render(
      <BulkEditModal
        isOpen={true}
        onClose={jest.fn()}
        selectedCount={5}
        onApply={jest.fn()}
        isAdmin={true}
        staffMembers={staffMembers}
        registeredUsers={registeredUsers}
      />
    )

    expect(screen.getByText(/שינוי מרוכז לפניות/i)).toBeInTheDocument()
    expect(screen.getByText(/5/i)).toBeInTheDocument()
  })

  it("applies changes when fields are modified", async () => {
    const onApply = jest.fn().mockResolvedValue({ ok: true, updatedCount: 2 })
    const onClose = jest.fn()

    render(
      <BulkEditModal
        isOpen={true}
        onClose={onClose}
        selectedCount={2}
        onApply={onApply}
        isAdmin={true}
        staffMembers={staffMembers}
        registeredUsers={registeredUsers}
      />
    )

    // Change status to "בטיפול"
    const statusSelect = screen.getAllByRole("combobox")[0]
    fireEvent.change(statusSelect, { target: { value: "בטיפול" } })

    // Submit form
    const applyBtn = screen.getByText(/החל שינויים/i)
    expect(applyBtn).not.toBeDisabled()
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "בטיפול",
        })
      )
      expect(onClose).toHaveBeenCalled()
    })
  })
})
