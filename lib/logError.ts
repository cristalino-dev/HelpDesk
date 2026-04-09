import { prisma } from "@/lib/db"

export async function logError(message: string, source?: string, stack?: string) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    await prisma.log.create({
      data: {
        level: "error",
        message: String(message).slice(0, 2000),
        source,
        stack: stack ? String(stack).slice(0, 5000) : undefined,
        date: today,
      },
    })
  } catch {
    // Do not throw if logging fails
  }
}
