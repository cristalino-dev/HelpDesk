import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true, station: true, isAdmin: true },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(users)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { id, name, phone, station, isAdmin } = await req.json()

    const user = await prisma.user.update({
      where: { id },
      data: { name, phone, station, isAdmin },
      select: { id: true, name: true, email: true, phone: true, station: true, isAdmin: true },
    })

    return NextResponse.json(user)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/users PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
