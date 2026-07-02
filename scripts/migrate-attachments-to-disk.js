/**
 * scripts/migrate-attachments-to-disk.js — One-time data migration (v3.48)
 *
 * Moves legacy inline-base64 ticket attachments out of Postgres onto the
 * server filesystem (uploads/ticket-attachments/), matching how new uploads
 * are stored since v3.48. For each pre-v3.48 row it decodes `dataUrl`,
 * writes the bytes to disk, then updates the row (storedName/mimeType/size)
 * and clears `dataUrl`.
 *
 * Safe to re-run: only touches rows where dataUrl is set and storedName is
 * null, and the file is written before the row is updated (a crash in
 * between leaves the row fully functional via the legacy-serving fallback).
 *
 * Run on the server from the app directory:
 *   node scripts/migrate-attachments-to-disk.js
 */

const { PrismaClient } = require("@prisma/client")
const { mkdir, writeFile } = require("fs/promises")
const { randomUUID } = require("crypto")
const path = require("path")

const EXT = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp",
  "image/svg+xml": "svg", "image/avif": "avif",
}

async function main() {
  const prisma = new PrismaClient()
  const dir = path.join(process.cwd(), "uploads", "ticket-attachments")
  await mkdir(dir, { recursive: true })

  const rows = await prisma.ticketAttachment.findMany({
    where: { dataUrl: { not: null }, storedName: null },
    select: { id: true, dataUrl: true },
  })
  console.log(`Migrating ${rows.length} attachment(s) to disk...`)

  let migrated = 0, skipped = 0, bytes = 0
  for (const row of rows) {
    const m = /^data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(row.dataUrl || "")
    if (!m) { console.warn(`  skip ${row.id}: not a base64 image data URL`); skipped++; continue }
    const mimeType = m[1].toLowerCase()
    const buffer = Buffer.from(m[2], "base64")
    if (buffer.length === 0) { console.warn(`  skip ${row.id}: empty payload`); skipped++; continue }

    const storedName = `${randomUUID()}.${EXT[mimeType] || "bin"}`
    await writeFile(path.join(dir, storedName), buffer)
    await prisma.ticketAttachment.update({
      where: { id: row.id },
      data: { storedName, mimeType, size: buffer.length, dataUrl: null },
    })
    migrated++
    bytes += buffer.length
  }

  console.log(`Done: ${migrated} migrated (${(bytes / 1024 / 1024).toFixed(1)} MB moved out of Postgres), ${skipped} skipped`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
