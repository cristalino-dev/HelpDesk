import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, station: true, isAdmin: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(users)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id, name, phone, station, isAdmin } = await req.json()

  const user = await prisma.user.update({
    where: { id },
    data: { name, phone, station, isAdmin },
    select: { id: true, name: true, email: true, phone: true, station: true, isAdmin: true },
  })

  return NextResponse.json(user)
}
