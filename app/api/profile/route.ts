import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { logError } from "@/lib/logError"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { phone: true, station: true, name: true, email: true },
    })

    return NextResponse.json(user ?? {})
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/profile GET", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { name, phone, station } = await req.json()

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { name, phone, station },
      select: { name: true, phone: true, station: true },
    })

    return NextResponse.json(user)
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    await logError(e.message, "/api/profile PATCH", e.stack)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
