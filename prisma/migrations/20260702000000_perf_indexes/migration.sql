-- Performance indexes (v3.47)
--
-- Postgres does not auto-index foreign keys. Every ticket-detail load joins
-- four child tables by ticketId; without indexes each include is a sequential
-- scan over the whole child table. Ticket.userId serves the user dashboard,
-- Ticket.status serves the digest/sweep crons (sweep runs every 5 minutes),
-- and Log.date / Log.timestamp serve the admin logs tab.

CREATE INDEX IF NOT EXISTS "Ticket_userId_idx" ON "Ticket"("userId");
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status");

CREATE INDEX IF NOT EXISTS "TicketHistory_ticketId_idx"    ON "TicketHistory"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketMessage_ticketId_idx"    ON "TicketMessage"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketNote_ticketId_idx"       ON "TicketNote"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

CREATE INDEX IF NOT EXISTS "Log_date_idx"      ON "Log"("date");
CREATE INDEX IF NOT EXISTS "Log_timestamp_idx" ON "Log"("timestamp");
