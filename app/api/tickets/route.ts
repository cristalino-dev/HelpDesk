import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { subject, description, phone, computerName, urgency, category } = await req.json()

  const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const ticket = await prisma.ticket.create({
    data: { subject, description, phone, computerName, urgency, category, userId: user.id },
  })

  return NextResponse.json(ticket)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!(session?.user as any)?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id, status } = await req.json()
  const ticket = await prisma.ticket.update({ where: { id }, data: { status } })
  return NextResponse.json(ticket)
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin = (session.user as any).isAdmin

  if (isAdmin) {
    const tickets = await prisma.ticket.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    })
    return NextResponse.json(tickets)
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
  if (!user) return NextResponse.json([])

  const tickets = await prisma.ticket.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(tickets)
}
