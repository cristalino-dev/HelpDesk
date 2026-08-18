-- Equipment checklist for "עובד חדש" (new employee) tickets (v3.58).
-- The opener picks items + quantities; the handling technician records how
-- many actually arrived. label is a snapshot of the FieldOption label at
-- request time, so editing the option list never rewrites filed tickets.

CREATE TABLE "TicketEquipment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEquipment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketEquipment_ticketId_idx" ON "TicketEquipment"("ticketId");

CREATE UNIQUE INDEX "TicketEquipment_ticketId_label_key" ON "TicketEquipment"("ticketId", "label");

ALTER TABLE "TicketEquipment" ADD CONSTRAINT "TicketEquipment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
