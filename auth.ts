import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    async session({ session }) {
      if (session.user?.email) {
        let user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (!user) {
          user = await prisma.user.create({
            data: {
              email: session.user.email,
              name: session.user.name,
              image: session.user.image,
            },
          })
        }
        session.user.isAdmin = user.isAdmin
        session.user.id = user.id
      }
      return session
    },
  },
})
