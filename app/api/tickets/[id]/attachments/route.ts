import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { STAFF_EMAILS } from "@/lib/staffEmails"
import { NextRequest, NextResponse } from "next/server"

const MAX_SIZE = 3 * 1024 * 1024 // 3MB base64 string length limit

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const { dataUrl, filename } = await req.json()

    if (!dataUrl?.startsWith("data:image/")) return NextResponse.json({ error: "Invalid image" }, { status: 400 })
    if (dataUrl.length > MAX_SIZE) return NextResponse.json({ error: "Image too large (max 3MB)" }, { status: 400 })

    // Verify user owns the ticket or is staff
    const isStaff = session.user.isAdmin || STAFF_EMAILS.includes(session.user.email)
    if (!isStaff) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email } })
      const ticket = await prisma.ticket.findUnique({ where: { id } })
      if (!user || ticket?.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const attachment = await prisma.ticketAttachment.create({
      data: { ticketId: id, dataUrl, filename: filename ?? null },
    })

    return NextResponse.json(attachment)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/tickets/[id]/attachments POST", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
