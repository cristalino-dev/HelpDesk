-- Add ticketNumber as nullable first so we can backfill existing rows
ALTER TABLE "Ticket" ADD COLUMN "ticketNumber" INTEGER;

-- Backfill existing tickets with sequential numbers in creation order
UPDATE "Ticket" t
SET "ticketNumber" = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Ticket"
) sub
WHERE t.id = sub.id;

-- Create a sequence and set its start value just above the current max
CREATE SEQUENCE IF NOT EXISTS "Ticket_ticketNumber_seq";
SELECT setval('"Ticket_ticketNumber_seq"', COALESCE((SELECT MAX("ticketNumber") FROM "Ticket"), 0) + 1, false);

-- Attach sequence as default, enforce NOT NULL, own the sequence
ALTER TABLE "Ticket"
  ALTER COLUMN "ticketNumber" SET DEFAULT nextval('"Ticket_ticketNumber_seq"'),
  ALTER COLUMN "ticketNumber" SET NOT NULL;

ALTER SEQUENCE "Ticket_ticketNumber_seq" OWNED BY "Ticket"."ticketNumber";

-- Unique constraint (mirrors @unique in schema.prisma)
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ticketNumber_key" UNIQUE ("ticketNumber");
