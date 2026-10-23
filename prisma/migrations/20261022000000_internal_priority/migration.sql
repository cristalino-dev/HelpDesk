-- The helpdesk's own urgency, P1–P5 (v3.107). Nullable: a ticket nobody has
-- classified keeps the SLA of its type. IF NOT EXISTS so it can be applied
-- against the running app before the deploy, and the in-window run is a no-op
-- (rule 49).
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "internalPriority" TEXT;
