import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { phone: true, station: true, name: true, email: true },
  })

  return NextResponse.json(user ?? {})
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, phone, station } = await req.json()

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: { name, phone, station },
    select: { name: true, phone: true, station: true },
  })

  return NextResponse.json(user)
}
