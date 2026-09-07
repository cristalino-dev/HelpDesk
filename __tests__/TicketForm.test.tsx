import "@testing-library/jest-dom"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import TicketForm from "@/components/TicketForm"
import { DEFAULT_FIELD_OPTIONS } from "@/lib/fieldOptions"

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  // Default mock for field-options GET request
  mockFetch.mockImplementation((url) => {
    if (url === "/api/admin/field-options") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS)
      })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({})
    })
  })
})

/**
 * TicketForm.test.tsx
 * 
 * Test suite for the Ticket Creation Form component.
 * Verifies field rendering, validation tooltips, loading states, and 
 * successful/failed submissions with API mocking.
 */

describe("TicketForm", () => {
  /**
   * ARRANGE: Initial render
   * ASSERT: Check that all localized Hebrew labels and required fields are present.
   */
  it("renders all required fields", () => {
    render(<TicketForm onSuccess={jest.fn()} />)

    expect(screen.getByText("נושא הפנייה *")).toBeInTheDocument()
    expect(screen.getByText("שם מחשב")).toBeInTheDocument()
    expect(screen.getByText("טלפון *")).toBeInTheDocument()
    expect(screen.getByText("קטגוריה")).toBeInTheDocument()
    expect(screen.getByText("פלטפורמה")).toBeInTheDocument()
    expect(screen.getByText("דחיפות")).toBeInTheDocument()
    expect(screen.getByText("תיאור מפורט *")).toBeInTheDocument()
  })

  it("renders submit button", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("button", { name: "שלח פנייה" })).toBeInTheDocument()
  })

  it("has correct default urgency (בינוני)", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const urgencySelect = screen.getByDisplayValue("בינוני")
    expect(urgencySelect).toBeInTheDocument()
  })

  it("has correct default category (אחר)", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const categorySelect = screen.getByDisplayValue("אחר")
    expect(categorySelect).toBeInTheDocument()
  })

  it("has correct default platform (מחשב אישי)", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const platformSelect = screen.getByDisplayValue("מחשב אישי")
    expect(platformSelect).toBeInTheDocument()
  })

  it("renders all urgency options", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("option", { name: "נמוך" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "בינוני" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "גבוה" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "דחוף" })).toBeInTheDocument()
  })

  it("renders all category options", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("option", { name: "חומרה" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "תוכנה" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "רשת" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "מדפסת" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "אחר" })).toBeInTheDocument()
  })

  it("renders all platform options", () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    expect(screen.getByRole("option", { name: "comax" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "comax sales tracker" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "אנדרואיד" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "אייפד" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "מחשב אישי" })).toBeInTheDocument()
  })

  it("shows tooltip when hovering over ? button", async () => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const tooltipButton = screen.getByRole("button", { name: "כיצד למצוא שם מחשב" })
    fireEvent.mouseEnter(tooltipButton)
    expect(screen.getByText("כיצד למצוא שם מחשב?")).toBeInTheDocument()
    fireEvent.mouseLeave(tooltipButton)
    expect(screen.queryByText("כיצד למצוא שם מחשב?")).not.toBeInTheDocument()
  })

  it("pre-populates phone and station from defaults", () => {
    render(<TicketForm onSuccess={jest.fn()} defaultPhone="050-1234567" defaultStation="PC-TEST-01" />)
    expect(screen.getByPlaceholderText("050-0000000")).toHaveValue("050-1234567")
    expect(screen.getByPlaceholderText("לדוגמה: PC-ALON-01")).toHaveValue("PC-TEST-01")
  })

  it("shows loading state while submitting", async () => {
    mockFetch.mockImplementation((url) => {
      if (url === "/api/tickets") return new Promise(() => {}) // never resolves
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS)
      })
    })

    render(<TicketForm onSuccess={jest.fn()} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "בעיה בהדפסה")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-TEST-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-1234567")
    await user.type(screen.getByPlaceholderText(/פרט את הבעיה בצורה מלאה/), "המדפסת לא מגיבה")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    expect(screen.getByRole("button", { name: "שולח..." })).toBeDisabled()
  })

  /**
   * ARRANGE: Setup user-event and mock a successful API response
   * ACT: Fill in all required fields and click submit
   * ASSERT: Verify that the success callback is called and form is cleared
   */
  it("calls onSuccess and resets form after successful submit", async () => {
    mockFetch.mockImplementation((url) => {
      if (url === "/api/tickets") {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ id: "test-id" }) 
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS)
      })
    })
    const onSuccess = jest.fn()

    render(<TicketForm onSuccess={onSuccess} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "בעיה בהדפסה")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-TEST-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-1234567")
    await user.type(screen.getByPlaceholderText(/פרט את הבעיה בצורה מלאה/), "המדפסת לא מגיבה")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(screen.getByPlaceholderText("תאר בקצרה את הבעיה")).toHaveValue("")
  })

  it("shows error message when submit fails", async () => {
    mockFetch.mockImplementation((url) => {
      if (url === "/api/tickets") {
        return Promise.resolve({ ok: false })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS)
      })
    })

    render(<TicketForm onSuccess={jest.fn()} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "בעיה")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-0000000")
    await user.type(screen.getByPlaceholderText(/פרט את הבעיה בצורה מלאה/), "תיאור")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    await waitFor(() => expect(screen.getByText("אירעה שגיאה. נסו שנית.")).toBeInTheDocument())
  })

  /**
   * ARRANGE: Mock successful submission
   * ACT: Submit specific values
   * ASSERT: Ensure the fetch payload correctly contains mapped fields (JSON matching)
   */
  it("sends correct payload to API", async () => {
    mockFetch.mockImplementation((url) => {
      if (url === "/api/tickets") {
        return Promise.resolve({ 
          ok: true, 
          json: () => Promise.resolve({ id: "test-id" }) 
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS)
      })
    })
    const onSuccess = jest.fn()

    render(<TicketForm onSuccess={onSuccess} />)
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "מסך שחור")
    await user.type(screen.getByPlaceholderText("לדוגמה: PC-ALON-01"), "PC-ALON-01")
    await user.type(screen.getByPlaceholderText("050-0000000"), "050-9999999")
    await user.type(screen.getByPlaceholderText(/פרט את הבעיה בצורה מלאה/), "המסך נכבה פתאום")

    await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(call => call[0] === "/api/tickets")
      expect(postCall).toBeDefined()
    })
    const postCall = mockFetch.mock.calls.find(call => call[0] === "/api/tickets")
    const body = JSON.parse(postCall[1].body)
    expect(body).toHaveProperty("platform", "מחשב אישי")
  })

  /**
   * ON-BEHALF-OF picker — admins can file a ticket in another employee's name.
   * The picker must be invisible to non-admins, and the chosen identity must
   * travel to the API as onBehalfOfEmail.
   */
  describe("open in someone else's name (admin)", () => {
    const USERS = [
      { id: "u1", name: "דנה כהן", email: "dana@cristalino.co.il", phone: "050-2222222", station: "PC-DANA" },
      { id: "u2", name: null,      email: "guy@cristalino.co.il",  phone: null,           station: null },
    ]

    /** Mocks field-options, the admin user list, and a successful ticket POST. */
    const mockAdminFetch = () => {
      mockFetch.mockImplementation((url) => {
        if (url === "/api/users")   return Promise.resolve({ ok: true, json: () => Promise.resolve(USERS) })
        if (url === "/api/tickets") return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "t1" }) })
        return Promise.resolve({ ok: true, json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS) })
      })
    }

    /** Fills the four required ticket fields and submits. */
    const fillAndSubmit = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "אין רשת")
      await user.type(screen.getByPlaceholderText("050-0000000"), "050-3333333")
      await user.type(screen.getByPlaceholderText(/פרט את הבעיה בצורה מלאה/), "הכבל מנותק")
      await user.click(screen.getByRole("button", { name: "שלח פנייה" }))
    }

    /** Returns the parsed JSON body of the POST /api/tickets call. */
    const postBody = () =>
      JSON.parse(mockFetch.mock.calls.find(c => c[0] === "/api/tickets")[1].body)

    it("is hidden for non-admins", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} />)

      expect(screen.queryByText("פתיחת פנייה בשם")).not.toBeInTheDocument()
      // Non-admins must not even hit the admin-only users endpoint
      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      expect(mockFetch.mock.calls.some(c => c[0] === "/api/users")).toBe(false)
    })

    it("lists every registered user plus a new-user option for admins", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} isAdmin />)

      expect(screen.getByText("פתיחת פנייה בשם")).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByRole("option", { name: "דנה כהן — dana@cristalino.co.il" })).toBeInTheDocument()
      )
      // A user with no display name falls back to their email
      expect(screen.getByRole("option", { name: "guy@cristalino.co.il" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "➕ משתמש חדש…" })).toBeInTheDocument()
      expect(screen.getByRole("option", { name: "— בשמי —" })).toBeInTheDocument()
    })

    it("sends onBehalfOfEmail when an existing user is picked", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} isAdmin />)
      const user = userEvent.setup()

      await waitFor(() => expect(screen.getByRole("option", { name: /דנה כהן/ })).toBeInTheDocument())
      await user.selectOptions(screen.getByRole("combobox", { name: "פתיחת פנייה בשם" }), "dana@cristalino.co.il")
      await fillAndSubmit(user)

      await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === "/api/tickets")).toBe(true))
      expect(postBody().onBehalfOfEmail).toBe("dana@cristalino.co.il")
    })

    it("pre-fills phone and computer name from the picked user's profile", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} isAdmin defaultPhone="050-9999999" defaultStation="PC-ADMIN" />)
      const user = userEvent.setup()

      await waitFor(() => expect(screen.getByRole("option", { name: /דנה כהן/ })).toBeInTheDocument())
      await user.selectOptions(screen.getByRole("combobox", { name: "פתיחת פנייה בשם" }), "dana@cristalino.co.il")

      expect(screen.getByPlaceholderText("050-0000000")).toHaveValue("050-2222222")
      expect(screen.getByPlaceholderText("לדוגמה: PC-ALON-01")).toHaveValue("PC-DANA")
    })

    it("reveals email and name inputs for a brand-new user and sends both", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} isAdmin />)
      const user = userEvent.setup()

      await waitFor(() => expect(screen.getByRole("option", { name: "➕ משתמש חדש…" })).toBeInTheDocument())
      expect(screen.queryByPlaceholderText("name@cristalino.co.il")).not.toBeInTheDocument()

      await user.selectOptions(screen.getByRole("combobox", { name: "פתיחת פנייה בשם" }), "__new__")
      await user.type(screen.getByPlaceholderText("name@cristalino.co.il"), "newhire@cristalino.co.il")
      await user.type(screen.getByPlaceholderText("ישראל ישראלי"), "עובד חדש")
      await fillAndSubmit(user)

      await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === "/api/tickets")).toBe(true))
      expect(postBody()).toMatchObject({
        onBehalfOfEmail: "newhire@cristalino.co.il",
        onBehalfOfName:  "עובד חדש",
      })
    })

    it("omits the field entirely when the admin files under their own name", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} isAdmin />)
      const user = userEvent.setup()

      await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === "/api/users")).toBe(true))
      await fillAndSubmit(user)

      await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === "/api/tickets")).toBe(true))
      expect(postBody()).not.toHaveProperty("onBehalfOfEmail")
    })

    it("resets to 'my own name' after a successful submit", async () => {
      mockAdminFetch()
      render(<TicketForm onSuccess={jest.fn()} isAdmin />)
      const user = userEvent.setup()

      await waitFor(() => expect(screen.getByRole("option", { name: /דנה כהן/ })).toBeInTheDocument())
      const picker = screen.getByRole("combobox", { name: "פתיחת פנייה בשם" })
      await user.selectOptions(picker, "dana@cristalino.co.il")
      await fillAndSubmit(user)

      await waitFor(() => expect(picker).toHaveValue(""))
    })
  })

  /**
   * NEW-EMPLOYEE DETAILS (v3.59) — picking the "עובד חדש" category turns the
   * ticket into an account-creation request, which needs the hire's name,
   * phone and role before it is worth anything to a technician.
   */
  describe("new-employee details", () => {
    const mockTicketPost = () => {
      mockFetch.mockImplementation((url) => {
        if (url === "/api/tickets") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "test-id" }) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(DEFAULT_FIELD_OPTIONS) })
      })
    }

    const pickOnboarding = async (user: ReturnType<typeof userEvent.setup>) => {
      await waitFor(() => expect(screen.getByRole("option", { name: "עובד חדש" })).toBeInTheDocument())
      await user.selectOptions(screen.getByRole("combobox", { name: "קטגוריה" }), "עובד חדש")
    }

    const fillBaseFields = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByPlaceholderText("תאר בקצרה את הבעיה"), "עובד חדש מתחיל")
      await user.type(screen.getAllByPlaceholderText("050-0000000")[0], "050-9999999")
      await user.type(screen.getByPlaceholderText(/פרט את הבעיה בצורה מלאה/), "מתחיל ביום ראשון")
    }

    const postBody = () =>
      JSON.parse(mockFetch.mock.calls.find(c => c[0] === "/api/tickets")[1].body)

    it("is hidden on an ordinary ticket", () => {
      render(<TicketForm onSuccess={jest.fn()} />)
      expect(screen.queryByLabelText("שם פרטי *")).not.toBeInTheDocument()
    })

    it("appears as soon as the onboarding category is picked", async () => {
      mockTicketPost()
      render(<TicketForm onSuccess={jest.fn()} />)
      const user = userEvent.setup()

      await pickOnboarding(user)

      expect(screen.getByLabelText("שם פרטי *")).toBeInTheDocument()
      expect(screen.getByLabelText("שם משפחה *")).toBeInTheDocument()
      expect(screen.getByLabelText("טלפון העובד *")).toBeInTheDocument()
      expect(screen.getByLabelText("תיאור תפקיד *")).toBeInTheDocument()
    })

    it("disappears again when the category is changed back", async () => {
      mockTicketPost()
      render(<TicketForm onSuccess={jest.fn()} />)
      const user = userEvent.setup()

      await pickOnboarding(user)
      await user.selectOptions(screen.getByRole("combobox", { name: "קטגוריה" }), "אחר")

      expect(screen.queryByLabelText("שם פרטי *")).not.toBeInTheDocument()
    })

    it("sends the details with the ticket", async () => {
      mockTicketPost()
      render(<TicketForm onSuccess={jest.fn()} />)
      const user = userEvent.setup()

      await pickOnboarding(user)
      await fillBaseFields(user)
      await user.type(screen.getByLabelText("שם פרטי *"), "דני")
      await user.type(screen.getByLabelText("שם משפחה *"), "כהן")
      await user.type(screen.getByLabelText("תיאור תפקיד *"), "נציג מכירות")
      await user.type(screen.getByLabelText("טלפון העובד *"), "050-1234567")

      await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

      await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === "/api/tickets")).toBe(true))
      expect(postBody().newEmployee).toEqual({
        firstName: "דני", lastName: "כהן", phone: "050-1234567", jobTitle: "נציג מכירות",
      })
    })

    it("blocks a submit where a detail is only whitespace", async () => {
      // The browser's own `required` accepts a lone space — this does not.
      mockTicketPost()
      render(<TicketForm onSuccess={jest.fn()} />)
      const user = userEvent.setup()

      await pickOnboarding(user)
      await fillBaseFields(user)
      await user.type(screen.getByLabelText("שם פרטי *"), " ")
      await user.type(screen.getByLabelText("שם משפחה *"), " ")
      await user.type(screen.getByLabelText("טלפון העובד *"), " ")
      await user.type(screen.getByLabelText("תיאור תפקיד *"), " ")

      await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

      expect(await screen.findByText(/יש למלא את פרטי העובד החדש/)).toBeInTheDocument()
      expect(mockFetch.mock.calls.some(c => c[0] === "/api/tickets")).toBe(false)
    })

    it("omits the details entirely on an ordinary ticket", async () => {
      mockTicketPost()
      render(<TicketForm onSuccess={jest.fn()} />)
      const user = userEvent.setup()

      await fillBaseFields(user)
      await user.click(screen.getByRole("button", { name: "שלח פנייה" }))

      await waitFor(() => expect(mockFetch.mock.calls.some(c => c[0] === "/api/tickets")).toBe(true))
      expect(postBody()).not.toHaveProperty("newEmployee")
    })
  })
})


