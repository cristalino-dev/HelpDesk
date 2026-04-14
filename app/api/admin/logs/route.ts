import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { STAFF_EMAILS } from "@/lib/staffEmails"

export async function GET() {
  const session = await auth()
  const isStaff = session?.user?.email && STAFF_EMAILS.includes(session.user.email)
  const isAdmin = session?.user?.isAdmin

  if (!isStaff && !isAdmin) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    const logs = await prisma.log.findMany({
      orderBy: { timestamp: "desc" },
      take: 200,
    })
    return NextResponse.json(logs)
  } catch (error) {
    console.error("Failed to fetch logs:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  try {
    await prisma.log.deleteMany({})
    return new NextResponse("Logs cleared", { status: 200 })
  } catch (error) {
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
