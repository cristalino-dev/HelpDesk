/**
 * app/admin/page.tsx — Admin Control Panel
 *
 * PURPOSE:
 * ─────────
 * The admin-only management interface. Accessible only to users with
 * isAdmin === true (enforced both client-side and server-side by /api/* routes).
 *
 * THREE TABS:
 * ────────────
 *
 * 1. תור פניות (Ticket Queue)
 *    ───────────────────────────
 *    Shows all open/in-progress tickets sorted by urgency priority, then by
 *    creation time (FIFO within each urgency level). Admins can click any
 *    ticket to expand it and change the status to פתוח/בטיפול/סגור.
 *
 *    Sorting: done client-side after fetch.
 *    Priority map: דחוף=0, גבוה=1, בינוני=2, נמוך=3 (lower = higher priority)
 *    Note: Closed tickets (סגור) are filtered OUT of the queue to keep it actionable.
 *
 * 2. ניהול משתמשים (User Management)
 *    ──────────────────────────────────
 *    Searchable table of all registered users. Admins can edit:
 *      - Full name
 *      - Phone number
 *      - Workstation hostname
 *      - isAdmin flag (grants or revokes admin privileges)
 *    Uses an inline modal (editingUser state) — no separate route.
 *    Data is loaded lazily (only when the tab is first opened).
 *
 * 3. יומן שגיאות (Error Logs)
 *    ────────────────────────────
 *    Dark terminal-style read-only textarea showing all log entries for a
 *    selected date. Defaults to today. Admin can pick any past date from
 *    the date picker input.
 *    Data is loaded when the tab is opened and on manual refresh.
 *    Scrollable and selectable — admin can copy log text for external tools.
 *    Displays entry count next to the refresh button.
 *
 * STATE SUMMARY:
 * ───────────────
 *   tab           — active tab ("tickets" | "users" | "logs")
 *   tickets       — array of open/in-progress TicketWithUser objects
 *   loading       — tickets loading indicator
 *   expanded      — id of the currently expanded ticket card (null = none)
 *   updating      — id of the ticket whose status is being saved (for disabled state)
 *   hoverId       — id of the hovered ticket card (for shadow effect)
 *   users         — array of UserRow objects (loaded lazily)
 *   usersLoading  — users loading indicator
 *   userSearch    — search input value for filtering users by name/email
 *   editingUser   — UserRow being edited in the modal (null = modal closed)
 *   userSaving    — modal save button loading state
 *   logDate       — selected date string "YYYY-MM-DD" for log tab
 *   logText       — formatted log text content for the textarea
 *   logCount      — number of log entries for the selected date
 *   logsLoading   — log loading indicator
 */

"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"
import { ASSIGNABLE_FALLBACK } from "@/lib/staffEmails"
import type { TicketWithUser, TicketNote, TicketMessage } from "@/types/ticket"
import type { Printer } from "@/types/printer"
import FooterCopyright from "@/components/FooterCopyright"
import { useIsMobile } from "@/lib/useIsMobile"
import { workdaysBetween, formatWorkdays } from "@/lib/workdays"
import { isStaleOpen } from "@/lib/staleTicket"
import { setTicketStatus, setTicketStatusOrError, updateTicket } from "@/lib/ticketApi"
import ErrorToast from "@/components/ErrorToast"
import { matchesTicketNumber, withNumberSuggestion } from "@/lib/ticketSearch"
import { NEW_EMPLOYEE_CATEGORY, type ShortageItem } from "@/lib/equipment"
import { LEAVING_EMPLOYEE_CATEGORY } from "@/lib/offboarding"
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS, DEFAULT_URGENCIES, fetchFieldOptions } from "@/lib/fieldOptions"
import { T, STATUS, URGENCY, URGENCY_BAR } from "@/lib/theme"
import AppHeader from "@/components/AppHeader"
import AppNav from "@/components/AppNav"

// Cristalino theme: status/urgency pill colors come from the central palette.
const URGENCY_STYLES: Record<string, React.CSSProperties> = Object.fromEntries(
  Object.entries(URGENCY).map(([k, v]) => [k, { backgroundColor: v.bg, color: v.fg }])
)

const STATUS_STYLES: Record<string, React.CSSProperties> = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, { backgroundColor: v.bg, color: v.fg }])
)

const URGENCY_BORDER = URGENCY_BAR

const badge: React.CSSProperties = {
  padding: "4px 11px",
  borderRadius: "8px",
  fontSize: "0.72rem",
  fontWeight: 600,
  display: "inline-block",
  letterSpacing: "0.01em",
}

