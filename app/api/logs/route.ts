import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

// POST — create a log entry (open to any caller; errors are logged server-side)
export async function POST(req: NextRequest) {
  try {
    const { message, source, stack, level = "error" } = await req.json()
    const today = new Date().toISOString().slice(0, 10)

    await prisma.log.create({
      data: { message: String(message).slice(0, 2000), source, stack: stack ? String(stack).slice(0, 5000) : undefined, level, date: today },
    })

    // Auto-cleanup: delete entries older than 30 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffDate = cutoff.toISOString().slice(0, 10)
    await prisma.log.deleteMany({ where: { date: { lt: cutoffDate } } })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// GET — admin only, fetch logs for a given date (defaults to today)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10)

  const logs = await prisma.log.findMany({
    where: { date },
    orderBy: { timestamp: "asc" },
  })

  return NextResponse.json(logs)
}
