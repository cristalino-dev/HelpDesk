-- Add holdReason for on-hold tickets ("בהמתנה" status)
ALTER TABLE "Ticket" ADD COLUMN "holdReason" TEXT;
