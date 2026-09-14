-- v3.87 — a ticket is a fault ("ticket", labelled HDTC-N) or a request
-- ("request", labelled REQ-N). One number sequence for both; the label and the
-- SLA follow the type. Every existing row is a fault, which is what it was.
-- IF NOT EXISTS throughout: this runs inside the deploy's swap window, with the
-- app stopped, where a failure leaves the site down (docs/ARCHITECTURE.md §11).
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'ticket';
CREATE INDEX IF NOT EXISTS "Ticket_type_idx" ON "Ticket"("type");

-- Settings admins change from the console — to begin with, the SLA per type
-- (keys "sla.ticket" and "sla.request", in workdays). A missing key means the
-- default in lib/ticketType.ts.
CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
