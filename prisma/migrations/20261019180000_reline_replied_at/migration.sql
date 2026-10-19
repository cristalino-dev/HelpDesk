-- When Reline answered an escalation (v3.103).
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "relineRepliedAt" TIMESTAMP(3);
