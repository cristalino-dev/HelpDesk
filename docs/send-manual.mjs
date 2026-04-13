import nodemailer from "nodemailer"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(__dirname, "manual.html"), "utf-8")

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "dev@cristalino.co.il",
    pass: process.env.SMTP_PASS,
  },
})

await transporter.sendMail({
  from: '"מערכת Helpdesk קריסטלינו" <dev@cristalino.co.il>',
  to: "alon@cristalino.co.il",
  subject: "מדריך שימוש – מערכת Helpdesk קריסטלינו",
  html,
})

console.log("Email sent to alon@cristalino.co.il")
