-- CreateTable
CREATE TABLE "FieldOption" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldOption_field_label_key" ON "FieldOption"("field", "label");

-- CreateIndex
CREATE INDEX "FieldOption_field_idx" ON "FieldOption"("field");
