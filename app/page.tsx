import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()

  if (!session) redirect("/login")
  if ((session.user as any).isAdmin) redirect("/admin")
  redirect("/dashboard")
}
