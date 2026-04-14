const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function promoteAdmin() {
  const user = await prisma.user.update({
    where: { email: "alon@cristalino.co.il" },
    data: { isAdmin: true }
  })
  console.log("User promoted:", JSON.stringify(user, null, 2))
}

promoteAdmin().catch(console.error).finally(() => prisma.$disconnect())
