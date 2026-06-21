-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "sourceMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_sourceMessageId_key" ON "Ticket"("sourceMessageId");
