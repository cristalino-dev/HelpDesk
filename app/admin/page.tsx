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
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"
import { STAFF_MEMBERS } from "@/lib/staffEmails"
import type { TicketWithUser, TicketNote, TicketMessage } from "@/types/ticket"
import type { Printer } from "@/types/printer"
import FooterCopyright from "@/components/FooterCopyright"
import { useIsMobile } from "@/lib/useIsMobile"
import { workdaysBetween, formatWorkdays } from "@/lib/workdays"
import { isStaleOpen } from "@/lib/staleTicket"
import { setTicketStatus, updateTicket } from "@/lib/ticketApi"
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS, DEFAULT_URGENCIES, fetchFieldOptions } from "@/lib/fieldOptions"
import { T, STATUS, URGENCY, URGENCY_BAR } from "@/lib/theme"
import Logo from "@/components/Logo"

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

function initials(name?: string | null) {
  if (!name) return "?"
  return name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
}

interface UserRow { id: string; name: string | null; email: string; phone: string | null; station: string | null; isAdmin: boolean }

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  const [statFilter, setStatFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<"tickets" | "users" | "logs" | "fields" | "licenses" | "printers">("tickets")
  const [tickets, setTickets] = useState<TicketWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [staffMembers, setStaffMembers] = useState<{ email: string; handle: string; display: string }[]>(STAFF_MEMBERS)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
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
  const [fieldRecords, setFieldRecords] = useState<Record<string, FieldRecord[]>>({ category: [], platform: [], urgency: [] })
  const [fieldUrgencies,  setFieldUrgencies]  = useState<string[]>(DEFAULT_URGENCIES)
  const [fieldCategories, setFieldCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [fieldPlatforms,  setFieldPlatforms]  = useState<string[]>(DEFAULT_PLATFORMS)
  const [newFieldValue, setNewFieldValue] = useState("")
  const [newFieldType, setNewFieldType]   = useState<"category" | "platform" | "urgency">("category")
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
      const res = await fetch("/api/tickets")
      if (!res.ok) { setTickets([]); return }
      const data = await res.json()
      setTickets(Array.isArray(data) ? data : [])
    } catch {
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const staffDisplay = (email: string) =>
    staffMembers.find(m => m.email === email)?.display ?? email.split("@")[0]

  // ── Derived ticket lists ─────────────────────────────────────────────────
  const { displayTickets, openTickets } = useMemo(() => {
    const URGENCY_RANK: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 }
    const openTickets = tickets.filter(t => t.status !== "סגור")

    let list = statFilter ? [...tickets] : (showAll ? tickets : openTickets)
    if (ticketSearch.trim()) {
      const q = ticketSearch.trim().toLowerCase()
      list = list.filter(t =>
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
    return { displayTickets, openTickets }
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
      await setTicketStatus(id, newStatus)
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
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUser),
      })
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
      {/* Header — white chrome, hairline */}
      <header style={{
        background: T.card,
        padding: isMobile ? "0 16px" : "0 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "66px",
        borderBottom: `1px solid ${T.border}`,
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <Logo size={42} wordmark={isMobile ? "ניהול" : "כל הפניות"} subtitle={false} />
        </div>

        {isMobile ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ padding: "4px 11px", borderRadius: "999px", background: T.dark, color: T.green, fontSize: "0.68rem", fontWeight: 700, letterSpacing: ".04em" }}>ADMIN</span>
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: "1.3rem", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <a href="/admin-manual" style={{ fontSize: "0.82rem", color: T.text2, textDecoration: "none", padding: "8px 13px", borderRadius: "9px", fontWeight: 500 }}>📖 מדריך מנהל</a>
            <a href="/admin/reviews" style={{ fontSize: "0.82rem", color: T.text2, textDecoration: "none", padding: "8px 13px", borderRadius: "9px", fontWeight: 500 }}>⭐ ביקורות</a>
            <a href="/admin/logs" style={{ fontSize: "0.82rem", color: T.text2, textDecoration: "none", padding: "8px 13px", borderRadius: "9px", fontWeight: 500 }}>⚠️ לוג שגיאות</a>
            <a href="/dashboard" style={{ fontSize: "0.82rem", color: T.text2, textDecoration: "none", padding: "8px 13px", borderRadius: "9px", fontWeight: 500 }}>לוח משתמש</a>
            <span style={{ padding: "5px 12px", borderRadius: "999px", background: T.dark, color: T.green, fontSize: "0.7rem", fontWeight: 700, letterSpacing: ".04em", margin: "0 4px" }}>ADMIN</span>
            <Link href="/profile" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", cursor: "pointer", padding: "5px 7px 5px 12px", borderRadius: "999px", background: T.bg }}>
              <span style={{ fontSize: "0.81rem", color: T.text, fontWeight: 500 }}>{session?.user?.name}</span>
              <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, color: T.green }}>
                {initials(session?.user?.name)}
              </div>
            </Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ fontSize: "0.82rem", color: T.muted, background: "none", border: "none", cursor: "pointer", padding: "8px 12px", fontWeight: 500 }}>יציאה</button>
          </div>
        )}
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && isMobile && (
        <div style={{ position: "absolute", top: 66, right: 0, left: 0, zIndex: 100, background: T.card, boxShadow: "0 8px 24px rgba(20,22,26,0.12)", borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <a href="/admin-manual" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: T.text2, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>📖 מדריך מנהל</a>
          <a href="/admin/reviews" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: T.text2, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>⭐ ביקורות</a>
          <a href="/admin/logs" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: T.text2, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>⚠️ לוג שגיאות</a>
          <a href="/contact" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: T.text2, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>צרו קשר</a>
          <a href="/dashboard" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "14px 24px", color: T.text2, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>לוח משתמש</a>
          <Link href="/profile" onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", color: T.text, textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.dark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: T.green }}>
              {initials(session?.user?.name)}
            </div>
            {session?.user?.name}
          </Link>
          <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/login" }) }} style={{ display: "block", width: "100%", textAlign: "right", padding: "14px 24px", color: T.muted, background: "none", border: "none", fontSize: "0.9rem", fontWeight: 500, cursor: "pointer" }}>יציאה</button>
        </div>
      )}

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e5e7eb", paddingBottom: "0", overflowX: isMobile ? "auto" : "visible", flexWrap: isMobile ? "nowrap" : "wrap" }}>
          {([["tickets", "תור פניות"], ["users", "ניהול משתמשים"], ["logs", "יומן שגיאות"], ["fields", "שדות מערכת"], ["licenses", "רישוי"], ["printers", "מדפסות"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => {
              setTab(key)
              if (key === "users" && users.length === 0) loadUsers()
              if (key === "logs") loadLogs(logDate)
              if (key === "fields") loadFieldOpts()
              if (key === "licenses") { loadLicenses(); loadFieldOpts() }
              if (key === "printers") loadPrinters()
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
              style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #e5e7eb", fontSize: "0.88rem", backgroundColor: "#fff", width: "100%", boxSizing: "border-box" }}
            />

            {usersLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>טוען...</div>
            ) : (
              <div style={{ backgroundColor: "#fff", borderRadius: "14px", border: "1px solid #f3f4f6", overflow: "hidden" }}>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px 80px 80px", gap: "12px", padding: "10px 16px", backgroundColor: "#f9fafb", borderBottom: "1px solid #f3f4f6", fontSize: "0.75rem", fontWeight: 700, color: "#6b7280" }}>
                  <span>שם</span><span>אימייל</span><span>טלפון</span><span>תחנה</span><span>מנהל</span><span></span>
                </div>
                {filteredUsers.length === 0 && <div style={{ padding: "32px", textAlign: "center", color: "#9ca3af", fontSize: "0.88rem" }}>לא נמצאו משתמשים</div>}
                {filteredUsers.map(u => (
                  <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 140px 80px 80px", gap: "12px", padding: "12px 16px", borderBottom: "1px solid #f9fafb", alignItems: "center", fontSize: "0.85rem", color: "#374151" }}>
                    <span style={{ fontWeight: 600 }}>{u.name ?? "—"}</span>
                    <span style={{ color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                    <span>{u.phone ?? "—"}</span>
                    <span>{u.station ?? "—"}</span>
                    <span style={{ color: u.isAdmin ? "#16181D" : "#9ca3af", fontWeight: u.isAdmin ? 700 : 400 }}>{u.isAdmin ? "כן" : "לא"}</span>
                    <button onClick={() => setEditingUser({ ...u })} style={{ fontSize: "0.75rem", color: "#16181D", background: "#EDEFEA", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}>עריכה</button>
                  </div>
                ))}
              </div>
            )}

            {/* Edit modal */}
            {editingUser && (
              <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
                <div style={{ backgroundColor: "#fff", borderRadius: "16px", padding: "28px", width: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937" }}>עריכת משתמש</h3>
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{editingUser.email}</div>

                  {[
                    { label: "שם מלא",     key: "name"    as const, placeholder: "ישראל ישראלי" },
                    { label: "טלפון",      key: "phone"   as const, placeholder: "050-0000000" },
                    { label: "תחנת עבודה", key: "station" as const, placeholder: "PC-USER-01" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>{label}</label>
                      <input value={editingUser[key] ?? ""} onChange={e => setEditingUser(u => u ? { ...u, [key]: e.target.value } : u)} placeholder={placeholder}
                        style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "0.88rem", boxSizing: "border-box" }} />
                    </div>
                  ))}

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input type="checkbox" id="isAdmin" checked={editingUser.isAdmin} onChange={e => setEditingUser(u => u ? { ...u, isAdmin: e.target.checked } : u)} />
                    <label htmlFor="isAdmin" style={{ fontSize: "0.88rem", color: "#374151", fontWeight: 600 }}>הרשאת מנהל</label>
                  </div>

                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-start" }}>
                    <button onClick={saveUser} disabled={userSaving} style={{ background: "linear-gradient(135deg, #16181D, #16181D)", color: "#fff", fontWeight: 700, padding: "9px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                      {userSaving ? "שומר..." : "שמור"}
                    </button>
                    <button onClick={closeEditModal} style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, padding: "9px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>ביטול</button>
                  </div>

                  {/* Delete section */}
                  <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14, marginTop: 2 }}>
                    {deleteError && (
                      <div style={{ marginBottom: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: "0.8rem", color: "#b91c1c" }}>
                        {deleteError}
                      </div>
                    )}
                    {!deleteConfirm ? (
                      <button
                        onClick={() => { setDeleteConfirm(true); setDeleteError(null) }}
                        style={{ background: "none", border: "1px solid #fca5a5", color: "#dc2626", fontWeight: 600, padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem" }}
                      >
                        🗑 מחק משתמש
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.82rem", color: "#374151", fontWeight: 600 }}>בטוח? הפניות יועברו לחשבון helpdesk.</span>
                        <button
                          onClick={deleteUser}
                          disabled={userDeleting}
                          style={{ background: "#dc2626", color: "#fff", fontWeight: 700, padding: "7px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.82rem", opacity: userDeleting ? 0.6 : 1 }}
                        >
                          {userDeleting ? "מוחק..." : "כן, מחק"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, padding: "7px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.82rem" }}
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
                style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "0.88rem", backgroundColor: "#fff" }}
              />
              <button
                onClick={() => loadLogs(logDate)}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#EDEFEA", color: "#16181D", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#16181D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                רענן
              </button>
              {!logsLoading && (
                <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                  {logCount} {logCount === 1 ? "רשומה" : "רשומות"}
                </span>
              )}
              {logText && !logsLoading && (
                <>
                  <button
                    onClick={copyLogText}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: copyLogStatus ? "#dcfce7" : "#EDEFEA", color: copyLogStatus ? "#166534" : "#16181D", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    {copyLogStatus ? "✓ הועתק" : "📋 העתק הכל"}
                  </button>
                  <button
                    onClick={downloadLog}
                    style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#f0fdf4", color: "#15803d", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
                  >
                    ⬇️ הורד
                  </button>
                </>
              )}
            </div>

            {/* Log viewer */}
            {logsLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>טוען יומן...</div>
            ) : (
              <textarea
                readOnly
                value={logText}
                style={{
                  width: "100%",
                  height: "520px",
                  padding: "16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  backgroundColor: "#16181D",
                  color: "#e2e8f0",
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

            <p style={{ margin: 0, fontSize: "0.72rem", color: "#9ca3af" }}>
              יומנים נמחקים אוטומטית לאחר 30 יום.
            </p>
          </div>
        )}

        {/* ── FIELDS TAB ── */}
        {tab === "fields" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {fieldError && (
              <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#b91c1c", fontSize: "0.85rem" }}>{fieldError}</div>
            )}

            {/* Add new option */}
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>➕ הוסף ערך חדש</h3>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={newFieldType}
                  onChange={e => setNewFieldType(e.target.value as "category" | "platform" | "urgency")}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.88rem", background: "#f9fafb" }}
                >
                  <option value="category">קטגוריה</option>
                  <option value="platform">פלטפורמה</option>
                  <option value="urgency">דחיפות</option>
                </select>
                <input
                  value={newFieldValue}
                  onChange={e => setNewFieldValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addFieldOption() }}
                  placeholder="שם הערך החדש..."
                  style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.88rem" }}
                />
                <button
                  onClick={addFieldOption}
                  disabled={fieldSaving || !newFieldValue.trim()}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: fieldSaving || !newFieldValue.trim() ? "#e5e7eb" : "#16181D", color: fieldSaving || !newFieldValue.trim() ? "#9ca3af" : "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: fieldSaving || !newFieldValue.trim() ? "not-allowed" : "pointer" }}
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
            ] as const).map(({ key, label }) => (
              <div key={key} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>{label}</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(fieldRecords[key] ?? []).map(({ id, label: lbl }) => {
                    const isProtected = key === "urgency"
                    return (
                      <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "#f3f4f6", fontSize: "0.85rem", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>
                        {lbl}
                        {!isProtected && (
                          <button
                            onClick={() => removeFieldOption(id)}
                            title="מחק"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1, padding: 0 }}
                          >✕</button>
                        )}
                        {isProtected && (
                          <span title="ערך מערכת — לא ניתן למחיקה" style={{ color: "#d1d5db", fontSize: "0.75rem" }}>🔒</span>
                        )}
                      </span>
                    )
                  })}
                  {(fieldRecords[key] ?? []).length === 0 && (
                    <span style={{ fontSize: "0.82rem", color: "#9ca3af" }}>אין ערכים — הוסף אחד למעלה</span>
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
          const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.85rem", boxSizing: "border-box", width: "100%" }
          const thStyle: React.CSSProperties = { padding: "8px", textAlign: "right", fontSize: "0.72rem", color: "#6b7280", fontWeight: 700, whiteSpace: "nowrap" }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Category manager */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>🏷️ קטגוריות רישוי</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {licCatRecords.map(c => (
                    <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "#f3f4f6", fontSize: "0.85rem", fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb" }}>
                      {c.label}
                      <button onClick={() => removeLicCategory(c.id)} title="מחק קטגוריה" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1, padding: 0 }}>✕</button>
                    </span>
                  ))}
                  <input
                    value={newLicCat}
                    onChange={e => setNewLicCat(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addLicCategory() }}
                    placeholder="קטגוריה חדשה..."
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.85rem", width: 150 }}
                  />
                  <button
                    onClick={addLicCategory}
                    disabled={!newLicCat.trim()}
                    style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: newLicCat.trim() ? "#16181D" : "#e5e7eb", color: newLicCat.trim() ? "#fff" : "#9ca3af", fontWeight: 700, fontSize: "0.82rem", cursor: newLicCat.trim() ? "pointer" : "not-allowed" }}
                  >הוסף</button>
                </div>
              </div>

              {/* Add licenses */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>➕ הוספת רישיונות</h3>
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
                    style={{ ...inputStyle, background: "#f9fafb" }}
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
                    style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: licSaving || !licForm.keys.trim() ? "#e5e7eb" : "linear-gradient(135deg, #16181D, #16181D)", color: licSaving || !licForm.keys.trim() ? "#9ca3af" : "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: licSaving || !licForm.keys.trim() ? "not-allowed" : "pointer" }}
                  >
                    {licSaving ? "שומר..." : "הוסף רישיונות"}
                  </button>
                  {licMsg && (
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: licMsg.kind === "ok" ? "#166534" : "#b91c1c" }}>{licMsg.text}</span>
                  )}
                </div>
              </div>

              {/* License list */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "#374151", flexShrink: 0 }}>🔑 רישיונות ({filteredLicenses.length})</h3>
                  <select
                    value={licFilter}
                    onChange={e => setLicFilter(e.target.value)}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", background: "#f9fafb" }}
                  >
                    <option value="">כל הקטגוריות</option>
                    {licCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input
                    value={licSearch}
                    onChange={e => setLicSearch(e.target.value)}
                    placeholder="חיפוש לפי מפתח, משתמש, הערה..."
                    style={{ flex: 1, minWidth: 160, padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem" }}
                  />
                </div>

                {licMsg?.kind === "err" && (
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: "0.8rem", color: "#b91c1c" }}>{licMsg.text}</div>
                )}
                {licLoading && <div style={{ fontSize: "0.85rem", color: "#9ca3af" }}>טוען...</div>}
                {!licLoading && filteredLicenses.length === 0 && (
                  <div style={{ fontSize: "0.85rem", color: "#9ca3af" }}>אין רישיונות — הוסיפו למעלה</div>
                )}

                {!licLoading && filteredLicenses.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
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
                          <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6", background: "#fffbeb" }}>
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
                              <button onClick={saveLicEdit} disabled={licEditSaving} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#16181D", color: "#fff", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginLeft: 6 }}>
                                {licEditSaving ? "שומר..." : "שמור"}
                              </button>
                              <button onClick={() => setEditingLic(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>ביטול</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.8rem", color: "#111827", direction: "ltr", display: "inline-block" }}>{l.key}</span>
                              <button
                                onClick={() => { navigator.clipboard.writeText(l.key); setCopiedLicId(l.id); setTimeout(() => setCopiedLicId(null), 1500) }}
                                title="העתק מפתח"
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", marginRight: 6, padding: 2, color: copiedLicId === l.id ? "#16a34a" : "#9ca3af", fontWeight: 700 }}
                              >
                                {copiedLicId === l.id ? "✓" : "📋"}
                              </button>
                            </td>
                            <td style={{ padding: "9px 8px" }}>
                              <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: "#EDEFEA", color: "#16181D" }}>{l.category}</span>
                            </td>
                            <td style={{ padding: "9px 8px", color: "#374151" }}>{l.username || "—"}</td>
                            <td style={{ padding: "9px 8px" }}>
                              {l.password ? (
                                <span
                                  onClick={() => setShowPw(p => ({ ...p, [l.id]: !p[l.id] }))}
                                  title={showPw[l.id] ? "הסתר" : "הצג"}
                                  style={{ cursor: "pointer", fontFamily: "monospace", fontSize: "0.8rem", color: showPw[l.id] ? "#111827" : "#9ca3af", direction: "ltr", display: "inline-block" }}
                                >
                                  {showPw[l.id] ? l.password : "••••••"}
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "9px 8px", color: "#6b7280", fontSize: "0.8rem", maxWidth: 220 }}>{l.remark || "—"}</td>
                            <td style={{ padding: "9px 8px", color: "#9ca3af", fontSize: "0.75rem", whiteSpace: "nowrap" }}>{new Date(l.createdAt).toLocaleDateString("he-IL")}</td>
                            <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                              <button onClick={() => { setEditingLic({ ...l }); setLicDeleteConfirm(null) }} title="עריכה" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", marginLeft: 4 }}>✏️</button>
                              {licDeleteConfirm === l.id ? (
                                <>
                                  <button onClick={() => deleteLicense(l.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: "0.75rem", cursor: "pointer", marginLeft: 4 }}>בטוח?</button>
                                  <button onClick={() => setLicDeleteConfirm(null)} style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>ביטול</button>
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
          const inputStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.85rem", boxSizing: "border-box", width: "100%" }
          const thStyle: React.CSSProperties = { padding: "8px", textAlign: "right", fontSize: "0.72rem", color: "#6b7280", fontWeight: 700, whiteSpace: "nowrap" }
          const tdStyle: React.CSSProperties = { padding: "9px 8px", color: "#374151", whiteSpace: "nowrap" }
          const fmtBytes = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

          const tonerBar = (level: number | null | undefined) => {
            if (level == null) return <span style={{ color: "#9ca3af", fontSize: "0.78rem" }}>—</span>
            const pct = Math.max(0, Math.min(100, level))
            const color = pct > 50 ? "#16a34a" : pct > 20 ? "#d97706" : "#dc2626"
            return (
              <div style={{ position: "relative", minWidth: 90, height: 18, borderRadius: 4, background: "#e5e7eb", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.3s" }} />
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: pct > 30 ? "#fff" : color, lineHeight: 1 }}>{pct}%</span>
              </div>
            )
          }

          // Driver chips (download links) + manage controls (upload / delete)
          const driversCell = (p: Printer) => (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {p.drivers.map(d => (
                <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "#EDEFEA", border: "1px solid #e0e7ff", fontSize: "0.75rem", fontWeight: 600 }}>
                  <a href={`/api/admin/printers/drivers/${d.id}`} title={`${d.filename} · ${fmtBytes(d.size)}`} style={{ color: "#16181D", textDecoration: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ⬇ {d.filename}
                  </a>
                  {manage && (
                    <button onClick={() => deleteDriver(d.id)} title="מחק דרייבר" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "0.85rem", lineHeight: 1, padding: 0 }}>✕</button>
                  )}
                </span>
              ))}
              {p.drivers.length === 0 && !manage && null}
              {manage && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: driverUploadingId === p.id ? "#e5e7eb" : "#f0fdf4", border: "1px solid #bbf7d0", color: driverUploadingId === p.id ? "#9ca3af" : "#15803d", fontSize: "0.75rem", fontWeight: 700, cursor: driverUploadingId === p.id ? "default" : "pointer" }}>
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
                <div style={{ display: "flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  {([{ label: "👁 צפייה", val: "view" }, { label: "⚙ ניהול", val: "manage" }] as const).map(opt => (
                    <button key={opt.val} onClick={() => { setPrinterMode(opt.val); setEditingPrinter(null); setPrinterDeleteConfirm(null) }}
                      style={{ padding: "8px 18px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem",
                        background: printerMode === opt.val ? "#16181D" : "transparent",
                        color:      printerMode === opt.val ? "#fff"    : "#6b7280" }}
                    >{opt.label}</button>
                  ))}
                </div>
                <input
                  value={printerSearch}
                  onChange={e => setPrinterSearch(e.target.value)}
                  placeholder="חיפוש לפי שם, יצרן, ספק, IP..."
                  style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.85rem", background: "#fff" }}
                />
                <button onClick={loadPrinters} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#16181D", background: "#EDEFEA", border: "none", cursor: "pointer", padding: "8px 14px", borderRadius: 8, fontWeight: 600 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#16181D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  רענן
                </button>
                <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{filtered.length} מדפסות</span>
              </div>

              {printerMsg && (
                <div style={{ padding: "8px 14px", borderRadius: 10, fontSize: "0.83rem", fontWeight: 600,
                  background: printerMsg.kind === "ok" ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${printerMsg.kind === "ok" ? "#bbf7d0" : "#fecaca"}`,
                  color: printerMsg.kind === "ok" ? "#166534" : "#b91c1c" }}>
                  {printerMsg.text}
                </div>
              )}

              {/* Add printer — manage mode only */}
              {manage && (
                <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
                  {/* Datalists for autocomplete */}
                  <datalist id="dl-maker">{[...new Set(printers.map(p => p.maker).filter(Boolean))].map(v => <option key={v!} value={v!} />)}</datalist>
                  <datalist id="dl-model">{[...new Set(printers.map(p => p.model).filter(Boolean))].map(v => <option key={v!} value={v!} />)}</datalist>

                  <h3 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: "#374151" }}>➕ הוספת מדפסת</h3>
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
                    style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: printerSaving || !printerForm.name.trim() ? "#e5e7eb" : "linear-gradient(135deg, #16181D, #16181D)", color: printerSaving || !printerForm.name.trim() ? "#9ca3af" : "#fff", fontWeight: 700, fontSize: "0.85rem", cursor: printerSaving || !printerForm.name.trim() ? "not-allowed" : "pointer" }}
                  >
                    {printerSaving ? "שומר..." : "הוסף מדפסת"}
                  </button>
                  <p style={{ margin: "10px 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>דרייברים נוספים לאחר יצירת המדפסת — דרך כפתור &quot;➕ דרייבר&quot; בשורת המדפסת.</p>
                </div>
              )}

              {/* Printer list */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", padding: 20 }}>
                {printersLoading && <div style={{ fontSize: "0.85rem", color: "#9ca3af" }}>טוען...</div>}
                {!printersLoading && filtered.length === 0 && (
                  <div style={{ fontSize: "0.85rem", color: "#9ca3af" }}>
                    {printers.length === 0 ? "אין מדפסות עדיין — עברו למצב ניהול כדי להוסיף." : "לא נמצאו מדפסות התואמות לחיפוש."}
                  </div>
                )}
                {!printersLoading && filtered.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
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
                          <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6", background: "#fffbeb" }}>
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
                              <button onClick={savePrinterEdit} disabled={printerEditSaving} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#16181D", color: "#fff", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginLeft: 6 }}>
                                {printerEditSaving ? "שומר..." : "שמור"}
                              </button>
                              <button onClick={() => setEditingPrinter(null)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>ביטול</button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: "#111827" }}>{p.name}</td>
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
                                    <button onClick={() => deletePrinter(p.id)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: "0.75rem", cursor: "pointer", marginLeft: 4 }}>בטוח?</button>
                                    <button onClick={() => setPrinterDeleteConfirm(null)} style={{ padding: "4px 8px", borderRadius: 8, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>ביטול</button>
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
        {tab === "tickets" && <>

        {/* Stats row */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: isMobile ? "8px" : "10px" }}>
            {[
              { label: "בתור (פתוח)", count: openTickets.length,                                         color: T.dark,    bg: T.codeBg,    filterKey: "queue" },
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
                  style={{ backgroundColor: isActive ? bg : "#fff", borderRadius: "12px", padding: "10px 11px", boxShadow: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", border: isActive ? `2px solid ${color}` : `1px solid ${T.border}`, cursor: "pointer", textAlign: "right", width: "100%" }}
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
            placeholder="חיפוש לפי נושא, שם, קטגוריה..."
            style={{ flex: 1, minWidth: 200, padding: "8px 13px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.85rem", background: "#fff" }}
          />
          {/* Open / All toggle */}
          <div style={{ display: "flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {[{ label: "פתוחות", val: false }, { label: "הכל", val: true }].map(opt => (
              <button key={String(opt.val)} onClick={() => setShowAll(opt.val)}
                style={{ padding: "7px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem",
                  background: showAll === opt.val ? "#16181D" : "transparent",
                  color:      showAll === opt.val ? "#fff"    : "#6b7280",
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
                  background: sortKey === col.key ? "#EDEFEA" : "#f3f4f6",
                  color:      sortKey === col.key ? "#16181D" : "#9ca3af" }}
              >
                {col.label}
                <span style={{ fontSize: "0.6rem" }}>
                  {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                </span>
              </button>
            ))}
          </div>
          <button onClick={loadTickets}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#16181D", background: "#EDEFEA", border: "none", cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontWeight: 600 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114.93-2M20 15a8 8 0 01-14.93 2" stroke="#16181D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            רענן
          </button>
          <span style={{ fontSize: "0.78rem", color: "#9ca3af" }}>{displayTickets.length} פניות</span>
        </div>

        {/* Active stat filter indicator */}
        {statFilter && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#EDEFEA", border: "1px solid #c4b5fd", borderRadius: 10, fontSize: "0.82rem", color: "#16181D" }}>
            <span>מסנן: {statFilter === "queue" ? "בתור (פתוח)" : statFilter === "urgent" ? "דחוף" : statFilter === "high" ? "גבוה" : statFilter === "inprog" ? "בטיפול" : "סגורות"}</span>
            <button onClick={() => setStatFilter(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#16181D", fontWeight: 700, fontSize: "0.82rem", padding: 0 }}>— לחץ לביטול ✕</button>
          </div>
        )}

        {/* Title */}
        <div>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1f2937" }}>
            {showAll ? "כל הפניות" : "תור פניות פתוחות"}
          </h2>
          {!loading && !sortKey && (
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#9ca3af" }}>
              {showAll ? "ממוין לפי תאריך עדכון אחרון" : "ממוין לפי דחיפות, אחר כך לפי זמן פתיחה"}
            </p>
          )}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid #e5e7eb", borderTopColor: "#16181D", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>טוען...</p>
          </div>
        ) : displayTickets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 24px", backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #f3f4f6", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>{openTickets.length === 0 && !showAll ? "✓" : "🔍"}</div>
            <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#374151" }}>{openTickets.length === 0 && !showAll ? "כל הפניות טופלו!" : "לא נמצאו פניות"}</p>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#9ca3af" }}>{openTickets.length === 0 && !showAll ? "אין פניות פתוחות כרגע" : "נסו לשנות את החיפוש או הסינון"}</p>
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
                  backgroundColor: isOnHold ? "#f9fafb" : isStale ? "#fff8f2" : "#fff",
                  borderRadius: "12px",
                  border: isStale ? "1px solid #fed7aa" : isOnHold ? "1px solid #e5e7eb" : "1px solid #f3f4f6",
                  borderRight: `4px solid ${isStale ? "#f97316" : isClosed ? "#d1d5db" : isOnHold ? "#9ca3af" : (URGENCY_BORDER[ticket.urgency] ?? "#e5e7eb")}`,
                  boxShadow: hoverId === ticket.id ? "0 4px 16px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)",
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
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#16181D", background: "#eff6ff", borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>HDTC-{ticket.ticketNumber}</span>
                        <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transition: "transform 0.2s", transform: expanded === ticket.id ? "rotate(-90deg)" : "rotate(0)" }}>
                        <path d="M6 9l6 6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ ...badge, ...(URGENCY_STYLES[ticket.urgency] ?? {}), padding: "2px 8px" }}>{ticket.urgency}</span>
                      <span style={{ ...badge, ...(STATUS_STYLES[ticket.status] ?? {}), padding: "2px 8px" }}>{ticket.status}</span>
                      <span style={{ fontSize: "0.68rem", color: isStale ? "#c2410c" : "#9ca3af", fontWeight: isStale ? 700 : 400 }}>
                        {new Date(ticket.createdAt).toLocaleDateString("he-IL")} · {formatWorkdays(wdOpen)}
                      </span>
                      {isStale && (
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#c2410c", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 6, padding: "1px 5px" }}>⏰ מוזנח</span>
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
                    backgroundColor: i === 0 && !showAll && !sortKey ? "#fef3c7" : "#f3f4f6",
                    color: i === 0 && !showAll && !sortKey ? "#92400e" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 800, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  {/* Subject + user info */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#16181D", background: "#eff6ff", borderRadius: 6, padding: "1px 7px", letterSpacing: "0.03em", flexShrink: 0 }}>
                        HDTC-{ticket.ticketNumber}
                      </span>
                      <span style={{ fontWeight: 600, color: "#111827", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticket.subject}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" }}>
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
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: ticket.assignedTo === session?.user?.email ? "#16181D" : "#64748b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 700 }}>
                      {staffDisplay(ticket.assignedTo).slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" }}>{staffDisplay(ticket.assignedTo)}</span>
                  </div>

                  {/* Time + workdays */}
                  <div style={{ fontSize: "0.72rem", color: isStale ? "#c2410c" : "#9ca3af", textAlign: "left", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                    <div>{new Date(ticket.createdAt).toLocaleDateString("he-IL")}</div>
                    <div style={{ color: isStale ? "#c2410c" : isClosed ? "#16a34a" : "#6b7280", fontWeight: 600 }}>
                      {isStale ? "⏰ " : ""}{isClosed ? `נסגר ${formatWorkdays(wdOpen)}` : formatWorkdays(wdOpen)}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35, flexShrink: 0, transition: "transform 0.2s", transform: expanded === ticket.id ? "rotate(-90deg)" : "rotate(0)" }}>
                    <path d="M6 9l6 6 6-6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                )}

                {/* Expanded panel */}
                {expanded === ticket.id && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: "16px 20px", backgroundColor: "#fafbfc" }}>
                    {editingTicketId === ticket.id ? (
                      /* ── Edit mode ── */
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>נושא</div>
                            <input value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>טלפון</div>
                            <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>שם מחשב</div>
                          <input value={editForm.computerName} onChange={e => setEditForm(f => ({ ...f, computerName: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>תיאור</div>
                          <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={4}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                          {([
                            { label: "דחיפות", key: "urgency",  opts: fieldUrgencies },
                            { label: "סטטוס",  key: "status",   opts: ["פתוח", "בטיפול", "בהמתנה", "סגור"] },
                            { label: "קטגוריה", key: "category", opts: fieldCategories },
                            { label: "פלטפורמה", key: "platform", opts: fieldPlatforms },
                          ]).map(({ label, key, opts }) => (
                            <div key={key}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>{label}</div>
                              <select value={editForm[key as keyof typeof editForm]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", background: "#fff" }}>
                                {opts.map(o => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                        {editForm.status === "בהמתנה" && (
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>סיבת ההמתנה</div>
                            <input value={editForm.holdReason} onChange={e => setEditForm(f => ({ ...f, holdReason: e.target.value }))}
                              placeholder="למשל: ממתין לחלק חלף, ממתין לאישור ספק..."
                              style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", boxSizing: "border-box" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={e => { e.stopPropagation(); saveEdit() }} disabled={editSaving}
                            style={{ background: "linear-gradient(135deg,#16181D,#16181D)", color: "#fff", fontWeight: 700, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem", opacity: editSaving ? 0.6 : 1 }}>
                            {editSaving ? "שומר..." : "שמור"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); setEditingTicketId(null) }}
                            style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600, padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.85rem" }}>
                            ביטול
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <>
                        {/* Assignment row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", flexShrink: 0 }}>👤 מוקצה ל:</span>
                          <select
                            value={ticket.assignedTo}
                            disabled={assigning === ticket.id}
                            onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); assignTicket(ticket.id, e.target.value) }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", background: "#fff", fontWeight: 600, color: "#16181D", cursor: "pointer", opacity: assigning === ticket.id ? 0.5 : 1 }}
                          >
                            {staffMembers.map(m => (
                              <option key={m.email} value={m.email}>{m.display}</option>
                            ))}
                          </select>
                          {ticket.assignedTo !== session?.user?.email && (
                            <button
                              onClick={e => { e.stopPropagation(); assignTicket(ticket.id, session?.user?.email ?? "") }}
                              disabled={assigning === ticket.id || !session?.user?.email}
                              style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "#16181D", color: "#fff", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", opacity: assigning === ticket.id ? 0.5 : 1 }}
                            >
                              הקצה לעצמי
                            </button>
                          )}
                          {assigning === ticket.id && <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>שומר...</span>}
                        </div>

                        <p style={{ margin: "0 0 16px", fontSize: "0.875rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{ticket.description}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: holdForId === ticket.id ? 6 : 14 }}>
                          <span style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600 }}>שנה סטטוס:</span>
                          {["פתוח", "בטיפול", "בהמתנה", "סגור"].map(s => (
                            <button key={s} disabled={updating === ticket.id || ticket.status === s}
                              onClick={e => { e.stopPropagation(); updateStatus(ticket.id, s) }}
                              style={{ padding: "5px 14px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: ticket.status === s || updating === ticket.id ? "default" : "pointer", opacity: updating === ticket.id ? 0.5 : 1, ...(ticket.status === s ? STATUS_STYLES[s] : { backgroundColor: "#f3f4f6", color: "#374151" }) }}>
                              {s}
                            </button>
                          ))}
                          <button
                            style={{ padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer", background: "#EDEFEA", color: "#16181D" }}
                            onClick={e => { e.stopPropagation(); setEditingTicketId(ticket.id); setEditForm({ subject: ticket.subject, description: ticket.description, phone: ticket.phone, computerName: ticket.computerName, urgency: ticket.urgency, category: ticket.category, platform: ticket.platform, status: ticket.status, holdReason: ticket.holdReason ?? "" }) }}>
                            ✏️ עריכה
                          </button>
                          <a href={`/tickets/HDTC-${ticket.ticketNumber}`} onClick={e => e.stopPropagation()}
                            style={{ marginRight: "auto", padding: "5px 14px", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600, textDecoration: "none", background: "#f0fdf4", color: "#15803d" }}>
                            🔍 פתח פנייה מלאה
                          </a>
                        </div>

                        {/* ── Hold reason input (shown after clicking "בהמתנה") ── */}
                        {holdForId === ticket.id && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, padding: "10px 12px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4b5563", marginBottom: 4 }}>סיבת ההמתנה (אופציונלי)</div>
                              <input
                                autoFocus
                                value={holdInput}
                                onChange={e => setHoldInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmHold(ticket.id) } if (e.key === "Escape") setHoldForId(null) }}
                                placeholder="למשל: ממתין לחלק חלף, ממתין לאישור ספק..."
                                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", boxSizing: "border-box" }}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 22 }}>
                              <button onClick={e => { e.stopPropagation(); confirmHold(ticket.id) }}
                                style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#4b5563", color: "#fff", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
                                אשר
                              </button>
                              <button onClick={e => { e.stopPropagation(); setHoldForId(null) }}
                                style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#f3f4f6", color: "#374151", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}>
                                ביטול
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ── Current hold reason (shown when ticket is on hold) ── */}
                        {ticket.status === "בהמתנה" && ticket.holdReason && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, padding: "10px 14px", background: "#f3f4f6", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                            <span style={{ fontSize: "0.9rem" }}>⏸</span>
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", marginBottom: 2 }}>סיבת ההמתנה</div>
                              <div style={{ fontSize: "0.83rem", color: "#374151" }}>{ticket.holdReason}</div>
                            </div>
                          </div>
                        )}

                        {/* ── Conversation with user ── */}
                        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14, marginBottom: 14 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 10 }}>💬 שיחה עם המגיש</div>
                          {(expandedMessages[ticket.id] ?? []).length === 0
                            ? <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginBottom: 10 }}>אין הודעות עדיין</div>
                            : (expandedMessages[ticket.id] ?? []).map((msg: TicketMessage) => (
                                <div key={msg.id} style={{ display: "flex", gap: 8, marginBottom: 10, flexDirection: msg.authorRole === "staff" ? "row-reverse" : "row", alignItems: "flex-start" }}>
                                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: msg.authorRole === "staff" ? "#16181D" : "#0891b2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0 }}>
                                    {msg.authorName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                                  </div>
                                  <div style={{ maxWidth: "70%" }}>
                                    <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginBottom: 2, textAlign: msg.authorRole === "staff" ? "left" : "right" }}>
                                      {msg.authorName} · {new Date(msg.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                                    </div>
                                    <div style={{ background: msg.authorRole === "staff" ? "#EDEFEA" : "#f0f9ff", borderRadius: 8, padding: "7px 11px", fontSize: "0.82rem", color: "#1f2937", whiteSpace: "pre-wrap" }}>{msg.content}</div>
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
                              style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", resize: "none", boxSizing: "border-box" }}
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
                              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? "#e5e7eb" : "#16181D", color: replySaving === ticket.id || !(replyText[ticket.id] ?? "").trim() ? "#9ca3af" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
                            >
                              {replySaving === ticket.id ? "..." : "שלח"}
                            </button>
                          </div>
                        </div>

                        {/* ── Notes ── */}
                        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: 10 }}>📝 הערות טכנאי</div>
                          {(expandedNotes[ticket.id] ?? []).length === 0
                            ? <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginBottom: 10 }}>אין הערות עדיין</div>
                            : (expandedNotes[ticket.id] ?? []).map((note: TicketNote) => (
                                <div key={note.id} style={{ borderRight: "3px solid #6366f1", paddingRight: 10, marginBottom: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#16181D" }}>{note.authorName}</span>
                                    <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>{new Date(note.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
                                  </div>
                                  <div style={{ fontSize: "0.82rem", color: "#374151", whiteSpace: "pre-wrap" }}>{note.content}</div>
                                </div>
                              ))
                          }
                          <textarea
                            rows={2}
                            placeholder="הוסף הערה... לחצו על שם למטה להזכרת איש צוות"
                            value={noteText[ticket.id] ?? ""}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setNoteText(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.82rem", resize: "none", boxSizing: "border-box", marginBottom: 4 }}
                          />
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: "0.68rem", color: "#9ca3af", alignSelf: "center" }}>הזכר:</span>
                            {staffMembers.map(m => (
                              <button key={m.handle} type="button"
                                onClick={e => { e.stopPropagation(); setNoteText(prev => { const cur = prev[ticket.id] ?? ""; return { ...prev, [ticket.id]: cur ? `${cur} @${m.handle}` : `@${m.handle}` } }) }}
                                style={{ padding: "1px 8px", borderRadius: 20, border: "1px solid #e0e7ff", background: "#EDEFEA", color: "#16181D", fontSize: "0.68rem", fontWeight: 600, cursor: "pointer" }}
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
                            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length) ? "#e5e7eb" : "#16181D", color: noteSaving === ticket.id || (!(noteText[ticket.id] ?? "").trim() && !(noteImages[ticket.id] ?? []).length) ? "#9ca3af" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}
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
