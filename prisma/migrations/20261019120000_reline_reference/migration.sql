-- Reline escalation reference (v3.102).
-- IF NOT EXISTS: `prisma migrate deploy` runs on every release.

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "relineRef"    TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "relineSentAt" TIMESTAMP(3);
