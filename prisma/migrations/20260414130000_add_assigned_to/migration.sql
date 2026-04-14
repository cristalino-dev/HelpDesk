-- Add assignedTo column with default value (all existing tickets assigned to helpdesk)
ALTER TABLE "Ticket" ADD COLUMN "assignedTo" TEXT NOT NULL DEFAULT 'helpdesk@cristalino.co.il';
