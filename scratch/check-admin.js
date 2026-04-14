const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function checkUser() {
  const user = await prisma.user.findUnique({
    where: { email: "alon@cristalino.co.il" },
    select: { email: true, isAdmin: true }
  })
  console.log("User status:", JSON.stringify(user, null, 2))
}

checkUser().catch(console.error).finally(() => prisma.$disconnect())
