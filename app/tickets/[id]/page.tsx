"use client"
import { useSession } from "next-auth/react"
import { useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { STAFF_EMAILS, ASSIGNABLE_FALLBACK } from "@/lib/staffEmails"
import ImageAttachments, { PendingImage } from "@/components/ImageAttachments"
import type { TicketDetail, TicketNote, TicketMessage, TicketHistoryEntry } from "@/types/ticket"
import { workdaysBetween, formatWorkdays } from "@/lib/workdays"
import { closeTicket as apiCloseTicket, updateTicket } from "@/lib/ticketApi"
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS, DEFAULT_URGENCIES, fetchFieldOptions } from "@/lib/fieldOptions"
import { handleImagePaste } from "@/lib/pasteImage"
import EquipmentPicker from "@/components/EquipmentPicker"
import { DEFAULT_EQUIPMENT, NEW_EMPLOYEE_CATEGORY, equipmentProgress, outstandingOf } from "@/lib/equipment"
import { NEW_EMPLOYEE_FIELDS, parseNewEmployeeBlock, stripNewEmployeeBlock } from "@/lib/newEmployee"
import { isOffboarding, offboardingBlockers, blockerMessage } from "@/lib/offboarding"
import type { TicketEquipment } from "@/types/ticket"
import { ticketRevision } from "@/lib/ticketRevision"
import { T, HDR, STATUS, URGENCY } from "@/lib/theme"
import { useIsMobile } from "@/lib/useIsMobile"
import Logo from "@/components/Logo"

/** How often (ms) the open ticket page polls the server for changes. */
const POLL_INTERVAL_MS = 10_000

const URGENCY_STYLE: Record<string, React.CSSProperties> = Object.fromEntries(
  Object.entries(URGENCY).map(([k, v]) => [k, { background: v.bg, color: v.fg }])
)
const STATUS_STYLE: Record<string, React.CSSProperties> = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, { background: v.bg, color: v.fg }])
)

const STATUSES  = ["פתוח", "בטיפול", "בהמתנה", "סגור"]

function formatDate(s: string) {
  return new Date(s).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
}

