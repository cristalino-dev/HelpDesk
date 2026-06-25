-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maker" TEXT,
    "model" TEXT,
    "supplier" TEXT,
    "ipv4" TEXT,
    "hostname" TEXT,
    "inkToner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterDriver" (
    "id" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrinterDriver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Printer_name_idx" ON "Printer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterDriver_storedName_key" ON "PrinterDriver"("storedName");

-- CreateIndex
CREATE INDEX "PrinterDriver_printerId_idx" ON "PrinterDriver"("printerId");

-- AddForeignKey
ALTER TABLE "PrinterDriver" ADD CONSTRAINT "PrinterDriver_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