describe("the סגירת משתמש suggestion", () => {
  /**
   * The category is a dropdown nobody reads: an offboarding gets filed as אחר
   * with "סגירת משתמש ליוסי" in the subject, and the checklist that would have
   * caught the Zoho seat is never built. The hint watches the text the person
   * is already writing and offers the category — offers, not imposes.
   */
  const typeSubject = async (text: string) => {
    render(<TicketForm onSuccess={jest.fn()} />)
    const subject = await screen.findByLabelText(/נושא הפנייה/)
    fireEvent.change(subject, { target: { value: text } })
    return subject
  }

  it("appears when the subject reads like an offboarding", async () => {
    await typeSubject("סגירת משתמש ליוסי")
    expect(await screen.findByText("השתמש בקטגוריה")).toBeInTheDocument()
  })

  it("appears for סגירת יוזר too", async () => {
    await typeSubject("סגירת יוזר של דנה")
    expect(await screen.findByText("השתמש בקטגוריה")).toBeInTheDocument()
  })

  it("stays away for an ordinary ticket", async () => {
    await typeSubject("המסך לא נדלק")
    await waitFor(() => expect(screen.queryByText("השתמש בקטגוריה")).not.toBeInTheDocument())
  })

  it("does not fire on the word סגירה by itself", async () => {
    await typeSubject("סגירת הפנייה הקודמת")
    await waitFor(() => expect(screen.queryByText("השתמש בקטגוריה")).not.toBeInTheDocument())
  })

  it("sets the category when the button is pressed, and then gets out of the way", async () => {
    await typeSubject("סגירת משתמש ליוסי")
    fireEvent.click(await screen.findByText("השתמש בקטגוריה"))

    const select = screen.getByLabelText("קטגוריה") as HTMLSelectElement
    expect(select.value).toBe("סגירת משתמש")
    // Its work is done; leaving it up would just be noise.
    await waitFor(() => expect(screen.queryByText("השתמש בקטגוריה")).not.toBeInTheDocument())
  })

  it("shows the return checklist once the category is applied", async () => {
    await typeSubject("סגירת משתמש ליוסי")
    fireEvent.click(await screen.findByText("השתמש בקטגוריה"))
    expect(await screen.findByText(/רשימת החזרת ציוד וסגירת חשבונות/)).toBeInTheDocument()
  })

  it("can be dismissed, and stays dismissed while they keep typing", async () => {
    const subject = await typeSubject("סגירת משתמש ליוסי")
    fireEvent.click(await screen.findByLabelText("התעלם מההצעה"))
    await waitFor(() => expect(screen.queryByText("השתמש בקטגוריה")).not.toBeInTheDocument())

    fireEvent.change(subject, { target: { value: "סגירת משתמש ליוסי כהן" } })
    await waitFor(() => expect(screen.queryByText("השתמש בקטגוריה")).not.toBeInTheDocument())
  })

  it("never rewrites the category on its own", async () => {
    await typeSubject("סגירת משתמש ליוסי")
    await screen.findByText("השתמש בקטגוריה")
    // The person may have a reason for their choice; the form suggests.
    expect((screen.getByLabelText("קטגוריה") as HTMLSelectElement).value).toBe("אחר")
  })
})
