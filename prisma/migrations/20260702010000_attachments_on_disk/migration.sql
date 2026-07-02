-- Ticket attachments move to the server filesystem (v3.48).
-- dataUrl becomes optional (legacy rows keep theirs until the data migration
-- script clears them); new columns hold the on-disk metadata.

ALTER TABLE "TicketAttachment" ALTER COLUMN "dataUrl" DROP NOT NULL;
ALTER TABLE "TicketAttachment" ADD COLUMN "storedName" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "TicketAttachment" ADD COLUMN "size" INTEGER;

CREATE UNIQUE INDEX "TicketAttachment_storedName_key" ON "TicketAttachment"("storedName");