interface UserRow { id: string; name: string | null; email: string; phone: string | null; station: string | null; isAdmin: boolean }

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [statFilter, setStatFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<"tickets" | "users" | "logs" | "fields" | "licenses" | "printers" | "equipment">("tickets")
  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [staffMembers, setStaffMembers] = useState<{ email: string; handle: string; display: string }[]>(ASSIGNABLE_FALLBACK)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  /** Server refusal of a status change (e.g. an unfinished offboarding list). */
  const [statusError, setStatusError] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ subject: string; description: string; phone: string; computerName: string; urgency: string; category: string; platform: string; status: string; holdReason: string }>({ subject: "", description: "", phone: "", computerName: "", urgency: "", category: "", platform: "", status: "", holdReason: "" })
  const [editSaving, setEditSaving] = useState(false)
  // On-hold inline UI: holdForId = which ticket is pending a hold reason
  const [holdForId, setHoldForId]   = useState<string | null>(null)
  const [holdInput,  setHoldInput]  = useState("")
  // Notes per expanded ticket
  const [expandedNotes, setExpandedNotes]       = useState<Record<string, TicketNote[]>>({})
  const [noteText, setNoteText]                 = useState<Record<string, string>>({})
  const [noteImages, setNoteImages]             = useState<Record<string, PendingImage[]>>({})
  const [noteSaving, setNoteSaving]             = useState<string | null>(null)
  // Messages (conversation with user) per expanded ticket
  const [expandedMessages, setExpandedMessages] = useState<Record<string, TicketMessage[]>>({})
  const [replyText, setReplyText]               = useState<Record<string, string>>({})
  const [replySaving, setReplySaving]           = useState<string | null>(null)
  // Users tab
  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState("")
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [userSaving, setUserSaving] = useState(false)
  const [userDeleting, setUserDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Fields tab
  type FieldRecord = { id: string; label: string }
  const [fieldRecords, setFieldRecords] = useState<Record<string, FieldRecord[]>>({ category: [], platform: [], urgency: [], equipment: [] })
  const [fieldUrgencies,  setFieldUrgencies]  = useState<string[]>(DEFAULT_URGENCIES)
  const [fieldCategories, setFieldCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [fieldPlatforms,  setFieldPlatforms]  = useState<string[]>(DEFAULT_PLATFORMS)
  const [newFieldValue, setNewFieldValue] = useState("")
  const [newFieldType, setNewFieldType]   = useState<"category" | "platform" | "urgency" | "equipment">("category")
  const [fieldSaving, setFieldSaving]     = useState(false)
  const [fieldError,  setFieldError]      = useState<string | null>(null)
  // Licenses tab
  type LicenseRow = { id: string; key: string; category: string; username: string | null; password: string | null; remark: string | null; createdAt: string }
  const [licenses, setLicenses]       = useState<LicenseRow[]>([])
  const [licLoading, setLicLoading]   = useState(false)
  const [licCatRecords, setLicCatRecords] = useState<FieldRecord[]>([])
  const [licForm, setLicForm]         = useState({ keys: "", category: "Office", username: "", password: "", remark: "" })
  const [licSaving, setLicSaving]     = useState(false)
  const [licMsg, setLicMsg]           = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [licFilter, setLicFilter]     = useState("")   // category filter, "" = all
  const [licSearch, setLicSearch]     = useState("")
  const [editingLic, setEditingLic]   = useState<LicenseRow | null>(null)
  const [licEditSaving, setLicEditSaving] = useState(false)
  const [newLicCat, setNewLicCat]     = useState("")
  const [showPw, setShowPw]           = useState<Record<string, boolean>>({})
  const [licDeleteConfirm, setLicDeleteConfirm] = useState<string | null>(null)
  const [copiedLicId, setCopiedLicId] = useState<string | null>(null)
  // Printers tab
  const EMPTY_PRINTER_FORM = { name: "", maker: "", model: "", supplier: "", ipv4: "", hostname: "", inkToner: "", tonerLevel: "", supplierSerial: "" }
  const [printers, setPrinters]               = useState<Printer[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  const [printerMode, setPrinterMode]         = useState<"view" | "manage">("view")
  const [printerSearch, setPrinterSearch]     = useState("")
  const [printerForm, setPrinterForm]         = useState({ ...EMPTY_PRINTER_FORM })
  const [printerSaving, setPrinterSaving]     = useState(false)
  const [printerMsg, setPrinterMsg]           = useState<{ kind: "ok" | "err"; text: string } | null>(null)
  const [editingPrinter, setEditingPrinter]   = useState<Printer | null>(null)
  const [printerEditSaving, setPrinterEditSaving] = useState(false)
  const [printerDeleteConfirm, setPrinterDeleteConfirm] = useState<string | null>(null)
  const [driverUploadingId, setDriverUploadingId] = useState<string | null>(null)
  // Logs tab
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [logText, setLogText] = useState("")
  const [logCount, setLogCount] = useState(0)
  const [logsLoading, setLogsLoading] = useState(false)
  const [copyLogStatus, setCopyLogStatus] = useState(false)
  // Equipment shortage tab
  const [shortage, setShortage] = useState<ShortageItem[]>([])
  const [shortageLoading, setShortageLoading] = useState(false)
  const [shortageText, setShortageText] = useState("")
  const [shortageClosed, setShortageClosed] = useState(false)
  const [shortageCopied, setShortageCopied] = useState(false)
  const [shortageExpanded, setShortageExpanded] = useState<string | null>(null)
  // Assignment
  const [assigning, setAssigning] = useState<string | null>(null)
  // Ticket-tab filters / sort
  const [showAll,  setShowAll]  = useState(false)
  const [ticketSearch, setTicketSearch] = useState("")
  const [sortKey, setSortKey] = useState<"subject" | "urgency" | "status" | "createdAt" | "updatedAt" | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    if (status === "authenticated" && !session?.user?.isAdmin) router.push("/dashboard")
  }, [status, session, router])

  const loadTickets = async () => {
    setLoading(true)
    try {
      // /api/tickets is the caller's OWN tickets now; the queue lives here.
      // Identical query to the admin branch this replaced — same orderBy, same
      // `user` include — so nothing about this tab's data changed.
      const res = await fetch("/api/tickets/all")
      if (!res.ok) { setTickets([]); return }
      const data = await res.json()
      setTickets(Array.isArray(data) ? data : [])
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  /** Everything still owed across live tickets — the order for the supplier. */
  const loadShortage = async (includeClosed = shortageClosed) => {
    setShortageLoading(true)
    try {
      const res = await fetch(`/api/admin/equipment${includeClosed ? "?includeClosed=1" : ""}`)
      if (!res.ok) { setShortage([]); setShortageText(""); return }
      const data = await res.json()
      setShortage(Array.isArray(data.items) ? data.items : [])
      setShortageText(typeof data.supplierText === "string" ? data.supplierText : "")
    } catch {
      setShortage([])
      setShortageText("")
    } finally {
      setShortageLoading(false)
    }
  }

  const copyShortage = async () => {
    try {
      await navigator.clipboard.writeText(shortageText)
      setShortageCopied(true)
      setTimeout(() => setShortageCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const staffDisplay = (email: string) =>
    staffMembers.find(m => m.email === email)?.display ?? email.split("@")[0]

  // ── Derived ticket lists ─────────────────────────────────────────────────
  const { displayTickets, openTickets, numberSuggestion } = useMemo(() => {
    const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }
    const openTickets = tickets.filter(t => t.status !== "סגור")

    let list = statFilter ? [...tickets] : (showAll ? tickets : openTickets)
    if (ticketSearch.trim()) {
      const q = ticketSearch.trim().toLowerCase()
      list = list.filter(t =>
        matchesTicketNumber(t.ticketNumber, q) ||
        t.subject.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.user?.name ?? "").toLowerCase().includes(q) ||
        (t.user?.email ?? "").toLowerCase().includes(q) ||
        t.computerName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.urgency.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        new Date(t.createdAt).toLocaleDateString("he-IL").includes(q)
      )
    }

    if (statFilter === "queue")        list = list.filter(t => t.status !== "סגור")
    else if (statFilter === "urgent")  list = list.filter(t => t.urgency === "דחוף" && t.status !== "סגור")
    else if (statFilter === "high")    list = list.filter(t => t.urgency === "גבוה" && t.status !== "סגור")
    else if (statFilter === "inprog")  list = list.filter(t => t.status === "בטיפול")
    else if (statFilter === "onhold")  list = list.filter(t => t.status === "בהמתנה")
    else if (statFilter === "closed")  list = list.filter(t => t.status === "סגור")

    const displayTickets = [...list].sort((a, b) => {
      if (sortKey) {
        const dir = sortDir === "asc" ? 1 : -1
        switch (sortKey) {
          case "subject":   return dir * a.subject.localeCompare(b.subject, "he")
          case "urgency":   return dir * ((URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2))
          case "status": {
            const ORDER: Record<string, number> = { "פתוח": 0, "בטיפול": 1, "בהמתנה": 2, "סגור": 3 }
            return dir * ((ORDER[a.status] ?? 0) - (ORDER[b.status] ?? 0))
          }
          case "createdAt": return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          case "updatedAt": return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
        }
      }
      // Default: urgency priority then FIFO (queue mode), or updatedAt DESC (all mode)
      if (!showAll) {
        const urgencyDiff = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2)
        if (urgencyDiff !== 0) return urgencyDiff
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    // An exact HDTC-N query always surfaces its ticket — open or closed, and
    // regardless of the open/all toggle or the active stat card.
    const pinned = withNumberSuggestion(displayTickets, tickets, ticketSearch)
    return { displayTickets: pinned.list, openTickets, numberSuggestion: pinned.suggestion }
  }, [tickets, showAll, ticketSearch, sortKey, sortDir, statFilter])

  const updateStatus = async (id: string, newStatus: string) => {
    if (newStatus === "בהמתנה") {
      // Show the reason input first; actual API call is made in confirmHold()
      setHoldForId(id)
      setHoldInput("")
      return
    }
    setUpdating(id)
    try {
      // A refused close has a reason worth reading — an offboarding ticket
      // whose return checklist is not finished — and the dropdown would
      // otherwise just snap back in silence.
      const error = await setTicketStatusOrError(id, newStatus)
      setStatusError(error)
      await loadTickets()
    } finally {
      setUpdating(null)
      setExpanded(null)
    }
  }

  const confirmHold = async (id: string) => {
    setUpdating(id)
    setHoldForId(null)
    try {
      await updateTicket(id, { status: "בהמתנה", holdReason: holdInput.trim() || null })
      await loadTickets()
    } finally {
      setUpdating(null)
      setExpanded(null)
    }
  }

  const assignTicket = async (ticketId: string, email: string) => {
    setAssigning(ticketId)
    try {
      await updateTicket(ticketId, { assignedTo: email })
      // Optimistic local update so the row reflects the change immediately
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assignedTo: email } : t))
    } finally {
      setAssigning(null)
    }
  }

  const saveEdit = async () => {
    if (!editingTicketId) return
    setEditSaving(true)
    try {
      await updateTicket(editingTicketId, editForm)
      setEditingTicketId(null)
      await loadTickets()
    } finally {
      setEditSaving(false)
    }
  }

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const res = await fetch("/api/users")
      if (!res.ok) { setUsers([]); return }
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } finally {
      setUsersLoading(false)
    }
  }

  const loadLogs = async (date: string) => {
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/logs?date=${date}`)
      if (!res.ok) { setLogText(""); setLogCount(0); return }
      const data = await res.json()
      if (!Array.isArray(data)) { setLogText(""); setLogCount(0); return }
      setLogCount(data.length)
      if (data.length === 0) {
        setLogText("אין רשומות ביומן לתאריך זה.")
        return
      }
      const formatted = data.map((entry: { timestamp: string; level: string; source?: string; message: string; stack?: string }) => {
        const time = new Date(entry.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        const src = entry.source ? ` [${entry.source}]` : ""
        const stack = entry.stack ? `\n${entry.stack}` : ""
        return `[${time}] [${entry.level.toUpperCase()}]${src}\n${entry.message}${stack}`
      }).join("\n\n---\n\n")
      setLogText(formatted)
    } finally {
      setLogsLoading(false)
    }
  }

  const copyLogText = async () => {
    await navigator.clipboard.writeText(logText)
    setCopyLogStatus(true)
    setTimeout(() => setCopyLogStatus(false), 2000)
  }

  const downloadLog = () => {
    const blob = new Blob([logText], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `error-log-${logDate}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveUser = async () => {
    if (!editingUser) return
    setUserSaving(true)
    setDeleteError(null)
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUser),
      })
      if (!res.ok) {
        // e.g. last-admin guard — keep the modal open and show why
        const data = await res.json().catch(() => ({}))
        setDeleteError(data.error ?? "שגיאה בשמירה")
        return
      }
      await loadUsers()
      closeEditModal()
    } finally {
      setUserSaving(false)
    }
  }

  const closeEditModal = () => {
    setEditingUser(null)
    setDeleteConfirm(false)
    setDeleteError(null)
  }

  const deleteUser = async () => {
    if (!editingUser) return
    setUserDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingUser.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error ?? "שגיאה במחיקה")
        setDeleteConfirm(false)
        return
      }
      await loadUsers()
      closeEditModal()
    } finally {
      setUserDeleting(false)
    }
  }

  const loadFieldOpts = async () => {
    const res = await fetch("/api/admin/field-options")
    if (!res.ok) return
    const data = await res.json()
    setFieldUrgencies(data.urgency ?? DEFAULT_URGENCIES)
    setFieldCategories(data.category ?? DEFAULT_CATEGORIES)
    setFieldPlatforms(data.platform ?? DEFAULT_PLATFORMS)
    setFieldRecords(data._records ?? { category: [], platform: [], urgency: [] })
    const licCats: FieldRecord[] = data._records?.licenseCategory ?? []
    setLicCatRecords(licCats)
    // Keep the add-form category valid if its current value was deleted
    if (licCats.length && !licCats.some((c: FieldRecord) => c.label === licForm.category)) {
      setLicForm(f => ({ ...f, category: licCats[0].label }))
    }
  }

  const addFieldOption = async () => {
    if (!newFieldValue.trim()) return
    setFieldSaving(true)
    setFieldError(null)
    try {
      const res = await fetch("/api/admin/field-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: newFieldType, label: newFieldValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setFieldError(data.error ?? "שגיאה"); return }
      setNewFieldValue("")
      await loadFieldOpts()
    } finally {
      setFieldSaving(false)
    }
  }

  const removeFieldOption = async (id: string) => {
    setFieldError(null)
    try {
      const res = await fetch("/api/admin/field-options", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) { setFieldError(data.error ?? "שגיאה"); return }
      await loadFieldOpts()
    } catch {
      setFieldError("שגיאה במחיקה")
    }
  }

  // ── Licenses tab ───────────────────────────────────────────────────────────

  const loadLicenses = async () => {
    setLicLoading(true)
    try {
      const res = await fetch("/api/admin/licenses")
      if (!res.ok) return
      const data = await res.json()
      setLicenses(Array.isArray(data) ? data : [])
    } finally {
      setLicLoading(false)
    }
  }

  const addLicenses = async () => {
    if (!licForm.keys.trim()) return
    setLicSaving(true)
    setLicMsg(null)
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(licForm),
      })
      const data = await res.json()
      if (!res.ok) { setLicMsg({ kind: "err", text: data.error ?? "שגיאה" }); return }
      setLicMsg({ kind: "ok", text: `נוספו ${data.created} רישיונות${data.skipped ? ` · ${data.skipped} כפולים דולגו` : ""}` })
      setLicForm(f => ({ ...f, keys: "", username: "", password: "", remark: "" }))
      await loadLicenses()
    } finally {
      setLicSaving(false)
    }
  }

  const saveLicEdit = async () => {
    if (!editingLic) return
    setLicEditSaving(true)
    setLicMsg(null)
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingLic),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setLicMsg({ kind: "err", text: d.error ?? "שגיאה בשמירת הרישיון" })
        return
      }
      setEditingLic(null)
      await loadLicenses()
    } finally {
      setLicEditSaving(false)
    }
  }

  const deleteLicense = async (id: string) => {
    const res = await fetch("/api/admin/licenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setLicDeleteConfirm(null)
    if (res.ok) await loadLicenses()
  }

  const addLicCategory = async () => {
    if (!newLicCat.trim()) return
    const res = await fetch("/api/admin/field-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "licenseCategory", label: newLicCat.trim() }),
    })
    if (res.ok) { setNewLicCat(""); await loadFieldOpts() }
  }

  const removeLicCategory = async (id: string) => {
    const res = await fetch("/api/admin/field-options", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (res.ok) await loadFieldOpts()
  }

  // ── Printers tab ─────────────────────────────────────────────────────────────

  const loadPrinters = async () => {
    setPrintersLoading(true)
    try {
      const res = await fetch("/api/admin/printers")
      if (!res.ok) { setPrinters([]); return }
      const data = await res.json()
      setPrinters(Array.isArray(data) ? data : [])
    } finally {
      setPrintersLoading(false)
    }
  }

  const addPrinter = async () => {
    if (!printerForm.name.trim()) return
    setPrinterSaving(true)
    setPrinterMsg(null)
    try {
      const { tonerLevel: tl, ...rest } = printerForm
      const payload = { ...rest, tonerLevel: tl !== "" ? parseInt(tl, 10) : null }
      const res = await fetch("/api/admin/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setPrinterMsg({ kind: "err", text: data.error ?? "שגיאה" }); return }
      setPrinterMsg({ kind: "ok", text: "המדפסת נוספה" })
      setPrinterForm({ ...EMPTY_PRINTER_FORM })
      await loadPrinters()
    } finally {
      setPrinterSaving(false)
    }
  }

  const savePrinterEdit = async () => {
    if (!editingPrinter) return
    setPrinterEditSaving(true)
    setPrinterMsg(null)
    try {
      const res = await fetch("/api/admin/printers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPrinter),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setPrinterMsg({ kind: "err", text: d.error ?? "שגיאה בשמירה" })
        return
      }
      setEditingPrinter(null)
      await loadPrinters()
    } finally {
      setPrinterEditSaving(false)
    }
  }

  const deletePrinter = async (id: string) => {
    const res = await fetch("/api/admin/printers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    setPrinterDeleteConfirm(null)
    if (res.ok) await loadPrinters()
  }

  const uploadDriver = async (printerId: string, file: File) => {
    setDriverUploadingId(printerId)
    setPrinterMsg(null)
    try {
      const fd = new FormData()
      fd.append("printerId", printerId)
      fd.append("file", file)
      const res = await fetch("/api/admin/printers/drivers", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setPrinterMsg({ kind: "err", text: data.error ?? "שגיאה בהעלאת דרייבר" }); return }
      await loadPrinters()
    } finally {
      setDriverUploadingId(null)
    }
  }

  const deleteDriver = async (driverId: string) => {
    const res = await fetch("/api/admin/printers/drivers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: driverId }),
    })
    if (res.ok) await loadPrinters()
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.isAdmin) {
      loadTickets()
      loadFieldOpts()
      fetch("/api/staff")
        .then(r => r.ok ? r.json() : null)
        .then(list => { if (Array.isArray(list) && list.length) setStaffMembers(list) })
        .catch(() => {})
    }
  }, [status, session])

  if (status === "loading") return null

  const filteredUsers = users.filter(u =>
    (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  )

  const urgentCount = openTickets.filter(t => t.urgency === "דחוף").length
  const highCount   = openTickets.filter(t => t.urgency === "גבוה").length

  return (
    <div style={{ minHeight: "100vh", backgroundColor: T.bg, position: "relative" }}>
      <ErrorToast message={statusError} onClose={() => setStatusError(null)} />
      <AppHeader wordmark={isMobile ? "ניהול" : "ניהול מערכת"} subtitle={false}><AppNav /></AppHeader>

      {/* Mobile dropdown menu */}

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", borderBottom: `2px solid ${T.line}`, paddingBottom: "0", overflowX: isMobile ? "auto" : "visible", flexWrap: isMobile ? "nowrap" : "wrap" }}>
          {([["tickets", "תור פניות"], ["users", "ניהול משתמשים"], ["logs", "יומן שגיאות"], ["fields", "שדות מערכת"], ["licenses", "רישוי"], ["printers", "מדפסות"], ["equipment", "ציוד חסר"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => {
              setTab(key)
              if (key === "users" && users.length === 0) loadUsers()
              if (key === "logs") loadLogs(logDate)
              if (key === "fields") loadFieldOpts()
              if (key === "licenses") { loadLicenses(); loadFieldOpts() }
              if (key === "printers") loadPrinters()
              if (key === "equipment") loadShortage()
            }}
              style={{ padding: "10px 20px", fontWeight: tab === key ? 700 : 600, fontSize: "0.88rem", border: "none", background: "none", cursor: "pointer", color: tab === key ? T.text : T.muted, borderBottom: tab === key ? `2px solid ${T.green}` : "2px solid transparent", marginBottom: "-2px", borderRadius: 0, whiteSpace: "nowrap", flexShrink: 0 }}>
              {label}
            </button>
          ))}
        </div>



        {/* ── USERS TAB ── */}
        {tab === "users" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Search */}
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="חפש לפי שם או אימייל..."
              style={{ padding: "10px 14px", borderRadius: "10px", border: `1px solid ${T.line}`, fontSize: "0.88rem", backgroundColor: T.card, width: "100%", boxSizing: "border-box" }}
            />

            {usersLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: T.inkFaint }}>טוען...</div>
            ) : (
              <div style={{ backgroundColor: T.card, borderRadius: "14px", border: `1px solid ${T.line}`, overflow: "hidden" }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px 80px 80px", gap: "12px", padding: "10px 16px", backgroundColor: T.fill2, borderBottom: `1px solid ${T.line}`, fontSize: "0.75rem", fontWeight: 700, color: T.inkMuted }}>
                  <span>שם</span><span>אימייל</span><span>טלפון</span><span>תחנה</span><span>מנהל</span><span></span>
                </div>
                {filteredUsers.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: T.inkFaint, fontSize: "0.88rem" }}>לא נמצאו משתמשים</div>}
                {filteredUsers.map(u => (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px 80px 80px", gap: "12px", padding: "12px 16px", borderBottom: `1px solid ${T.line}`, alignItems: "center", fontSize: "0.85rem", color: T.ink }}>
                    <span style={{ fontWeight: 600 }}>{u.name ?? "—"}</span>
                    <span style={{ color: T.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                    <span>{u.phone ?? "—"}</span>
                    <span>{u.station ?? "—"}</span>
                    <span style={{ color: u.isAdmin ? T.text : T.inkFaint, fontWeight: u.isAdmin ? 700 : 400 }}>{u.isAdmin ? "כן" : "לא"}</span>
                    <button onClick={() => setEditingUser({ ...u })} style={{ fontSize: "0.75rem", color: T.text, background: T.codeBg, border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}>עריכה</button>
                  </div>
                ))}
              </div>
            )}

            {/* Edit modal */}
            {editingUser && (
              <div style={{ position: "fixed", inset: 0, backgroundColor: T.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                <div style={{ backgroundColor: T.card, borderRadius: "16px", padding: "28px", width: "420px", boxShadow: `0 20px 60px ${T.shadow4}`, display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: T.text }}>עריכת משתמש</h3>
                  <div style={{ fontSize: "0.8rem", color: T.inkMuted }}>{editingUser.email}</div>

                  {[
                    { label: "שם מלא",     key: "name"    as const, placeholder: "ישראל ישראלי" },
                    { label: "טלפון",      key: "phone"   as const, placeholder: "050-0000000" },
                    { label: "תחנת עבודה", key: "station" as const, placeholder: "PC-USER-01" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "5px" }}>{label}</label>
                      <input value={editingUser[key] ?? ""} onChange={e => setEditingUser(u => u ? { ...u, [key]: e.target.value } : u)} placeholder={placeholder}
                        style={{ width: "100%", padding: "8px 12px", border: `1px solid ${T.lineStrong}`, borderRadius: "8px", fontSize: "0.88rem", boxSizing: "border-box" }} />
                    </div>
                  ))}

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input type="checkbox" id="isAdmin" checked={editingUser.isAdmin} onChange={e => setEditingUser(u => u ? { ...u, isAdmin: e.target.checked } : u)} />
                    <label htmlFor="isAdmin" style={{ fontSize: "0.88rem", color: T.ink, fontWeight: 600 }}>הרשאת מנהל</label>
                  </div>

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-start" }}>
                    <button onClick={saveUser} disabled={userSaving} style={{ background: T.inverseBg, color: T.inverseText, fontWeight: 700, padding: "9px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                      {userSaving ? "שומר..." : "שמור"}
                    </button>
                    <button onClick={closeEditModal} style={{ background: T.fill, color: T.ink, fontWeight: 600, padding: "9px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>ביטול</button>
                  </div>

                  {/* Delete section */}
                  <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14, marginTop: 2 }}>
                    {deleteError && (
                      <div style={{ marginBottom: 10, padding: "8px 12px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, fontSize: "0.8rem", color: T.redFgDeep }}>
                        {deleteError}
                      </div>
                    )}
                    {!deleteConfirm ? (
                      <button
                        onClick={() => { setDeleteConfirm(true); setDeleteError(null) }}
                        style={{ background: "none", border: `1px solid ${T.redBorder}`, color: T.redFg, fontWeight: 600, padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem" }}
                      >
                        🗑 מחק משתמש
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.82rem", color: T.ink, fontWeight: 600 }}>בטוח? הפניות יועברו לחשבון helpdesk.</span>
                        <button
                          onClick={deleteUser}
                          disabled={userDeleting}
                          style={{ background: T.redFg, color: T.inverseText, fontWeight: 700, padding: "7px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.82rem", opacity: userDeleting ? 0.6 : 1 }}
                        >
                          {userDeleting ? "מוחק..." : "כן, מחק"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          style={{ background: T.fill, color: T.ink, fontWeight: 600, padding: "7px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.82rem" }}
                        >
                          ביטול
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {tab === "logs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Date picker row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <input
                type="date"
                value={logDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => { setLogDate(e.target.value); loadLogs(e.target.value) }}
                style={{ padding: "8px 12px", border: `1px solid ${T.lineStrong}`, borderRadius: "8px", fontSize: "0.88rem", backgroundColor: T.card }}
              />
              <button
                onClick={() => loadLogs(logDate)}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: T.codeBg, color: T.text, fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                רענן
              </button>
              {!logsLoading && (
                <span style={{ fontSize: "0.78rem", color: T.inkFaint }}>
                  {logCount} {logCount === 1 ? "רשומה" : "רשומות"}
                </span>
              )}
              {logText && !logsLoading && (
                <>
                  <button
                    onClick={copyLogText}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: copyLogStatus ? T.greenSBg : T.codeBg, color: copyLogStatus ? T.greenSFgDeep : T.text, fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    {copyLogStatus ? "✓ הועתק" : "📋 העתק הכל"}
                  </button>
                  <button
                    onClick={downloadLog}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: T.greenSBg, color: T.greenSFgDeep, fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    ⬇️ הורד
                  </button>
                </>
              )}
            </div>

            {/* Log viewer */}
            {logsLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: T.inkFaint }}>טוען יומן...</div>
            ) : (
              <textarea
                readOnly
                value={logText}
                style={{
                  width: "100%",
                  height: "520px",
                  padding: "16px",
                  border: `1px solid ${T.line}`,
                  borderRadius: "12px",
                  backgroundColor: T.consoleBg,
                  color: T.consoleFg,
                  fontFamily: "'Courier New', Consolas, monospace",
                  fontSize: "0.78rem",
                  lineHeight: 1.7,
                  resize: "vertical",
                  boxSizing: "border-box",
                  direction: "ltr",
                  textAlign: "left",
                  whiteSpace: "pre",
                  overflowY: "auto",
                }}
              />
            )}

            <p style={{ margin: 0, fontSize: "0.72rem", color: T.inkFaint }}>
              יומנים נמחקים אוטומטית לאחר 30 יום.
            </p>
          </div>
        )}

        {/* ── FIELDS TAB ── */}
        {tab === "fields" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {fieldError && (
              <div style={{ padding: "10px 14px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, color: T.redFgDeep, fontSize: "0.85rem" }}>{fieldError}</div>
            )}

            {/* Add new option */}
            <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>➕ הוסף ערך חדש</h3>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={newFieldType}
                  onChange={e => setNewFieldType(e.target.value as "category" | "platform" | "urgency" | "equipment")}
                  style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.88rem", background: T.fill2 }}
                >
                  <option value="category">קטגוריה</option>
                  <option value="platform">פלטפורמה</option>
                  <option value="urgency">דחיפות</option>
                  <option value="equipment">ציוד</option>
                </select>
                <input
                  value={newFieldValue}
                  onChange={e => setNewFieldValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addFieldOption() }}
                  placeholder="שם הערך החדש..."
                  style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.88rem" }}
                />
                <button
                  onClick={addFieldOption}
                  disabled={fieldSaving || !newFieldValue.trim()}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: fieldSaving || !newFieldValue.trim() ? T.line : T.inverseBg, color: fieldSaving || !newFieldValue.trim() ? T.inkFaint : T.inverseText, fontWeight: 700, fontSize: "0.85rem", cursor: fieldSaving || !newFieldValue.trim() ? "not-allowed" : "pointer" }}
                >
                  {fieldSaving ? "שומר..." : "הוסף"}
                </button>
              </div>
            </div>

            {/* Current options per field */}
            {([
              { key: "category", label: "קטגוריה" },
              { key: "platform", label: "פלטפורמה" },
              { key: "urgency",  label: "דחיפות" },
              { key: "equipment", label: "ציוד (רשימת פריטים לבחירה בפנייה)" },
            ] as const).map(({ key, label }) => (
              <div key={key} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>{label}</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(fieldRecords[key] ?? []).map(({ id, label: lbl }) => {
                    // Core urgencies and the new-employee category are system
                    // values — DELETE rejects them server-side too.
                    const isProtected = key === "urgency"
                      || (key === "category" && (lbl === NEW_EMPLOYEE_CATEGORY || lbl === LEAVING_EMPLOYEE_CATEGORY))
                    return (
                      <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: T.fill, fontSize: "0.85rem", fontWeight: 600, color: T.ink, border: `1px solid ${T.line}` }}>
                        {lbl}
                        {!isProtected && (
                          <button
                            onClick={() => removeFieldOption(id)}
                            title="מחק"
                            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "0.9rem", lineHeight: 1, padding: 0 }}
                          >✕</button>
                        )}
                        {isProtected && (
                          <span title="ערך מערכת — לא ניתן למחיקה" style={{ color: T.inkFainter, fontSize: "0.75rem" }}>🔒</span>
                        )}
                      </span>
                    )
                  })}
                  {(fieldRecords[key] ?? []).length === 0 && (
                    <span style={{ fontSize: "0.82rem", color: T.inkFaint }}>אין ערכים — הוסף אחד למעלה</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LICENSES TAB ── */}
        {tab === "licenses" && (() => {
          const licCategories = licCatRecords.map(c => c.label)
          const q = licSearch.trim().toLowerCase()
          const filteredLicenses = licenses.filter(l => {
            if (licFilter && l.category !== licFilter) return false
            if (!q) return true
            return [l.key, l.category, l.username ?? "", l.remark ?? ""].some(v => v.toLowerCase().includes(q))
          })
          const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.85rem", boxSizing: "border-box", width: "100%" }
          const thStyle: React.CSSProperties = { padding: "8px", textAlign: "right", fontSize: "0.72rem", color: T.inkMuted, fontWeight: 700, whiteSpace: "nowrap" }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Category manager */}
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>🏷️ קטגוריות רישוי</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {licCatRecords.map(c => (
                    <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: T.fill, fontSize: "0.85rem", fontWeight: 600, color: T.ink, border: `1px solid ${T.line}` }}>
                      {c.label}
                      <button onClick={() => removeLicCategory(c.id)} title="מחק קטגוריה" style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "0.9rem", lineHeight: 1, padding: 0 }}>✕</button>
                    </span>
                  ))}
                  <input
                    value={newLicCat}
                    onChange={e => setNewLicCat(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addLicCategory() }}
                    placeholder="קטגוריה חדשה..."
                    style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.85rem", width: 150 }}
                  />
                  <button
                    onClick={addLicCategory}
                    disabled={!newLicCat.trim()}
                    style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: newLicCat.trim() ? T.inverseBg : T.line, color: newLicCat.trim() ? T.inverseText : T.inkFaint, fontWeight: 700, fontSize: "0.82rem", cursor: newLicCat.trim() ? "pointer" : "not-allowed" }}
                  >הוסף</button>
                </div>
              </div>

              {/* Add licenses */}
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>➕ הוספת רישיונות</h3>
                <textarea
                  rows={3}
                  value={licForm.keys}
                  onChange={e => setLicForm(f => ({ ...f, keys: e.target.value }))}
                  placeholder="מפתח רישיון אחד בכל שורה, או כמה מפתחות מופרדים ב-;"
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", marginBottom: 10 }}
                />
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
                  <select
                    value={licForm.category}
                    onChange={e => setLicForm(f => ({ ...f, category: e.target.value }))}
                    style={{ ...inputStyle, background: T.fill2 }}
                  >
                    {licCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input style={inputStyle} value={licForm.username} onChange={e => setLicForm(f => ({ ...f, username: e.target.value }))} placeholder="שם משתמש (אופציונלי)" />
                  <input style={inputStyle} value={licForm.password} onChange={e => setLicForm(f => ({ ...f, password: e.target.value }))} placeholder="סיסמה (אופציונלי)" />
                  <input style={inputStyle} value={licForm.remark} onChange={e => setLicForm(f => ({ ...f, remark: e.target.value }))} placeholder="הערה — למי ניתן (אופציונלי)" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={addLicenses}
                    disabled={licSaving || !licForm.keys.trim()}
                    style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: licSaving || !licForm.keys.trim() ? T.line : T.inverseBg, color: licSaving || !licForm.keys.trim() ? T.inkFaint : T.inverseText, fontWeight: 700, fontSize: "0.85rem", cursor: licSaving || !licForm.keys.trim() ? "not-allowed" : "pointer" }}
                  >
                    {licSaving ? "שומר..." : "הוסף רישיונות"}
                  </button>
                  {licMsg && (
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: licMsg.kind === "ok" ? T.greenSFgDeep : T.redFgDeep }}>{licMsg.text}</span>
                  )}
                </div>
              </div>

              {/* License list */}
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: T.ink, flexShrink: 0 }}>🔑 רישיונות ({filteredLicenses.length})</h3>
                  <select
                    value={licFilter}
                    onChange={e => setLicFilter(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", background: T.fill2 }}
                  >
                    <option value="">כל הקטגוריות</option>
                    {licCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input
                    value={licSearch}
                    onChange={e => setLicSearch(e.target.value)}
                    placeholder="חיפוש לפי מפתח, משתמש, הערה..."
                    style={{ flex: 1, minWidth: 160, padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem" }}
                  />
                </div>

                {licMsg?.kind === "err" && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, fontSize: "0.8rem", color: T.redFgDeep }}>{licMsg.text}</div>
                )}
                {licLoading && <div style={{ fontSize: "0.85rem", color: T.inkFaint }}>טוען...</div>}
                {!licLoading && filteredLicenses.length === 0 && (
                  <div style={{ fontSize: "0.85rem", color: T.inkFaint }}>אין רישיונות — הוסיפו למעלה</div>
                )}

                {!licLoading && filteredLicenses.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.line}`, background: T.fill2 }}>
                          <th style={thStyle}>מפתח רישיון</th>
                          <th style={thStyle}>קטגוריה</th>
                          <th style={thStyle}>שם משתמש</th>
                          <th style={thStyle}>סיסמה</th>
                          <th style={thStyle}>הערה</th>
                          <th style={thStyle}>נוסף</th>
                          <th style={thStyle}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLicenses.map(l => editingLic?.id === l.id ? (
                          <tr key={l.id} style={{ borderBottom: `1px solid ${T.line}`, background: T.amberBg }}>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, fontFamily: "monospace", minWidth: 180 }} value={editingLic.key} onChange={e => setEditingLic(p => p ? { ...p, key: e.target.value } : p)} /></td>
                            <td style={{ padding: 8 }}>
                              <select style={{ ...inputStyle, minWidth: 110 }} value={editingLic.category} onChange={e => setEditingLic(p => p ? { ...p, category: e.target.value } : p)}>
                                {licCategories.map(c => <option key={c}>{c}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 110 }} value={editingLic.username ?? ""} onChange={e => setEditingLic(p => p ? { ...p, username: e.target.value } : p)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 110 }} value={editingLic.password ?? ""} onChange={e => setEditingLic(p => p ? { ...p, password: e.target.value } : p)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 140 }} value={editingLic.remark ?? ""} onChange={e => setEditingLic(p => p ? { ...p, remark: e.target.value } : p)} /></td>
                            <td style={{ padding: 8 }}></td>
                            <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                              <button onClick={saveLicEdit} disabled={licEditSaving} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: T.inverseBg, color: T.inverseText, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginLeft: 6 }}>
                                {licEditSaving ? "שומר..." : "שמור"}
                              </button>
                              <button onClick={() => setEditingLic(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: T.fill, color: T.ink, fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>ביטול</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={l.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                            <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.8rem", color: T.text, direction: "ltr", display: "inline-block" }}>{l.key}</span>
                              <button
                                onClick={() => { navigator.clipboard.writeText(l.key); setCopiedLicId(l.id); setTimeout(() => setCopiedLicId(null), 1500) }}
                                title="העתק מפתח"
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", marginRight: 6, padding: 2, color: copiedLicId === l.id ? T.greenSFg : T.inkFaint, fontWeight: 700 }}
                              >
                                {copiedLicId === l.id ? "✓" : "📋"}
                              </button>
                            </td>
                            <td style={{ padding: "9px 8px" }}>
                              <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: T.codeBg, color: T.text }}>{l.category}</span>
                            </td>
                            <td style={{ padding: "9px 8px", color: T.ink }}>{l.username || "—"}</td>
                            <td style={{ padding: "9px 8px" }}>
                              {l.password ? (
                                <span
                                  onClick={() => setShowPw(p => ({ ...p, [l.id]: !p[l.id] }))}
                                  title={showPw[l.id] ? "הסתר" : "הצג"}
                                  style={{ cursor: "pointer", fontFamily: "monospace", fontSize: "0.8rem", color: showPw[l.id] ? T.text : T.inkFaint, direction: "ltr", display: "inline-block" }}
                                >
                                  {showPw[l.id] ? l.password : "••••••"}
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "9px 8px", color: T.inkMuted, fontSize: "0.8rem", maxWidth: 220 }}>{l.remark || "—"}</td>
                            <td style={{ padding: "9px 8px", color: T.inkFaint, fontSize: "0.75rem", whiteSpace: "nowrap" }}>{new Date(l.createdAt).toLocaleDateString("he-IL")}</td>
                            <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                              <button onClick={() => { setEditingLic({ ...l }); setLicDeleteConfirm(null) }} title="עריכה" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", marginLeft: 4 }}>✏️</button>
                              {licDeleteConfirm === l.id ? (
                                <>
                                  <button onClick={() => deleteLicense(l.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: T.redFg, color: T.inverseText, fontWeight: 700, fontSize: "0.75rem", cursor: "pointer", marginLeft: 4 }}>בטוח?</button>
                                  <button onClick={() => setLicDeleteConfirm(null)} style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: T.fill, color: T.ink, fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>ביטול</button>
                                </>
                              ) : (
                                <button onClick={() => setLicDeleteConfirm(l.id)} title="מחק" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}>🗑</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── PRINTERS TAB ── */}
        {tab === "printers" && (() => {
          const manage = printerMode === "manage"
          const q = printerSearch.trim().toLowerCase()
          const filtered = printers.filter(p => !q || [p.name, p.maker, p.model, p.supplier, p.ipv4, p.hostname, p.inkToner, p.supplierSerial]
            .some(v => (v ?? "").toLowerCase().includes(q)))
          const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.85rem", boxSizing: "border-box", width: "100%" }
          const thStyle: React.CSSProperties = { padding: "8px", textAlign: "right", fontSize: "0.72rem", color: T.inkMuted, fontWeight: 700, whiteSpace: "nowrap" }
          const tdStyle: React.CSSProperties = { padding: "9px 8px", color: T.ink, whiteSpace: "nowrap" }
          const fmtBytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

          const tonerBar = (level: number | null | undefined) => {
            if (level == null) return <span style={{ color: T.inkFaint, fontSize: "0.78rem" }}>—</span>
            const pct = Math.max(0, Math.min(100, level))
            const color = pct > 50 ? T.greenSFg : pct > 20 ? T.amberFg : T.redFg
            return (
              <div style={{ position: "relative", minWidth: 90, height: 18, borderRadius: 4, background: T.line, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.3s" }} />
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: pct > 30 ? T.inverseText : color, lineHeight: 1 }}>{pct}%</span>
              </div>
            )
          }

          // Driver chips (download links) + manage controls (upload / delete)
          const driversCell = (p: Printer) => (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {p.drivers.map(d => (
                <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: T.codeBg, border: `1px solid ${T.border}`, fontSize: "0.75rem", fontWeight: 600 }}>
                  <a href={`/api/admin/printers/drivers/${d.id}`} title={`${d.filename} · ${fmtBytes(d.size)}`} style={{ color: T.text, textDecoration: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ⬇ {d.filename}
                  </a>
                  {manage && (
                    <button onClick={() => deleteDriver(d.id)} title="מחק דרייבר" style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "0.85rem", lineHeight: 1, padding: 0 }}>✕</button>
                  )}
                </span>
              ))}
              {p.drivers.length === 0 && !manage && null}
              {manage && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: driverUploadingId === p.id ? T.line : T.greenSBg, border: `1px solid ${T.greenSBorder}`, color: driverUploadingId === p.id ? T.inkFaint : T.greenSFgDeep, fontSize: "0.75rem", fontWeight: 700, cursor: driverUploadingId === p.id ? "default" : "pointer" }}>
                  {driverUploadingId === p.id ? "מעלה..." : "➕ דרייבר"}
                  <input type="file" hidden disabled={driverUploadingId === p.id}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadDriver(p.id, f); e.target.value = "" }} />
                </label>
              )}
            </div>
          )

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Mode toggle + search */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
                  {([{ label: "👁 צפייה", val: "view" }, { label: "⚙ ניהול", val: "manage" }] as const).map(opt => (
                    <button key={opt.val} onClick={() => { setPrinterMode(opt.val); setEditingPrinter(null); setPrinterDeleteConfirm(null) }}
                      style={{ padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem",
                        background: printerMode === opt.val ? T.inverseBg : "transparent",
                        color:      printerMode === opt.val ? T.inverseText    : T.inkMuted }}
                    >{opt.label}</button>
                  ))}
                </div>
                <input
                  value={printerSearch}
                  onChange={e => setPrinterSearch(e.target.value)}
                  placeholder="חיפוש לפי שם, יצרן, ספק, IP..."
                  style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 10, border: `1px solid ${T.line}`, fontSize: "0.85rem", background: T.card }}
                />
                <button onClick={loadPrinters} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: T.text, background: T.codeBg, border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 600 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  רענן
                </button>
                <span style={{ fontSize: "0.78rem", color: T.inkFaint }}>{filtered.length} מדפסות</span>
              </div>

              {printerMsg && (
                <div style={{ padding: "8px 14px", borderRadius: 10, fontSize: "0.83rem", fontWeight: 600,
                  background: printerMsg.kind === "ok" ? T.greenSBg : T.redBg,
                  border: `1px solid ${printerMsg.kind === "ok" ? "${T.greenSBorder}" : "${T.redBorder}"}`,
                  color: printerMsg.kind === "ok" ? T.greenSFgDeep : T.redFgDeep }}>
                  {printerMsg.text}
                </div>
              )}

              {/* Add printer — manage mode only */}
              {manage && (
                <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
                  {/* Datalists for autocomplete */}
                  <datalist id="dl-maker">{[...new Set(printers.map(p => p.maker).filter(Boolean))].map(v => <option key={v!} value={v!} />)}</datalist>
                  <datalist id="dl-model">{[...new Set(printers.map(p => p.model).filter(Boolean))].map(v => <option key={v!} value={v!} />)}</datalist>

                  <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>➕ הוספת מדפסת</h3>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
                    <input style={inputStyle} value={printerForm.name}           onChange={e => setPrinterForm(f => ({ ...f, name: e.target.value }))}           placeholder="שם מדפסת *" />
                    <input style={inputStyle} value={printerForm.maker}          onChange={e => setPrinterForm(f => ({ ...f, maker: e.target.value }))}          placeholder="יצרן" list="dl-maker" />
                    <input style={inputStyle} value={printerForm.model}          onChange={e => setPrinterForm(f => ({ ...f, model: e.target.value }))}          placeholder="דגם" list="dl-model" />
                    <input style={inputStyle} value={printerForm.supplier}       onChange={e => setPrinterForm(f => ({ ...f, supplier: e.target.value }))}       placeholder="ספק" />
                    <input style={inputStyle} value={printerForm.supplierSerial} onChange={e => setPrinterForm(f => ({ ...f, supplierSerial: e.target.value }))} placeholder="מספר ספק" dir="ltr" />
                    <input style={inputStyle} value={printerForm.ipv4}           onChange={e => setPrinterForm(f => ({ ...f, ipv4: e.target.value }))}           placeholder="כתובת IPv4" dir="ltr" />
                    <input style={inputStyle} value={printerForm.hostname}       onChange={e => setPrinterForm(f => ({ ...f, hostname: e.target.value }))}       placeholder="Hostname" dir="ltr" />
                    <input style={inputStyle} value={printerForm.inkToner}       onChange={e => setPrinterForm(f => ({ ...f, inkToner: e.target.value }))}       placeholder="סוג דיו/טונר" />
                    <input type="number" min={0} max={100} style={inputStyle}    value={printerForm.tonerLevel} onChange={e => setPrinterForm(f => ({ ...f, tonerLevel: e.target.value }))} placeholder="מפלס טונר % (0–100)" />
                  </div>
                  <button
                    onClick={addPrinter}
                    disabled={printerSaving || !printerForm.name.trim()}
                    style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: printerSaving || !printerForm.name.trim() ? T.line : T.inverseBg, color: printerSaving || !printerForm.name.trim() ? T.inkFaint : T.inverseText, fontWeight: 700, fontSize: "0.85rem", cursor: printerSaving || !printerForm.name.trim() ? "not-allowed" : "pointer" }}
                  >
                    {printerSaving ? "שומר..." : "הוסף מדפסת"}
                  </button>
                  <p style={{ margin: "10px 0 0", fontSize: "0.75rem", color: T.inkFaint }}>דרייברים נוספים לאחר יצירת המדפסת — דרך כפתור &quot;➕ דרייבר&quot; בשורת המדפסת.</p>
                </div>
              )}

              {/* Printer list */}
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 20 }}>
                {printersLoading && <div style={{ fontSize: "0.85rem", color: T.inkFaint }}>טוען...</div>}
                {!printersLoading && filtered.length === 0 && (
                  <div style={{ fontSize: "0.85rem", color: T.inkFaint }}>
                    {printers.length === 0 ? "אין מדפסות עדיין — עברו למצב ניהול כדי להוסיף." : "לא נמצאו מדפסות התואמות לחיפוש."}
                  </div>
                )}
                {!printersLoading && filtered.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.line}`, background: T.fill2 }}>
                          <th style={thStyle}>שם</th>
                          <th style={thStyle}>יצרן</th>
                          <th style={thStyle}>דגם</th>
                          <th style={thStyle}>ספק</th>
                          <th style={thStyle}>מספר ספק</th>
                          <th style={thStyle}>IPv4</th>
                          <th style={thStyle}>Hostname</th>
                          <th style={thStyle}>דיו/טונר</th>
                          <th style={thStyle}>מפלס טונר</th>
                          <th style={thStyle}>דרייברים</th>
                          {manage && <th style={thStyle}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(p => editingPrinter?.id === p.id ? (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}`, background: T.amberBg }}>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 120 }} value={editingPrinter.name} onChange={e => setEditingPrinter(v => v ? { ...v, name: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 90 }} value={editingPrinter.maker ?? ""} list="dl-maker" onChange={e => setEditingPrinter(v => v ? { ...v, maker: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 90 }} value={editingPrinter.model ?? ""} list="dl-model" onChange={e => setEditingPrinter(v => v ? { ...v, model: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 90 }} value={editingPrinter.supplier ?? ""} onChange={e => setEditingPrinter(v => v ? { ...v, supplier: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 100 }} dir="ltr" value={editingPrinter.supplierSerial ?? ""} onChange={e => setEditingPrinter(v => v ? { ...v, supplierSerial: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 100 }} dir="ltr" value={editingPrinter.ipv4 ?? ""} onChange={e => setEditingPrinter(v => v ? { ...v, ipv4: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 100 }} dir="ltr" value={editingPrinter.hostname ?? ""} onChange={e => setEditingPrinter(v => v ? { ...v, hostname: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}><input style={{ ...inputStyle, minWidth: 100 }} value={editingPrinter.inkToner ?? ""} onChange={e => setEditingPrinter(v => v ? { ...v, inkToner: e.target.value } : v)} /></td>
                            <td style={{ padding: 8 }}>
                              <input
                                type="number" min={0} max={100}
                                style={{ ...inputStyle, minWidth: 70, width: 70 }}
                                value={editingPrinter.tonerLevel ?? ""}
                                placeholder="0–100"
                                onChange={e => {
                                  const raw = e.target.value
                                  setEditingPrinter(v => v ? { ...v, tonerLevel: raw === "" ? null : Math.max(0, Math.min(100, parseInt(raw, 10) || 0)) } : v)
                                }}
                              />
                            </td>
                            <td style={{ padding: "9px 8px" }}>{driversCell(p)}</td>
                            <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                              <button onClick={savePrinterEdit} disabled={printerEditSaving} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: T.inverseBg, color: T.inverseText, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginLeft: 6 }}>
                                {printerEditSaving ? "שומר..." : "שמור"}
                              </button>
                              <button onClick={() => setEditingPrinter(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: T.fill, color: T.ink, fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>ביטול</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: T.text }}>{p.name}</td>
                            <td style={tdStyle}>{p.maker || "—"}</td>
                            <td style={tdStyle}>{p.model || "—"}</td>
                            <td style={tdStyle}>{p.supplier || "—"}</td>
                            <td style={{ ...tdStyle, fontFamily: "monospace", direction: "ltr", textAlign: "right" }}>{p.supplierSerial || "—"}</td>
                            <td style={{ ...tdStyle, fontFamily: "monospace", direction: "ltr", textAlign: "right" }}>{p.ipv4 || "—"}</td>
                            <td style={{ ...tdStyle, fontFamily: "monospace", direction: "ltr", textAlign: "right" }}>{p.hostname || "—"}</td>
                            <td style={tdStyle}>{p.inkToner || "—"}</td>
                            <td style={{ padding: "9px 8px", minWidth: 110 }}>{tonerBar(p.tonerLevel)}</td>
                            <td style={{ padding: "9px 8px" }}>{driversCell(p)}</td>
                            {manage && (
                              <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                                <button onClick={() => { setEditingPrinter({ ...p }); setPrinterDeleteConfirm(null) }} title="עריכה" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", marginLeft: 4 }}>✏️</button>
                                {printerDeleteConfirm === p.id ? (
                                  <>
                                    <button onClick={() => deletePrinter(p.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: T.redFg, color: T.inverseText, fontWeight: 700, fontSize: "0.75rem", cursor: "pointer", marginLeft: 4 }}>בטוח?</button>
                                    <button onClick={() => setPrinterDeleteConfirm(null)} style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: T.fill, color: T.ink, fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>ביטול</button>
                                  </>
                                ) : (
                                  <button onClick={() => setPrinterDeleteConfirm(p.id)} title="מחק מדפסת" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}>🗑</button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── TICKETS TAB ── */}
        {/* ── EQUIPMENT SHORTAGE TAB ── */}
        {tab === "equipment" && (() => {
          const totalUnits = shortage.reduce((sum, i) => sum + i.outstanding, 0)
          const ticketNums = new Set(shortage.flatMap(i => i.tickets.map(t => t.ticketNumber)))
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Summary + actions */}
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: "0.95rem", fontWeight: 700, color: T.ink }}>📦 ציוד שטרם התקבל</h3>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: T.text3 }}>
                    {shortageLoading
                      ? "טוען..."
                      : totalUnits === 0
                        ? "אין ציוד חסר — כל מה שהתבקש התקבל."
                        : `${totalUnits} יחידות חסרות, ב-${ticketNums.size} פניות`}
                  </p>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: T.text2, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={shortageClosed}
                    onChange={e => { setShortageClosed(e.target.checked); loadShortage(e.target.checked) }}
                  />
                  כלול פניות סגורות
                </label>

                <button
                  onClick={() => loadShortage()}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: T.text, background: T.codeBg, border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 600 }}
                >רענן</button>

                <button
                  onClick={copyShortage}
                  disabled={totalUnits === 0}
                  title="העתקת הרשימה לשליחה לספק"
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: "0.82rem",
                    background: totalUnits === 0 ? T.line : T.inverseBg,
                    color:      totalUnits === 0 ? T.inkFaint : T.inverseText,
                    cursor:     totalUnits === 0 ? "not-allowed" : "pointer" }}
                >{shortageCopied ? "✓ הועתק" : "📋 העתק רשימה לספק"}</button>
              </div>

              {/* Empty state */}
              {!shortageLoading && shortage.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 24px", background: T.card, borderRadius: 16, border: `1px solid ${T.line}` }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✓</div>
                  <p style={{ margin: "0 0 4px", fontWeight: 700, color: T.ink }}>אין ציוד חסר</p>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: T.inkFaint }}>כל הפריטים שהתבקשו סומנו כהתקבלו</p>
                </div>
              )}

              {/* One row per item, expandable to the tickets waiting for it */}
              {shortage.map(item => {
                const open = shortageExpanded === item.label
                return (
                  <div key={item.label} style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                    <button
                      onClick={() => setShortageExpanded(open ? null : item.label)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "right" }}
                    >
                      <span style={{ fontSize: "1.15rem", fontWeight: 800, color: T.orangeFgDeep, background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 9, padding: "3px 12px", flexShrink: 0 }}>
                        {item.outstanding}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: "0.92rem", color: T.text, flex: 1, minWidth: 0 }}>{item.label}</span>
                      <span style={{ fontSize: "0.75rem", color: T.text3, whiteSpace: "nowrap" }}>
                        התקבלו {item.received} מתוך {item.requested} · {item.tickets.length} פניות
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transform: open ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.2s" }}>
                        <path d="M6 9l6 6 6-6" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {open && (
                      <div style={{ borderTop: `1px solid ${T.line}`, padding: "10px 18px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {item.tickets.map(t => (
                          <a
                            key={t.ticketNumber}
                            href={`/tickets/HDTC-${t.ticketNumber}`}
                            style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", fontSize: "0.82rem", color: T.ink, padding: "5px 0" }}
                          >
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 7px", flexShrink: 0 }}>
                              HDTC-{t.ticketNumber}
                            </span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
                            <span style={{ ...badge, ...(STATUS_STYLES[t.status] ?? {}) }}>{t.status}</span>
                            <span style={{ fontWeight: 700, color: T.orangeFgDeep, flexShrink: 0 }}>חסר {t.outstanding}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* The exact text the copy button puts on the clipboard */}
              {shortage.length > 0 && (
                <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 18 }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: "0.82rem", fontWeight: 700, color: T.ink }}>הרשימה לשליחה לספק</h4>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.84rem", color: T.ink, background: T.fill2, borderRadius: 8, padding: "12px 14px", lineHeight: 1.7 }}>
                    {shortageText}
                  </pre>
                </div>
              )}
            </div>
          )
        })()}

        {tab === "tickets" && <>

        {/* Stats row */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: isMobile ? "8px" : "10px" }}>
            {[
              { label: "בתור (פתוח)", count: openTickets.length,                                         color: T.text,    bg: T.codeBg,    filterKey: "queue" },
              { label: "דחוף",        count: urgentCount,                                               color: URGENCY["דחוף"].fg, bg: URGENCY["דחוף"].bg, filterKey: "urgent" },
              { label: "גבוה",        count: highCount,                                                 color: URGENCY["גבוה"].fg, bg: URGENCY["גבוה"].bg, filterKey: "high" },
              { label: "בטיפול",      count: openTickets.filter(t => t.status === "בטיפול").length,    color: STATUS["בטיפול"].fg, bg: STATUS["בטיפול"].bg, filterKey: "inprog" },
              { label: "בהמתנה",     count: tickets.filter(t => t.status === "בהמתנה").length,        color: STATUS["בהמתנה"].fg, bg: STATUS["בהמתנה"].bg, filterKey: "onhold" },
              { label: "סגורות",      count: tickets.filter(t => t.status === "סגור").length,           color: T.greenInk, bg: T.greenBg,  filterKey: "closed" },
            ].map(({ label, count, color, bg, filterKey }) => {
              const isActive = statFilter === filterKey
              return (
                <button
                  key={label}
                  onClick={() => setStatFilter(f => f === filterKey ? null : filterKey)}
                  style={{ backgroundColor: isActive ? bg : T.card, borderRadius: "12px", padding: "10px 11px", boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", border: isActive ? `2px solid ${color}` : `1px solid ${T.border}`, cursor: "pointer", textAlign: "right", width: "100%" }}
                >
                  <span style={{ fontSize: "0.72rem", color: isActive ? color : T.text3, fontWeight: isActive ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                  <span style={{ fontSize: "1.05rem", fontWeight: 800, color, flexShrink: 0 }}>{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
            placeholder="חיפוש לפי מספר פנייה (HDTC-123), נושא, שם, קטגוריה..."
            style={{ flex: 1, minWidth: 200, padding: "8px 13px", borderRadius: 10, border: `1px solid ${T.line}`, fontSize: "0.85rem", background: T.card }}
          />
          {/* Open / All toggle */}
          <div style={{ display: "flex", background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
            {[{ label: "פתוחות", val: false }, { label: "הכל", val: true }].map(opt => (
              <button key={String(opt.val)} onClick={() => setShowAll(opt.val)}
                style={{ padding: "7px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem",
                  background: showAll === opt.val ? T.inverseBg : "transparent",
                  color:      showAll === opt.val ? T.inverseText    : T.inkMuted,
                  transition: "all 0.15s" }}
              >{opt.label}</button>
            ))}
          </div>
          {/* Sort buttons — on mobile wrap to own full-width scrollable row */}
          <div style={{ display: "flex", gap: 4, ...(isMobile ? { order: 99, width: "100%", overflowX: "auto", paddingBottom: 2 } : {}) }}>
            {([
              { key: "urgency",   label: "דחיפות" },
              { key: "status",    label: "סטטוס" },
              { key: "createdAt", label: "נפתח" },
              { key: "updatedAt", label: "עודכן" },
              { key: "subject",   label: "נושא" },
            ] as const).map(col => (
              <button key={col.key} onClick={() => handleSort(col.key)}
                style={{ display: "flex", alignItems: "center", gap: 3, padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                  background: sortKey === col.key ? T.codeBg : T.fill,
                  color:      sortKey === col.key ? T.text : T.inkFaint }}
              >
                {col.label}
                <span style={{ fontSize: "0.6rem" }}>
                  {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                </span>
              </button>
            ))}
          </div>
          <button onClick={loadTickets}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: T.text, background: T.codeBg, border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontWeight: 600 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            רענן
          </button>
          <span style={{ fontSize: "0.78rem", color: T.inkFaint }}>{displayTickets.length} פניות</span>
        </div>

        {/* Active stat filter indicator */}
        {statFilter && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: T.codeBg, border: `1px solid ${T.purpleBorder}`, borderRadius: 10, fontSize: "0.82rem", color: T.text }}>
            <span>מסנן: {statFilter === "queue" ? "בתור (פתוח)" : statFilter === "urgent" ? "דחוף" : statFilter === "high" ? "גבוה" : statFilter === "inprog" ? "בטיפול" : "סגורות"}</span>
            <button onClick={() => setStatFilter(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text, fontWeight: 700, fontSize: "0.82rem", padding: 0 }}>— לחץ לביטול ✕</button>
          </div>
        )}

        {/* Ticket-number suggestion — an exact HDTC-N hit, open or closed */}
        {numberSuggestion && (
          <a
            href={`/tickets/HDTC-${numberSuggestion.ticketNumber}`}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.card, border: `1px solid ${T.border}`, borderRight: `4px solid ${T.text}`, borderRadius: 12, textDecoration: "none", boxShadow: `0 1px 3px ${T.shadow1}`, flexWrap: "wrap" }}
          >
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 7px", flexShrink: 0 }}>
              HDTC-{numberSuggestion.ticketNumber}
            </span>
            <span style={{ fontWeight: 600, color: T.text, fontSize: "0.86rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
              {numberSuggestion.subject}
            </span>
            <span style={{ ...badge, ...(STATUS_STYLES[numberSuggestion.status] ?? {}) }}>{numberSuggestion.status}</span>
            <span style={{ fontSize: "0.72rem", color: T.text3, flexShrink: 0 }}>פנייה מספר {numberSuggestion.ticketNumber} — פתחו ←</span>
          </a>
        )}

        {/* Title */}
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: T.text }}>
            {showAll ? "כל הפניות" : "תור פניות פתוחות"}
          </h2>
          {!loading && !sortKey && (
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: T.inkFaint }}>
              {showAll ? "ממוין לפי תאריך עדכון אחרון" : "ממוין לפי דחיפות, אחר כך לפי זמן פתיחה"}
            </p>
          )}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint }}>
            <div style={{ width: "36px", height: "36px", border: `3px solid ${T.line}`, borderTopColor: T.text, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען...</p>
          </div>
        ) : displayTickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 24px", backgroundColor: T.card, borderRadius: "16px", border: `1px solid ${T.line}`, boxShadow: `0 1px 4px ${T.shadow1}` }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>{openTickets.length === 0 && !showAll ? "✓" : "🔍"}</div>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: T.ink }}>{openTickets.length === 0 && !showAll ? "כל הפניות טופלו!" : "לא נמצאו פניות"}</p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: T.inkFaint }}>{openTickets.length === 0 && !showAll ? "אין פניות פתוחות כרגע" : "נסו לשנות את החיפוש או הסינון"}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {displayTickets.map((ticket, i) => {
              const isClosed = ticket.status === "סגור"
              const isOnHold = ticket.status === "בהמתנה"
              const isStale = !isClosed && !isOnHold && isStaleOpen(ticket)
              const wdOpen = isClosed
                ? workdaysBetween(ticket.createdAt, ticket.updatedAt)
                : workdaysBetween(ticket.createdAt)
              return (
              <div
                key={ticket.id}
                onMouseEnter={() => setHoverId(ticket.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{
                  backgroundColor: isOnHold ? T.fill2 : isStale ? T.orangeBg : T.card,
                  borderRadius: "12px",
                  border: isStale ? `1px solid ${T.orangeBorder}` : isOnHold ? `1px solid ${T.line}` : `1px solid ${T.line}`,
                  borderRight: `4px solid ${isStale ? "${T.orangeFg}" : isClosed ? "${T.lineStrong}" : isOnHold ? "${T.inkFaint}" : (URGENCY_BORDER[ticket.urgency] ?? "${T.line}")}`,
                  boxShadow: hoverId === ticket.id ? `0 4px 16px ${T.shadow2}` : `0 1px 3px ${T.shadow1}`,
                  overflow: "hidden",
                  transition: "box-shadow 0.15s",
                  opacity: isClosed ? 0.72 : isOnHold ? 0.82 : 1,
                }}
              >
                {/* Main row */}
                {isMobile ? (
                  <div
                    onClick={async () => {
                      const next = expanded === ticket.id ? null : ticket.id
                      setExpanded(next)
                      if (next && !expandedNotes[next]) {
                        try {
                          const r = await fetch(`/api/tickets/${next}`)
                          if (r.ok) {
                            const d = await r.json()
                            setExpandedNotes(p => ({ ...p, [next]: d.notes ?? [] }))
                            setExpandedMessages(p => ({ ...p, [next]: d.messages ?? [] }))
                          }
                        } catch { /* silent */ }
                      }
                    }}
                    style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>HDTC-{ticket.ticketNumber}</span>
                        <span style={{ fontWeight: 600, color: T.text, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transition: "transform 0.2s", transform: expanded === ticket.id ? "rotate(-90deg)" : "rotate(0)" }}>
                        <path d="M6 9l6 6 6-6" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}), padding: "2px 8px" }}>{ticket.urgency}</span>
                      <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}), padding: "2px 8px" }}>{ticket.status}</span>
                      <span style={{ fontSize: "0.68rem", color: isStale ? T.orangeFgDeep : T.inkFaint, fontWeight: isStale ? 700 : 400 }}>
                        {new Date(ticket.createdAt).toLocaleDateString("he-IL")} · {formatWorkdays(wdOpen)}
                      </span>
                      {isStale && (
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: T.orangeFgDeep, background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 6, padding: "1px 5px" }}>⏰ מוזנח</span>
                      )}
                    </div>
                  </div>
                ) : (
                <div
                  onClick={async () => {
                    const next = expanded === ticket.id ? null : ticket.id
                    setExpanded(next)
                    if (next && !expandedNotes[next]) {
                      try {
                        const r = await fetch(`/api/tickets/${next}`)
                        if (r.ok) {
                          const d = await r.json()
                          setExpandedNotes(p => ({ ...p, [next]: d.notes ?? [] }))
                          setExpandedMessages(p => ({ ...p, [next]: d.messages ?? [] }))
                        }
                      } catch { /* silent */ }
                    }
                  }}
                  style={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto auto auto auto", alignItems: "center", gap: "14px", padding: "14px 18px", cursor: "pointer" }}
                >
                  {/* Queue position */}
                  <div style={{
                    width: "26px", height: "26px", borderRadius: "50%",
                    backgroundColor: i === 0 && !showAll && !sortKey ? T.amberBg : T.fill,
                    color: i === 0 && !showAll && !sortKey ? T.amberFgDeep : T.inkFaint,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 800, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Subject + user info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: T.text, background: T.codeBg, borderRadius: 6, padding: "1px 7px", letterSpacing: "0.03em", flexShrink: 0 }}>
                        HDTC-{ticket.ticketNumber}
                      </span>
                      <span style={{ fontWeight: 600, color: T.text, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticket.subject}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: T.inkFaint, marginTop: "2px" }}>
                      {ticket.user?.name ?? ticket.user?.email} · {ticket.phone} · {ticket.computerName} · {ticket.category} · {ticket.platform}
                    </div>
                  </div>

                  {/* Urgency */}
                  <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}) }}>{ticket.urgency}</span>

                  {/* Status */}
                  <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}) }}>{ticket.status}</span>

                  {/* Assignee */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
                    title={ticket.assignedTo}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: ticket.assignedTo === session?.user?.email ? T.inverseBg : T.inkMuted, color: T.inverseText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 700 }}>
                      {staffDisplay(ticket.assignedTo).slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.72rem", color: T.inkMuted, fontWeight: 500, whiteSpace: "nowrap" }}>{staffDisplay(ticket.assignedTo)}</span>
                  </div>

                  {/* Time + workdays */}
                  <div style={{ fontSize: "0.72rem", color: isStale ? T.orangeFgDeep : T.inkFaint, textAlign: "left", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                    <div>{new Date(ticket.createdAt).toLocaleDateString("he-IL")}</div>
                    <div style={{ color: isStale ? T.orangeFgDeep : isClosed ? T.greenSFg : T.inkMuted, fontWeight: 600 }}>
                      {isStale ? "⏰ " : ""}{isClosed ? `נסגר ${formatWorkdays(wdOpen)}` : formatWorkdays(wdOpen)}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transition: "transform 0.2s", transform: expanded === ticket.id ? "rotate(-90deg)" : "rotate(0)" }}>
                    <path d="M6 9l6 6 6-6" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                )}

                {/* Expanded panel */}
                {expanded === ticket.id && (
                  <div style={{ borderTop: `1px solid ${T.line}`, padding: "16px 20px", backgroundColor: T.fill2 }}>
                    {editingTicketId === ticket.id ? (
                      /* ── Edit mode ── */
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>נושא</div>
                            <input value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>טלפון</div>
                            <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>שם מחשב</div>
                          <input value={editForm.computerName} onChange={e => setEditForm(f => ({ ...f, computerName: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.875rem", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>תיאור</div>
                          <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={4}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                          {([
                            { label: "דחיפות", key: "urgency",  opts: fieldUrgencies },
                            { label: "סטטוס",  key: "status",   opts: ["פתוח", "בטיפול", "בהמתנה", "סגור"] },
                            { label: "קטגוריה", key: "category", opts: fieldCategories },
                            { label: "פלטפורמה", key: "platform", opts: fieldPlatforms },
                          ]).map(({ label, key, opts }) => (
                            <div key={key}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>{label}</div>
                              <select value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.875rem", background: T.card }}>
                                {opts.map(o => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                        {editForm.status === "בהמתנה" && (
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, marginBottom: 4 }}>סיבת ההמתנה</div>
                            <input value={editForm.holdReason} onChange={e => setEditForm(f => ({ ...f, holdReason: e.target.value }))}
                              placeholder="למשל: ממתין לחלק חלף, ממתין לאישור ספק..."
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={e => { e.stopPropagation(); saveEdit() }} disabled={editSaving}
                            style={{ background: `linear-gradient(135deg,${T.inverseBg},${T.inverseBg})`, color: T.inverseText, fontWeight: 700, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem", opacity: editSaving ? 0.6 : 1 }}>
                            {editSaving ? "שומר..." : "שמור"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); setEditingTicketId(null) }}
                            style={{ background: T.fill, color: T.ink, fontWeight: 600, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                            ביטול
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <>
                        {/* Assignment row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: T.fill2, borderRadius: 10, border: `1px solid ${T.line}` }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: T.ink, flexShrink: 0 }}>👤 מוקצה ל:</span>
                          <select
                            value={ticket.assignedTo}
                            disabled={assigning === ticket.id}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); assignTicket(ticket.id, e.target.value) }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", background: T.card, fontWeight: 600, color: T.text, cursor: "pointer", opacity: assigning === ticket.id ? 0.5 : 1 }}
                          >
                            {staffMembers.map(m => (
                              <option key={m.email} value={m.email}>{m.display}</option>
                            ))}
                          </select>
                          {ticket.assignedTo !== session?.user?.email && (
                            <button
                              onClick={e => { e.stopPropagation(); assignTicket(ticket.id, session?.user?.email ?? "") }}
                              disabled={assigning === ticket.id || !session?.user?.email}
                              style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: T.inverseBg, color: T.inverseText, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", opacity: assigning === ticket.id ? 0.5 : 1 }}
                            >
                              הקצה לעצמי
                            </button>
                          )}
                          {assigning === ticket.id && <span style={{ fontSize: "0.72rem", color: T.inkFaint }}>שומר...</span>}
                        </div>

                        <p style={{ margin: "0 0 16px", fontSize: "0.875rem", color: T.ink, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: holdForId === ticket.id ? 6 : 14 }}>
                          <span style={{ fontSize: "0.78rem", color: T.inkMuted, fontWeight: 600 }}>שנה סטטוס:</span>
                          {["פתוח", "בטיפול", "בהמתנה", "סגור"].map(s => (
                            <button key={s} disabled={updating === ticket.id || ticket.status === s}
                              onClick={e => { e.stopPropagation(); updateStatus(ticket.id, s) }}
                              style={{ padding: "5px 14px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: ticket.status === s || updating === ticket.id ? "default" : "pointer", opacity: updating === ticket.id ? 0.5 : 1, ...(ticket.status === s ? STATUS_STYLES[s] : { backgroundColor: T.fill, color: T.ink }) }}>
                              {s}
                            </button>
                          ))}
                          <button
                            style={{ padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: T.codeBg, color: T.text }}
                            onClick={e => { e.stopPropagation(); setEditingTicketId(ticket.id); setEditForm({ subject: ticket.subject, description: ticket.description, phone: ticket.phone, computerName: ticket.computerName, urgency: ticket.urgency, category: ticket.category, platform: ticket.platform, status: ticket.status, holdReason: ticket.holdReason ?? "" }) }}>
                            ✏️ עריכה
                          </button>
                          <a href={`/tickets/HDTC-${ticket.ticketNumber}`} onClick={e => e.stopPropagation()}
                            style={{ marginRight: "auto", padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, textDecoration: "none", background: T.greenSBg, color: T.greenSFgDeep }}>
                            🔍 פתח פנייה מלאה
                          </a>
                        </div>

                        {/* ── Hold reason input (shown after clicking "בהמתנה") ── */}
                        {holdForId === ticket.id && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, padding: "10px 12px", background: T.fill2, borderRadius: 10, border: `1px solid ${T.line}` }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: T.ink, marginBottom: 4 }}>סיבת ההמתנה (אופציונלי)</div>
                              <input
                                autoFocus
                                value={holdInput}
                                onChange={e => setHoldInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmHold(ticket.id) } if (e.key === "Escape") setHoldForId(null) }}
                                placeholder="למשל: ממתין לחלק חלף, ממתין לאישור ספק..."
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", boxSizing: "border-box" }}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 22 }}>
                              <button onClick={e => { e.stopPropagation(); confirmHold(ticket.id) }}
                                style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: T.inverseBg, color: T.inverseText, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
                                אשר
                              </button>
                              <button onClick={e => { e.stopPropagation(); setHoldForId(null) }}
                                style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: T.fill, color: T.ink, fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>
                                ביטול
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Current hold reason (shown when ticket is on hold) ── */}
                        {ticket.status === "בהמתנה" && ticket.holdReason && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, padding: "10px 14px", background: T.fill, borderRadius: 10, border: `1px solid ${T.line}` }}>
                            <span style={{ fontSize: "0.9rem" }}>⏸</span>
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: T.inkMuted, marginBottom: 2 }}>סיבת ההמתנה</div>
                              <div style={{ fontSize: "0.83rem", color: T.ink }}>{ticket.holdReason}</div>
                            </div>
                          </div>
                        )}

                        {/* ── Conversation with user ── */}
                        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14, marginBottom: 14 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: T.ink, marginBottom: 10 }}>💬 שיחה עם המגיש</div>
                          {(expandedMessages[ticket.id] ?? []).length === 0
                            ? <div style={{ fontSize: "0.78rem", color: T.inkFaint, marginBottom: 10 }}>אין הודעות עדיין</div>
                            : (expandedMessages[ticket.id] ?? []).map((msg: TicketMessage) => (
                                <div key={msg.id} style={{ display: "flex", gap: 8, marginBottom: 10, flexDirection: msg.authorRole === "staff" ? "row-reverse" : "row", alignItems: "flex-start" }}>
                                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.authorRole === "staff" ? T.inverseBg : T.cyanFg, color: T.inverseText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0 }}>
                                    {msg.authorName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                                  </div>
                                  <div style={{ maxWidth: "70%" }}>
                                    <div style={{ fontSize: "0.68rem", color: T.inkFaint, marginBottom: 2, textAlign: msg.authorRole === "staff" ? "left" : "right" }}>
                                      {msg.authorName} · {new Date(msg.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                                    </div>
                                    <div style={{ background: msg.authorRole === "staff" ? T.codeBg : T.blueBg, borderRadius: 8, padding: "7px 11px", fontSize: "0.82rem", color: T.text, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                                  </div>
                                </div>
                              ))
                          }
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                            <textarea
                              rows={2}
                              placeholder="כתוב תגובה למגיש..."
                              value={replyText[ticket.id] ?? ""}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setReplyText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                              style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", resize: "none", boxSizing: "border-box" }}
                            />
                            <button
                              onClick={async e => {
                                e.stopPropagation()
                                const content = (replyText[ticket.id] ?? "").trim()
                                if (!content) return
                                setReplySaving(ticket.id)
                                try {
                                  const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ content }),
                                  })
                                  if (res.ok) {
                                    const msg: TicketMessage = await res.json()
                                    setExpandedMessages(prev => ({ ...prev, [ticket.id]: [...(prev[ticket.id] ?? []), msg] }))
                                    setReplyText(prev => ({ ...prev, [ticket.id]: "" }))
                                  }
                                } finally { setReplySaving(null) }
                              }}
                              disabled={replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim()}
                              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? T.line : T.inverseBg, color: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? T.inkFaint : T.inverseText, cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
                            >
                              {replySaving === ticket.id ? "..." : "שלח"}
                            </button>
                          </div>
                        </div>

                        {/* ── Notes ── */}
                        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: T.ink, marginBottom: 10 }}>📝 הערות טכנאי</div>
                          {(expandedNotes[ticket.id] ?? []).length === 0
                            ? <div style={{ fontSize: "0.78rem", color: T.inkFaint, marginBottom: 10 }}>אין הערות עדיין</div>
                            : (expandedNotes[ticket.id] ?? []).map((note: TicketNote) => (
                                <div key={note.id} style={{ borderRight: `3px solid ${T.purpleFg}`, paddingRight: 10, marginBottom: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: T.text }}>{note.authorName}</span>
                                    <span style={{ fontSize: "0.7rem", color: T.inkFaint }}>{new Date(note.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
                                  </div>
                                  <div style={{ fontSize: "0.82rem", color: T.ink, whiteSpace: "pre-wrap" }}>{note.content}</div>
                                </div>
                              ))
                          }
                          <textarea
                            rows={2}
                            placeholder="הוסף הערה... לחצו על שם למטה להזכרת איש צוות"
                            value={noteText[ticket.id] ?? ""}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setNoteText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", resize: "none", boxSizing: "border-box", marginBottom: 4 }}
                          />
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: "0.68rem", color: T.inkFaint, alignSelf: "center" }}>הזכר:</span>
                            {staffMembers.map(m => (
                              <button key={m.handle} type="button"
                                onClick={e => { e.stopPropagation(); setNoteText(prev => { const cur = prev[ticket.id] ?? ""; return { ...prev, [ticket.id]: cur ? `${cur} @${m.handle}` : `@${m.handle}` } }) }}
                                style={{ padding: "1px 8px", borderRadius: 20, border: `1px solid ${T.border}`, background: T.codeBg, color: T.text, fontSize: "0.68rem", fontWeight: 600, cursor: "pointer" }}
                              >@{m.handle}</button>
                            ))}
                          </div>
                          <div onClick={e => e.stopPropagation()} style={{ marginBottom: 8 }}>
                            <ImageAttachments
                              images={noteImages[ticket.id] ?? []}
                              onChange={imgs => setNoteImages(prev => ({ ...prev, [ticket.id]: imgs }))}
                            />
                          </div>
                          <button
                            onClick={async e => {
                              e.stopPropagation()
                              const content = (noteText[ticket.id] ?? "").trim()
                              const imgs = noteImages[ticket.id] ?? []
                              if (!content && !imgs.length) return
                              setNoteSaving(ticket.id)
                              try {
                                for (const img of imgs) {
                                  await fetch(`/api/tickets/${ticket.id}/attachments`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
                                  })
                                }
                                if (content) {
                                  const res = await fetch(`/api/tickets/${ticket.id}/notes`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ content }),
                                  })
                                  if (res.ok) {
                                    const note: TicketNote = await res.json()
                                    setExpandedNotes(prev => ({ ...prev, [ticket.id]: [...(prev[ticket.id] ?? []), note] }))
                                  }
                                }
                                setNoteText(prev => ({ ...prev, [ticket.id]: "" }))
                                setNoteImages(prev => ({ ...prev, [ticket.id]: [] }))
                              } finally { setNoteSaving(null) }
                            }}
                            disabled={noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length)}
                            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length) ? T.line : T.inverseBg, color: noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length) ? T.inkFaint : T.inverseText, cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
                          >
                            {noteSaving === ticket.id ? "..." : "הוסף"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
            })}
          </div>
        )}
        </> }
      </main>

      <FooterCopyright />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