export default function TicketDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const isMobile = useIsMobile()

  const [ticket, setTicket]       = useState<TicketDetail | null>(null)
  const [history, setHistory]     = useState<TicketHistoryEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [isStaff, setIsStaff]     = useState(false)
  const [editing, setEditing]     = useState(false)
  const [editForm, setEditForm]   = useState({ subject: "", description: "", phone: "", computerName: "", urgency: "", category: "", platform: "", status: "", ownerEmail: "" })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError]   = useState("")
  /** Every registered user, for the מגיש picker. Admin-only (GET /api/users). */
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([])
  /**
   * Email awaiting confirmation in the "move this ticket" dialog. The picker
   * never writes straight into editForm — a mis-click on a native select is one
   * keystroke, and this is the field that decides whose dashboard the ticket
   * lives on. Null when no dialog is open.
   */
  const [ownerConfirm, setOwnerConfirm] = useState<string | null>(null)
  const [noteText, setNoteText]     = useState("")
  const [noteImages, setNoteImages] = useState<PendingImage[]>([])
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError]   = useState("")
  const [msgText, setMsgText]       = useState("")
  const [msgSaving, setMsgSaving]   = useState(false)
  const [replyTo, setReplyTo]       = useState<{ email: string; name: string; msgId: string } | null>(null)
  const [assigning, setAssigning]   = useState(false)
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null)
  const [closing, setClosing]       = useState(false)
  const [copied, setCopied]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [urgencies,  setUrgencies]  = useState<string[]>(DEFAULT_URGENCIES)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [platforms,  setPlatforms]  = useState<string[]>(DEFAULT_PLATFORMS)
  const [staffMembers, setStaffMembers] = useState<{ email: string; handle: string; display: string }[]>(ASSIGNABLE_FALLBACK)
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>(DEFAULT_EQUIPMENT)
  /** Line id currently being written to — disables its controls mid-request. */
  const [equipSaving, setEquipSaving] = useState<string | null>(null)
  /** Staff "add missing item" panel: open state + pending selection. */
  const [equipAdding, setEquipAdding] = useState(false)
  const [equipDraft, setEquipDraft]   = useState<Record<string, number>>({})

  useEffect(() => {
    fetchFieldOptions().then(opts => {
      setUrgencies(opts.urgency)
      setCategories(opts.category)
      setPlatforms(opts.platform)
      setEquipmentOptions(opts.equipment)
    })
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (status === "authenticated") {
      const staff = !!(session?.user?.isAdmin || STAFF_EMAILS.includes(session?.user?.email ?? ""))
      setIsStaff(staff)
      // Staff get the full roster (hardcoded staff + DB admins) for assignment + @mentions
      if (staff) {
        fetch("/api/staff")
          .then(r => r.ok ? r.json() : null)
          .then(list => { if (Array.isArray(list) && list.length) setStaffMembers(list) })
          .catch(() => {})
      }
    }
  }, [status, session])

  /** Guards the one-shot roster fetch below against React's effect re-runs. */
  const rosterFetched = useRef(false)

  // The מגיש picker offers every registered user, not just staff — the whole
  // point is to move a ticket onto the right person. It is fetched on the first
  // edit rather than on load: the roster is only reachable from inside the edit
  // form, and most visits to a ticket never open it. /api/users is admin-only,
  // which is also exactly who may send ownerEmail.
  useEffect(() => {
    if (!editing || !session?.user?.isAdmin || rosterFetched.current) return
    rosterFetched.current = true
    fetch("/api/users")
      .then(r => r.ok ? r.json() : null)
      .then(list => { if (Array.isArray(list)) setUsers(list) })
      .catch(() => {})
  }, [editing, session])

  // Tracks the signature of the currently-displayed ticket so background polls
  // can skip re-rendering when nothing changed (see lib/ticketRevision.ts).
  const revisionRef = useRef<string>("")

  /** The edit form's fields as they read straight off a ticket payload. */
  const editFormFrom = (t: TicketDetail) => ({
    subject: t.subject, description: t.description,
    phone: t.phone, computerName: t.computerName,
    urgency: t.urgency, category: t.category,
    platform: t.platform, status: t.status,
    ownerEmail: t.user?.email ?? "",
  })

  // Applies a freshly-fetched ticket payload to component state.
  // `syncEditForm` is false during background polling while the user is editing,
  // so an incoming update never clobbers their in-progress edits.
  const applyTicketData = (data: TicketDetail, syncEditForm: boolean) => {
    setTicket(data)
    // history is included in the ticket payload; synthesize "created" entry for pre-v3.08 tickets
    const rawHistory: TicketHistoryEntry[] = data.history ?? []
    const synthetic: TicketHistoryEntry[] = rawHistory.some(e => e.field === "created") ? [] : [{
      id: "synthetic-created",
      ticketId: data.id,
      field: "created",
      oldValue: null,
      newValue: "פתוח",
      actorName: data.user?.name ?? data.user?.email ?? "משתמש",
      actorEmail: data.user?.email ?? "",
      changedAt: data.createdAt,
    }]
    setHistory([...synthetic, ...rawHistory])
    if (syncEditForm) setEditForm(editFormFrom(data))
    revisionRef.current = ticketRevision(data)
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tickets/${id}`)
      if (!res.ok) { router.push("/dashboard"); return }
      const data: TicketDetail = await res.json()
      applyTicketData(data, true)
    } finally {
      setLoading(false)
    }
  }

  // Silent background refresh: no full-screen loader, no redirect on transient
  // errors. Skips while a local mutation is in flight or while editing, and
  // only touches state when the server payload actually differs from what's
  // shown. Kept in a ref so the polling effect doesn't resubscribe each render.
  const refresh = async () => {
    if (editing || editSaving || noteSaving || msgSaving || assigning || closing || deletingMsgId) return
    try {
      // Send the current revision so the server can answer with a tiny
      // { unchanged: true } instead of the full payload (which includes all
      // base64 attachments) when nothing changed — the common case.
      const rev = revisionRef.current ? `?rev=${encodeURIComponent(revisionRef.current)}` : ""
      const res = await fetch(`/api/tickets/${id}${rev}`)
      if (!res.ok) return
      const data: TicketDetail & { unchanged?: boolean } = await res.json()
      if (data.unchanged) return
      if (ticketRevision(data) === revisionRef.current) return
      applyTicketData(data, true)
    } catch {
      /* transient network error — try again next tick */
    }
  }
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (status === "authenticated") load()
  }, [status, id])

  // ── Live updates: poll while the tab is visible ──────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return
    let interval: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!interval) interval = setInterval(() => refreshRef.current(), POLL_INTERVAL_MS) }
    const stop  = () => { if (interval) { clearInterval(interval); interval = null } }
    const onVisibility = () => {
      if (document.hidden) { stop() }
      else { refreshRef.current(); start() }   // immediate catch-up on refocus
    }
    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility) }
  }, [status, id])

  const saveEdit = async () => {
    if (!ticket) return
    setEditSaving(true)
    setEditError("")
    try {
      const { ownerEmail, ...fields } = editForm
      // ownerEmail is admin-only on the server, so it travels only when it is
      // actually a move. Sending it unchanged would turn every ordinary staff
      // edit into a 403.
      const moved = ownerEmail !== "" && ownerEmail !== (ticket.user?.email ?? "")
      const ok = await updateTicket(ticket.id, moved ? { ...fields, ownerEmail } : fields)
      if (ok) { setEditing(false); await load() }
      else setEditError("שמירת השינויים נכשלה. נסו שנית.")
    } finally {
      setEditSaving(false)
    }
  }

  /**
   * Discards every in-progress edit, not merely the staged owner move. The
   * form state outlives edit mode, so a cancel that left it dirty handed the
   * next עריכה the values the user had just thrown away — and שמור would then
   * have written them.
   */
  const cancelEdit = () => {
    setEditing(false)
    setEditError("")
    if (ticket) setEditForm(editFormFrom(ticket))
  }

  /** Display name for an email — the roster first, then the ticket's own owner. */
  const userLabel = (email: string) => {
    const u = users.find(x => x.email === email)
    if (u) return u.name || u.email
    if (email && email === ticket?.user?.email) return ticket.user?.name ?? email
    return email || "—"
  }

  const addNote = async () => {
    if ((!noteText.trim() && noteImages.length === 0) || !ticket) return
    setNoteSaving(true)
    setNoteError("")
    try {
      // Upload any pasted/attached images as ticket attachments
      for (const img of noteImages) {
        await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: img.dataUrl, filename: img.filename }),
        })
      }
      // Save note text (if any)
      if (noteText.trim()) {
        const res = await fetch(`/api/tickets/${ticket.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: noteText.trim() }),
        })
        if (!res.ok) { setNoteError("שגיאה בשמירת הערה"); return }
      }
      setNoteText("")
      setNoteImages([])
      await load()
    } finally {
      setNoteSaving(false)
    }
  }

  const sendMessage = async () => {
    if (!msgText.trim() || !ticket) return
    setMsgSaving(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: msgText.trim(),
          replyToEmail: replyTo?.email,
          replyToName:  replyTo?.name,
          replyToMsgId: replyTo?.msgId,
        }),
      })
      if (res.ok) { setMsgText(""); setReplyTo(null); await load() }
    } finally {
      setMsgSaving(false)
    }
  }

  const deleteMessage = async (msgId: string) => {
    if (!ticket) return
    setDeletingMsgId(msgId)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msgId }),
      })
      if (res.ok) await load()
    } finally {
      setDeletingMsgId(null)
    }
  }

  const assignTicket = async (email: string) => {
    if (!ticket) return
    setAssigning(true)
    try {
      await updateTicket(ticket.id, { assignedTo: email })
      await load()
    } finally {
      setAssigning(false)
    }
  }

  /**
   * Admin-only, irreversible: removes the ticket and everything attached to it.
   * Guarded by the confirmation dialog, never wired straight to a button —
   * there is no undo, and the ticket's own history goes with it.
   */
  const deleteTicket = async () => {
    if (!ticket) return
    setDeleting(true)
    setDeleteError("")
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      router.push("/tickets")
    } catch {
      setDeleteError("מחיקת הפנייה נכשלה. נסו שנית.")
      setDeleting(false)
    }
  }

  const closeTicket = async () => {
    if (!ticket) return
    setClosing(true)
    try {
      // Urgency is automatically downgraded to "נמוך" by the server on closure
      const ok = await apiCloseTicket(ticket.id)
      if (ok) await load()
    } finally {
      setClosing(false)
    }
  }

  // Admin-only: assign to self → compound-close (status→סגור, urgency→נמוך)
  const adminCloseTicket = async () => {
    if (!ticket || !session?.user?.email) return
    setClosing(true)
    try {
      await updateTicket(ticket.id, { assignedTo: session.user.email })
      const ok = await apiCloseTicket(ticket.id)
      if (ok) await load()
    } finally {
      setClosing(false)
    }
  }

  const copyLink = () => {
    const url = `${window.location.origin}/tickets/HDTC-${ticket?.ticketNumber}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Equipment checklist (new-employee tickets) ─────────────────────────────
  // Every verb returns the ticket's full line list, so state is replaced from
  // the server response rather than patched locally — no drift when two
  // technicians tick items at the same time.
  const equipmentRequest = async (method: "POST" | "PATCH" | "DELETE", body: object, busyKey: string) => {
    if (!ticket) return
    setEquipSaving(busyKey)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/equipment`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      const lines: TicketEquipment[] = await res.json()
      setTicket(t => (t ? { ...t, equipment: lines } : t))
    } catch { /* transient — the 10s poll will resync */ }
    finally { setEquipSaving(null) }
  }

  /** Tick a whole line off (or un-tick it). */
  const markReceived = (line: TicketEquipment, received: boolean) =>
    equipmentRequest("PATCH", { id: line.id, received }, line.id)

  /** Record a partial delivery. */
  const setReceivedQty = (line: TicketEquipment, receivedQty: number) =>
    equipmentRequest("PATCH", { id: line.id, receivedQty }, line.id)

  const removeEquipment = (line: TicketEquipment) =>
    equipmentRequest("DELETE", { id: line.id }, line.id)

  const addEquipment = async () => {
    const equipment = Object.entries(equipDraft).map(([label, quantity]) => ({ label, quantity }))
    if (equipment.length === 0) { setEquipAdding(false); return }
    await equipmentRequest("POST", { equipment }, "add")
    setEquipDraft({})
    setEquipAdding(false)
  }

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
        <div style={{ color: T.text2, fontSize: "0.95rem" }}>טוען...</div>
      </div>
    )
  }

  if (!ticket) return null

  /** Hire details recovered from the description; null on an ordinary ticket. */
  const newHire = parseNewEmployeeBlock(ticket.description)

  // OFFBOARDING — a leaving-employee ticket does not close while anything on
  // the return checklist is still unticked. The server enforces this (PATCH
  // /api/tickets and the automation endpoint both refuse); disabling the
  // buttons here is so nobody has to discover the rule by hitting it.
  const leaving       = isOffboarding(ticket.category)
  const closeBlockers = leaving ? offboardingBlockers(ticket.equipment ?? []) : []
  const closeBlocked  = closeBlockers.length > 0

  const labelStyle: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: T.inkMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }
  const valueStyle: React.CSSProperties = { fontSize: "0.9rem", color: T.text }
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.88rem", boxSizing: "border-box" }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: T.bg }}>

      {/* Header — dark chrome (matches AppHeader) with page-specific actions.
          MOBILE: wraps to multiple rows instead of overflowing the viewport. */}
      <div style={{ background: HDR.bg, borderBottom: `1px solid ${HDR.border}`, padding: isMobile ? "10px 12px" : "0 24px", minHeight: isMobile ? 0 : 64, display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <button
          onClick={() => { if (window.history.length > 1) { router.back() } else { router.push("/tickets") } }}
          style={{ padding: isMobile ? "6px 10px" : "8px 14px", borderRadius: 9, border: `1px solid ${HDR.pillBorder}`, background: "transparent", cursor: "pointer", fontSize: "0.85rem", color: HDR.link, display: "flex", alignItems: "center", gap: 6, fontWeight: 500, flexShrink: 0 }}
        >
          ← חזרה
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0 }}>
          {!isMobile && <Logo onDark size={28} wordmark={false} subtitle={false} />}
          <h1 style={{ margin: 0, fontSize: isMobile ? "0.9rem" : "1rem", fontWeight: 700, color: HDR.linkStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            HDTC-{ticket.ticketNumber} · {ticket.subject}
          </h1>
        </div>
        {isStaff && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${HDR.pillBorder}`, background: HDR.pillBg, cursor: "pointer", fontSize: "0.85rem", color: HDR.linkStrong, fontWeight: 600 }}
          >
            עריכה
          </button>
        )}
        {session?.user?.isAdmin && ticket.status !== "סגור" && !editing && (
          <button
            onClick={adminCloseTicket}
            disabled={closing || closeBlocked}
            title={closeBlocked ? blockerMessage(closeBlockers) : undefined}
            style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: (closing || closeBlocked) ? HDR.pillBg : T.green, color: (closing || closeBlocked) ? HDR.muted : T.onGreen, fontWeight: 700, fontSize: "0.85rem", cursor: (closing || closeBlocked) ? "not-allowed" : "pointer" }}
          >
            {closing ? "סוגר..." : closeBlocked ? "🔒 סגור פנייה" : "✓ סגור פנייה"}
          </button>
        )}
        <button
          onClick={copyLink}
          style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${HDR.pillBorder}`, background: copied ? HDR.greenPillBg : "transparent", color: copied ? HDR.greenPillFg : HDR.link, fontSize: "0.82rem", cursor: "pointer", fontWeight: 600, transition: "all 0.15s" }}
        >
          {copied ? "✓ הועתק" : "העתק קישור"}
        </button>
        {!isStaff && ticket.status !== "סגור" && ticket.user?.email === session?.user?.email && (
          <button
            onClick={closeTicket}
            disabled={closing || closeBlocked}
            title={closeBlocked ? blockerMessage(closeBlockers) : undefined}
            style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${T.redBorder}`, background: (closing || closeBlocked) ? HDR.pillBg : T.redBg, color: (closing || closeBlocked) ? HDR.muted : T.redFg, fontWeight: 700, fontSize: "0.85rem", cursor: (closing || closeBlocked) ? "not-allowed" : "pointer" }}
          >
            {closing ? "סוגר..." : closeBlocked ? "🔒 סגור פנייה" : "סגור פנייה"}
          </button>
        )}
        {session?.user?.isAdmin && !editing && (
          <button
            onClick={() => { setDeleteError(""); setConfirmDelete(true) }}
            title="מחיקת הפנייה לצמיתות"
            style={{ padding: "5px 11px", borderRadius: 8, border: `1px solid ${T.redBorder}`, background: "transparent", color: T.redFg, fontSize: "0.76rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            🗑 מחק
          </button>
        )}
        {isStaff && editing && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={cancelEdit} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${HDR.pillBorder}`, background: "transparent", cursor: "pointer", fontSize: "0.85rem", color: HDR.link }}>ביטול</button>
            <button onClick={saveEdit} disabled={editSaving} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: T.green, color: T.onGreen, cursor: editSaving ? "not-allowed" : "pointer", fontSize: "0.85rem", fontWeight: 700 }}>
              {editSaving ? "שומר..." : "שמור"}
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation — deliberately a stop, not a toast-with-undo.
          The ticket and its whole audit trail go at once, so the dialog spells
          out what disappears and makes the destructive button the one you have
          to aim at. */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="אישור מחיקת פנייה"
          onClick={() => { if (!deleting) setConfirmDelete(false) }}
          style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24, maxWidth: 420, width: "100%", boxShadow: `0 20px 50px ${T.shadow4}` }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1rem", fontWeight: 800, color: T.redFgDeep }}>
              מחיקת פנייה HDTC-{ticket.ticketNumber}
            </h2>
            <p style={{ margin: "0 0 6px", fontSize: "0.88rem", color: T.ink, lineHeight: 1.7 }}>
              הפנייה <strong>{ticket.subject}</strong> תימחק לצמיתות, יחד עם ההיסטוריה, ההערות, ההודעות, הקבצים המצורפים ובקשות הציוד שלה.
            </p>
            <p style={{ margin: "0 0 18px", fontSize: "0.82rem", color: T.inkFaint }}>
              לא ניתן לשחזר פנייה שנמחקה. לסגירת פנייה שטופלה השתמשו ב&quot;סגור פנייה&quot;.
            </p>

            {deleteError && (
              <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "9px 12px", fontSize: "0.82rem", color: T.redFg, marginBottom: 14 }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
              <button
                onClick={deleteTicket}
                disabled={deleting}
                style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: deleting ? T.line : T.redFg, color: deleting ? T.inkFaint : T.inverseText, fontWeight: 700, fontSize: "0.85rem", cursor: deleting ? "not-allowed" : "pointer" }}
              >
                {deleting ? "מוחק..." : "מחק לצמיתות"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${T.lineStrong}`, background: T.card, color: T.ink, fontWeight: 600, fontSize: "0.85rem", cursor: deleting ? "not-allowed" : "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner-move confirmation. Changing מגיש is not a typo-level edit: the
          ticket leaves one person's dashboard and appears on another's, and
          every later mail about it — status, closure, the service review —
          goes to the new owner. So the pick is staged, named back to the
          admin, and only applied on אישור. Cancelling leaves editForm
          untouched, which is what snaps the select back. */}
      {ownerConfirm !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="אישור העברת פנייה"
          onClick={() => setOwnerConfirm(null)}
          style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24, maxWidth: 420, width: "100%", boxShadow: `0 20px 50px ${T.shadow4}` }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1rem", fontWeight: 800, color: T.text }}>
              העברת פנייה HDTC-{ticket.ticketNumber}
            </h2>
            <p style={{ margin: "0 0 6px", fontSize: "0.88rem", color: T.ink, lineHeight: 1.7 }}>
              המגיש ישונה מ<strong>{userLabel(editForm.ownerEmail)}</strong> ל<strong>{userLabel(ownerConfirm)}</strong>.
            </p>
            <p style={{ margin: "0 0 18px", fontSize: "0.82rem", color: T.inkFaint }}>
              הפנייה תעבור לרשימת הפניות של {userLabel(ownerConfirm)}, והעדכונים עליה — כולל בקשת הדירוג בסגירה — יישלחו אליו. השינוי ייכתב ליומן הפנייה ויישמר בלחיצה על &quot;שמור&quot;.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
              <button
                onClick={() => { setEditForm(f => ({ ...f, ownerEmail: ownerConfirm })); setOwnerConfirm(null) }}
                style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: T.green, color: T.onGreen, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}
              >
                אישור
              </button>
              <button
                onClick={() => setOwnerConfirm(null)}
                style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${T.lineStrong}`, background: T.card, color: T.ink, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Main info card */}
        <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24 }}>

          {/* Subject */}
          <div style={{ marginBottom: 20 }}>
            <span style={labelStyle}>נושא</span>
            {editing
              ? <input style={inputStyle} value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
              : <div style={{ ...valueStyle, fontSize: "1.05rem", fontWeight: 700 }}>{ticket.subject}</div>
            }
          </div>

          {/* Grid: status / urgency / category / platform */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
            <div>
              <span style={labelStyle}>סטטוס</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                : <span style={{ ...STATUS_STYLE[ticket.status], borderRadius: 20, padding: "3px 12px", fontSize: "0.8rem", fontWeight: 600, display: "inline-block" }}>{ticket.status}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>דחיפות</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.urgency} onChange={e => setEditForm(f => ({ ...f, urgency: e.target.value }))}>
                    {urgencies.map(u => <option key={u}>{u}</option>)}
                  </select>
                : <span style={{ ...URGENCY_STYLE[ticket.urgency], borderRadius: 20, padding: "3px 12px", fontSize: "0.8rem", fontWeight: 600, display: "inline-block" }}>{ticket.urgency}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>קטגוריה</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                : <span style={valueStyle}>{ticket.category}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>פלטפורמה</span>
              {editing
                ? <select style={{ ...inputStyle }} value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))}>
                    {platforms.map(p => <option key={p}>{p}</option>)}
                  </select>
                : <span style={valueStyle}>{ticket.platform}</span>
              }
            </div>
          </div>

          {/* A failed save used to be silent — the form simply stayed open. It
              matters more now that one of the fields can be refused on its
              own (a non-admin sending ownerEmail, or an address no longer on
              the roster). */}
          {editError && (
            <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "9px 12px", fontSize: "0.82rem", color: T.redFg, marginBottom: 16 }}>
              {editError}
            </div>
          )}

          {/* Hold reason banner */}
          {ticket.status === "בהמתנה" && ticket.holdReason && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", marginBottom: 16, background: T.fill, borderRadius: 10, border: `1px solid ${T.line}` }}>
              <span style={{ fontSize: "1rem" }}>⏸</span>
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: T.inkMuted, marginBottom: 2 }}>סיבת ההמתנה</div>
                <div style={{ fontSize: "0.85rem", color: T.ink }}>{ticket.holdReason}</div>
              </div>
            </div>
          )}

          {/* Grid: submitter / phone / computer / dates */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <span style={labelStyle}>מגיש</span>
              {editing && session?.user?.isAdmin
                ? <select
                    aria-label="מגיש"
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={editForm.ownerEmail}
                    onChange={e => setOwnerConfirm(e.target.value)}
                  >
                    {/* The current owner is always listed, even if the roster
                        fetch failed or they were since removed — otherwise the
                        select would silently show somebody else as מגיש. */}
                    {!users.some(u => u.email === editForm.ownerEmail) && editForm.ownerEmail !== "" && (
                      <option value={editForm.ownerEmail}>
                        {ticket.user?.name ?? ticket.user?.email}
                      </option>
                    )}
                    {users.map(u => (
                      <option key={u.id} value={u.email}>{u.name || u.email}</option>
                    ))}
                  </select>
                : <span style={valueStyle}>{ticket.user?.name ?? ticket.user?.email ?? "—"}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>טלפון</span>
              {editing
                ? <input style={inputStyle} value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                : <span style={valueStyle}>{ticket.phone || "—"}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>שם מחשב</span>
              {editing
                ? <input style={inputStyle} value={editForm.computerName} onChange={e => setEditForm(f => ({ ...f, computerName: e.target.value }))} />
                : <span style={valueStyle}>{ticket.computerName || "—"}</span>
              }
            </div>
            <div>
              <span style={labelStyle}>נפתח</span>
              <span style={valueStyle}>{formatDate(ticket.createdAt)}</span>
              {ticket.status !== "סגור" && (
                <span style={{ marginTop: 4, display: "block", fontSize: "0.75rem", color: T.inkMuted }}>
                  {formatWorkdays(workdaysBetween(ticket.createdAt))} פתוח
                </span>
              )}
              {ticket.status === "סגור" && (
                <span style={{ marginTop: 4, display: "block", fontSize: "0.75rem", color: T.inkMuted }}>
                  נסגר לאחר {formatWorkdays(workdaysBetween(ticket.createdAt, ticket.updatedAt))}
                </span>
              )}
            </div>
          </div>

          {/* Assignment row — staff can change, users see read-only */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.fill2, borderRadius: 10, border: `1px solid ${T.line}` }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: T.ink, flexShrink: 0 }}>👤 מוקצה ל:</span>
            {isStaff ? (
              <>
                <select
                  value={ticket.assignedTo}
                  disabled={assigning}
                  onChange={e => assignTicket(e.target.value)}
                  style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.82rem", background: T.card, fontWeight: 600, color: T.text, cursor: "pointer", opacity: assigning ? 0.5 : 1 }}
                >
                  {staffMembers.map(m => (
                    <option key={m.email} value={m.email}>{m.display}</option>
                  ))}
                </select>
                {ticket.assignedTo !== session?.user?.email && (
                  <button
                    onClick={() => assignTicket(session?.user?.email ?? "")}
                    disabled={assigning || !session?.user?.email}
                    style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: T.inverseBg, color: T.inverseText, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", opacity: assigning ? 0.5 : 1 }}
                  >
                    הקצה לעצמי
                  </button>
                )}
                {assigning && <span style={{ fontSize: "0.72rem", color: T.inkFaint }}>שומר...</span>}
              </>
            ) : (
              <span style={{ fontSize: "0.88rem", fontWeight: 600, color: T.text }}>
                {staffMembers.find(m => m.email === ticket.assignedTo)?.display ?? ticket.assignedTo}
              </span>
            )}
          </div>

          {/* New-employee details — pulled back out of the description, which
              stays the single source of truth (see lib/newEmployee.ts). When a
              block is present the description below is shown without it, so the
              same four facts are not printed twice. Editing shows the raw text,
              block included, so staff can correct a typo in place. */}
          {!editing && newHire && (
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", background: T.fill2, borderBottom: `1px solid ${T.line}`, fontSize: "0.78rem", fontWeight: 800, color: T.ink }}>
                🧑‍💼 פרטי העובד החדש
              </div>
              <div style={{ padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                {NEW_EMPLOYEE_FIELDS.map(f => (
                  <div key={f.key}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: T.inkFaint }}>{f.label}</span>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: T.text }}>{newHire[f.key] || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <span style={labelStyle}>תיאור</span>
            {editing
              ? <textarea
                  rows={5}
                  style={{ ...inputStyle, resize: "vertical" }}
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                />
              : <div style={{ ...valueStyle, whiteSpace: "pre-wrap", background: T.fill2, borderRadius: 8, padding: "10px 14px", lineHeight: 1.6 }}>{stripNewEmployeeBlock(ticket.description)}</div>
            }
          </div>
        </div>

        {/* Equipment request — on ANY ticket, not just onboarding: an existing
            employee asking for a second screen lands on the same supplier
            order. Everyone can see the list and watch it arrive; the owner may
            add to (and withdraw from) their own open ticket; only staff tick
            items off as received. */}
        {(() => {
          const lines    = ticket.equipment ?? []
          const isOwner  = ticket.user?.email === session?.user?.email
          const isOpen   = ticket.status !== "סגור"
          // Who may add lines: staff any time, the owner while it is open.
          const canAdd   = isStaff || (isOwner && isOpen)
          if (lines.length === 0 && !canAdd && ticket.category !== NEW_EMPLOYEE_CATEGORY && !leaving) return null
          const progress = equipmentProgress(lines)
          return (
            <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>
                  {leaving
                    ? "📤 החזרת ציוד וסגירת חשבונות"
                    : `📦 ${ticket.category === NEW_EMPLOYEE_CATEGORY ? "ציוד לעובד חדש" : "ציוד מבוקש"}`}
                </h2>
                {lines.length > 0 && (
                  <span style={{
                    fontSize: "0.72rem", fontWeight: 700, borderRadius: 999, padding: "3px 10px",
                    background: progress.complete ? T.greenBg : T.orangeBg,
                    color:      progress.complete ? T.greenInk : T.orangeFgDeep,
                  }}>
                    {leaving
                      ? (progress.complete
                          ? "✓ כל הפריטים טופלו"
                          : `${progress.linesDone} מתוך ${progress.linesTotal} פריטים טופלו · נותרו ${progress.linesTotal - progress.linesDone}`)
                      : (progress.complete
                          ? "✓ כל הציוד התקבל"
                          : `${progress.received} מתוך ${progress.requested} יחידות התקבלו · חסרות ${progress.outstanding}`)}
                  </span>
                )}
              </div>

              {/* The whole point of the offboarding checklist: the ticket is
                  the record that this was actually done, so it cannot be
                  declared finished while a line is still open. */}
              {leaving && (
                <div style={{
                  marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: "0.82rem", lineHeight: 1.6,
                  background: closeBlocked ? T.orangeBg : T.greenBg,
                  border: `1px solid ${closeBlocked ? "${T.orangeBorder}" : T.green}`,
                  color: closeBlocked ? T.orangeFgDeep : T.greenInk,
                }}>
                  {closeBlocked
                    ? <>🔒 <strong>לא ניתן לסגור את הפנייה</strong> עד שכל הפריטים יסומנו. סמנו כל פריט שהוחזר או שהחשבון נסגר, והסירו פריטים שאינם רלוונטיים לעובד זה.</>
                    : <>✓ כל הפריטים טופלו — ניתן לסגור את הפנייה.</>}
                </div>
              )}

              {lines.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.85rem", color: T.inkFaint }}>
                  {leaving
                    ? "רשימת ההחזרה ריקה — לא נותר דבר להחזיר או לסגור."
                    : canAdd ? "לא נבחר ציוד בפנייה זו. ניתן להוסיף פריטים למטה." : "לא נבחר ציוד בפנייה זו."}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lines.map(line => {
                  const missing = outstandingOf(line)
                  const done    = missing === 0
                  const busy    = equipSaving === line.id
                  return (
                    <div key={line.id} style={{
                      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                      padding: "9px 12px", borderRadius: 10,
                      background: done ? T.greenBg : T.fill2,
                      border: `1px solid ${done ? T.green : "${T.line}"}`,
                      opacity: busy ? 0.55 : 1, transition: "opacity 0.12s",
                    }}>
                      {/* The V — staff only */}
                      {isStaff ? (
                        <button
                          onClick={() => markReceived(line, !done)}
                          disabled={busy}
                          aria-label={done ? `בטל סימון ${line.label}` : `סמן ${line.label} כ${leaving ? "טופל" : "התקבל"}`}
                          title={done ? "בטל סימון" : leaving ? "סמן כהוחזר / נסגר" : "סמן כהתקבל"}
                          style={{
                            width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                            border: done ? "none" : `1.5px solid ${T.lineStrong}`,
                            background: done ? T.green : T.card,
                            color: T.inverseText, cursor: busy ? "default" : "pointer",
                            fontSize: "0.8rem", fontWeight: 800, lineHeight: 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >{done ? "✓" : ""}</button>
                      ) : (
                        <span aria-hidden style={{
                          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                          background: done ? T.green : T.card, border: done ? "none" : `1.5px solid ${T.line}`,
                          color: T.inverseText, fontSize: "0.8rem", fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{done ? "✓" : ""}</span>
                      )}

                      <span style={{
                        fontSize: "0.86rem", fontWeight: 600, minWidth: 0, flex: 1,
                        color: done ? T.greenInk : T.text,
                        textDecoration: done ? "line-through" : "none",
                      }}>
                        {line.label}
                        {line.quantity > 1 && <span style={{ color: T.text3, fontWeight: 500 }}> × {line.quantity}</span>}
                      </span>

                      {/* Partial delivery — staff can record "2 of 3 arrived" */}
                      {isStaff && line.quantity > 1 && !done && (
                        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.74rem", color: T.text3 }}>
                          התקבלו
                          <input
                            type="number"
                            min={0}
                            max={line.quantity}
                            value={line.receivedQty}
                            disabled={busy}
                            onChange={e => setReceivedQty(line, Number(e.target.value))}
                            style={{ width: 52, padding: "3px 6px", borderRadius: 7, border: `1px solid ${T.line}`, fontSize: "0.78rem", textAlign: "center" }}
                          />
                        </label>
                      )}

                      {!done && (
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: T.orangeFgDeep, background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderRadius: 6, padding: "1px 7px" }}>
                          {leaving ? "טרם טופל" : `חסר ${missing}`}
                        </span>
                      )}

                      {(isStaff || (isOwner && isOpen && line.receivedQty === 0)) && (
                        <button
                          onClick={() => removeEquipment(line)}
                          disabled={busy}
                          title="הסר פריט"
                          aria-label={`הסר ${line.label}`}
                          style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", fontSize: "0.85rem", opacity: 0.45, padding: 0 }}
                        >🗑</button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add an item that was forgotten when the ticket was filed */}
              {canAdd && (
                <div style={{ marginTop: lines.length ? 14 : 0, borderTop: lines.length ? `1px solid ${T.line}` : "none", paddingTop: lines.length ? 14 : 0 }}>
                  {equipAdding ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <EquipmentPicker
                        options={equipmentOptions}
                        value={equipDraft}
                        onChange={setEquipDraft}
                        disabled={equipSaving === "add"}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={addEquipment}
                          disabled={equipSaving === "add"}
                          style={{ padding: "7px 16px", borderRadius: 9, border: "none", background: T.inverseBg, color: T.inverseText, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                        >{equipSaving === "add" ? "שומר..." : "הוסף לרשימה"}</button>
                        <button
                          onClick={() => { setEquipAdding(false); setEquipDraft({}) }}
                          style={{ padding: "7px 16px", borderRadius: 9, border: "none", background: T.fill, color: T.ink, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                        >ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEquipAdding(true)}
                      style={{ padding: "7px 14px", borderRadius: 9, border: `1px dashed ${T.border}`, background: T.card, color: T.text2, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
                    >+ הוספת פריט</button>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Attachments */}
        {ticket.attachments.length > 0 && (
          <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>📎 תמונות מצורפות</h2>
            <ImageAttachments
              images={ticket.attachments.map(a => ({ dataUrl: `/api/attachments/${a.id}`, filename: a.filename ?? undefined }))}
              onChange={() => {}}
              readonly
            />
          </div>
        )}

        {/* Conversation — visible to everyone */}
        <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>💬 שיחה עם הצוות</h2>

          {ticket.messages.length === 0 && (
            <div style={{ fontSize: "0.85rem", color: T.inkFaint, marginBottom: 16 }}>אין הודעות עדיין</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {(() => {
              const lastMsgId = ticket.messages.length > 0 ? ticket.messages[ticket.messages.length - 1].id : null
              return ticket.messages.map((msg: TicketMessage) => {
              const isMe = msg.authorEmail === session?.user?.email
              const byStaff = msg.authorRole === "staff"
              const isReplying = replyTo?.msgId === msg.id
              const isLastMsg = msg.id === lastMsgId
              return (
                <div key={msg.id} id={`msg-${msg.id}`} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 10, alignItems: "flex-start", scrollMarginTop: 80 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: byStaff ? T.inverseBg : T.cyanFg, color: T.inverseText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, flexShrink: 0 }}>
                    {msg.authorName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: byStaff ? T.text : T.cyanFg }}>{msg.authorName}</span>
                      {byStaff && <span style={{ fontSize: "0.65rem", background: T.codeBg, color: T.text, borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>צוות</span>}
                      <span style={{ fontSize: "0.7rem", color: T.inkFaint }}>{formatDate(msg.createdAt)}</span>
                    </div>
                    <div style={{ background: isReplying ? T.amberBg : byStaff ? T.codeBg : T.blueBg, border: isReplying ? `1px solid ${T.amberBorder}` : "none", borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px", padding: "10px 14px", fontSize: "0.88rem", color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.6, boxShadow: `0 1px 3px ${T.shadow2}` }}>
                      {msg.content}
                    </div>
                    {!isMe && (
                      <button
                        onClick={() => { setReplyTo({ email: msg.authorEmail, name: msg.authorName, msgId: msg.id }); document.getElementById("msg-input")?.focus() }}
                        style={{ marginTop: 4, fontSize: "0.7rem", color: T.inkMuted, background: "none", border: "none", cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}
                      >↩ ענה</button>
                    )}
                    {isMe && isLastMsg && (
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        disabled={deletingMsgId === msg.id}
                        style={{ marginTop: 4, fontSize: "0.7rem", color: T.redFg, background: "none", border: "none", cursor: deletingMsgId === msg.id ? "not-allowed" : "pointer", padding: "2px 4px", borderRadius: 4, opacity: deletingMsgId === msg.id ? 0.5 : 1 }}
                      >
                        {deletingMsgId === msg.id ? "מוחק..." : "🗑 מחק"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            )()}
          </div>

          {/* Reply input */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
            {replyTo && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 12px", background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 8, fontSize: "0.8rem", color: T.amberFgDeep }}>
                <span>↩ מגיב ל: <strong>{replyTo.name}</strong></span>
                <button onClick={() => setReplyTo(null)} style={{ marginRight: "auto", background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "0.85rem", lineHeight: 1 }}>✕</button>
              </div>
            )}
            <textarea
              id="msg-input"
              rows={3}
              placeholder="כתוב הודעה..."
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendMessage() }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.88rem", resize: "none", boxSizing: "border-box", marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.72rem", color: T.inkFaint }}>Ctrl+Enter לשליחה</span>
              <button
                onClick={sendMessage}
                disabled={msgSaving || !msgText.trim()}
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: msgSaving || !msgText.trim() ? T.line : T.inverseBg, color: msgSaving || !msgText.trim() ? T.inkFaint : T.inverseText, cursor: msgSaving || !msgText.trim() ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.85rem" }}
              >
                {msgSaving ? "שולח..." : "שלח הודעה"}
              </button>
            </div>
          </div>
        </div>

        {/* Notes — staff only */}
        {isStaff && (
          <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>📝 הערות טכנאי</h2>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: T.purpleFg, background: T.codeBg, borderRadius: 20, padding: "2px 10px", letterSpacing: "0.01em" }}>גלוי לצוות התמיכה בלבד</span>
          </div>

            {ticket.notes.length === 0 && (
              <div style={{ fontSize: "0.85rem", color: T.inkFaint, marginBottom: 16 }}>אין הערות עדיין</div>
            )}

            {ticket.notes.map((note: TicketNote) => (
              <div key={note.id} style={{ borderRight: `3px solid ${T.purpleFg}`, paddingRight: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: T.text }}>{note.authorName}</span>
                  <span style={{ fontSize: "0.75rem", color: T.inkFaint }}>{formatDate(note.createdAt)}</span>
                </div>
                <div style={{ fontSize: "0.88rem", color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{note.content}</div>
              </div>
            ))}

            {/* Add note */}
            <div style={{ borderTop: ticket.notes.length ? `1px solid ${T.line}` : "none", paddingTop: ticket.notes.length ? 16 : 0 }}>
              <textarea
                rows={3}
                placeholder="הוסף הערה... לחצו על שם למטה להזכרת איש צוות (ניתן להדביק תמונה)"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onPaste={e => handleImagePaste(e, img => setNoteImages(prev => [...prev, img]))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontSize: "0.88rem", resize: "none", boxSizing: "border-box", marginBottom: 6 }}
              />
              {/* @mention chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: "0.72rem", color: T.inkFaint, alignSelf: "center" }}>הזכר:</span>
                {staffMembers.map(m => (
                  <button key={m.handle} type="button"
                    onClick={() => setNoteText(t => t ? `${t} @${m.handle}` : `@${m.handle}`)}
                    style={{ padding: "2px 10px", borderRadius: 20, border: `1px solid ${T.codeBg}`, background: T.codeBg, color: T.text, fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}
                  >@{m.handle}</button>
                ))}
              </div>
              <div style={{ marginBottom: 10 }}>
                <ImageAttachments images={noteImages} onChange={setNoteImages} />
              </div>
              {noteError && <div style={{ fontSize: "0.8rem", color: T.redFg, marginBottom: 8 }}>{noteError}</div>}
              <button
                onClick={addNote}
                disabled={noteSaving || (!noteText.trim() && noteImages.length === 0)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: noteSaving || (!noteText.trim() && noteImages.length === 0) ? T.line : T.inverseBg, color: noteSaving || (!noteText.trim() && noteImages.length === 0) ? T.inkFaint : T.inverseText, cursor: noteSaving || (!noteText.trim() && noteImages.length === 0) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.85rem" }}
              >
                {noteSaving ? "שומר..." : "הוסף הערה"}
              </button>
            </div>
          </div>
        )}

        {/* ── History / Audit Timeline — staff only ────────────────────────── */}
        {isStaff && <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, padding: 24 }}>
          <h2 style={{ margin: "0 0 20px", fontSize: "0.9rem", fontWeight: 700, color: T.ink }}>📋 היסטוריית שינויים</h2>
          <div style={{ position: "relative" }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", right: 11, top: 0, bottom: 0, width: 2, background: T.line, zIndex: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {history.map((entry, i) => {
                const isLast = i === history.length - 1
                const icon = historyIcon(entry.field)
                const label = historyLabel(entry)
                return (
                  <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, paddingBottom: isLast ? 0 : 20, position: "relative", zIndex: 1 }}>
                    {/* Dot */}
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: historyDotColor(entry.field), display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", flexShrink: 0, boxShadow: `0 0 0 3px ${T.card}` }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, paddingTop: 2 }}>
                      <div style={{ fontSize: "0.85rem", color: T.text, fontWeight: 500 }}>{label}</div>
                      <div style={{ fontSize: "0.72rem", color: T.inkFaint, marginTop: 2 }}>
                        {entry.actorName} · {formatDate(entry.changedAt)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>}

      </div>
    </div>
  )
}

// ── History helpers ──────────────────────────────────────────────────────────

function historyIcon(field: string): string {
  switch (field) {
    case "created":    return "🟢"
    case "status":     return "🔄"
    case "urgency":    return "⚡"
    case "assignedTo": return "👤"
    case "owner":      return "🔀"
    case "edited":     return "✏️"
    default:           return "📝"
  }
}

function historyDotColor(field: string): string {
  switch (field) {
    case "created":    return T.greenSBg
    case "status":     return T.pillBlueBg
    case "urgency":    return T.amberBg
    case "assignedTo": return T.codeBg
    case "owner":      return T.purpleBg
    case "edited":     return T.fill
    default:           return T.fill
  }
}

function historyLabel(entry: TicketHistoryEntry): string {
  switch (entry.field) {
    case "created":
      return "פנייה נפתחה"
    case "status":
      return `סטטוס שונה: ${entry.oldValue ?? "—"} ← ${entry.newValue ?? "—"}`
    case "urgency":
      return `דחיפות שונתה: ${entry.oldValue ?? "—"} ← ${entry.newValue ?? "—"}`
    case "assignedTo":
      return `הפנייה הוקצתה מחדש: ${entry.newValue ?? "—"}`
    case "owner":
      return `המגיש שונה: ${entry.oldValue ?? "—"} ← ${entry.newValue ?? "—"}`
    case "edited":
      return "פרטי הפנייה עודכנו"
    default:
      return `${entry.field} עודכן`
  }
}
