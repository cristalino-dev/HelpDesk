-- Secondary addresses for a User (v3.101).
--
-- IF NOT EXISTS throughout: deploy.sh runs `prisma migrate deploy` on every
-- release, and a migration that cannot be re-applied turns a routine deploy
-- into an outage.

CREATE TABLE IF NOT EXISTS "UserEmail" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "addedBy"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserEmail_email_key" ON "UserEmail"("email");
CREATE INDEX IF NOT EXISTS "UserEmail_userId_idx" ON "UserEmail"("userId");

-- The same functional index User.email carries: the application stores the
-- normalised form, and this is what makes that a guarantee rather than a habit.
CREATE UNIQUE INDEX IF NOT EXISTS "UserEmail_email_lower_key" ON "UserEmail"(lower("email"));

DO $$ BEGIN
    ALTER TABLE "UserEmail"
        ADD CONSTRAINT "UserEmail_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
