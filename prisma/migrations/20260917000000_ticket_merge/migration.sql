-- v3.92 — merging tickets. A merged ticket points at the one that carries on
-- (Ticket.mergedIntoId); the people who opened the merged ones follow the
-- survivor (TicketParticipant). See lib/ticketMerge.ts.
-- IF NOT EXISTS throughout: this runs inside the deploy's swap window (rule 49).

ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;
CREATE INDEX IF NOT EXISTS "Ticket_mergedIntoId_idx" ON "Ticket"("mergedIntoId");

DO $$ BEGIN
  ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_mergedIntoId_fkey"
    FOREIGN KEY ("mergedIntoId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TicketParticipant" (
    "id"        TEXT NOT NULL,
    "ticketId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "addedBy"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TicketParticipant_ticketId_userId_key" ON "TicketParticipant"("ticketId", "userId");
CREATE INDEX IF NOT EXISTS "TicketParticipant_userId_idx" ON "TicketParticipant"("userId");

DO $$ BEGIN
  ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketParticipant" ADD CONSTRAINT "TicketParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
