-- v3.88 — keys for the public API (/api/v1). Only a SHA-256 of each key is
-- stored; the key itself is shown once, to the admin who creates it.
-- IF NOT EXISTS throughout: this runs inside the deploy's swap window.
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "prefix"     TEXT NOT NULL,
    "hash"       TEXT NOT NULL,
    "scope"      TEXT NOT NULL DEFAULT 'read',
    "createdBy"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hash_key" ON "ApiKey"("hash");
