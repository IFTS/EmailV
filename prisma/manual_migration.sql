-- Manual SQL Migration for EmailV
-- Run this if you want to manually update the database
-- Otherwise use: npx prisma migrate dev

-- =====================================================
-- STEP 1: Rename password to passwordHash
-- =====================================================

-- Add new column
ALTER TABLE "User" ADD COLUMN "passwordHash" VARCHAR(255);

-- Copy existing passwords (they won't work, users need to reset)
UPDATE "User" SET "passwordHash" = "password";

-- Make column required
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

-- Drop old column
-- WARNING: Only do this AFTER all code is deployed!
-- ALTER TABLE "User" DROP COLUMN "password";

-- =====================================================
-- STEP 2: Add AuthAttempt table
-- =====================================================

CREATE TABLE "AuthAttempt" (
    "id" VARCHAR(25) PRIMARY KEY DEFAULT cuidsrl(),
    "userId" VARCHAR(25) NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "tenantId" VARCHAR(25) NOT NULL,
    "ipAddress" VARCHAR(50) NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
    "userAgent" VARCHAR(500),
    
    CONSTRAINT "AuthAttempt_userId_fkey" FOREIGN KEY ("userId") 
        REFERENCES "User"(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX "AuthAttempt_userId_idx" ON "AuthAttempt"("userId");
CREATE INDEX "AuthAttempt_tenantId_idx" ON "AuthAttempt"("tenantId");
CREATE INDEX "AuthAttempt_timestamp_idx" ON "AuthAttempt"("timestamp");

-- =====================================================
-- NOTES
-- =====================================================
--
-- After migration completes:
-- 1. Regenerate Prisma: npx prisma generate
-- 2. Deploy app: npm run deploy
-- 3. Audit passwords: npm run password:audit
--
-- IMPORTANT: Legacy password hashes cannot be automatically 
-- converted to bcrypt. Users must use password reset.
--
-- Run SQL to find affected users:
-- SELECT email FROM "User" WHERE "passwordHash" NOT LIKE '$2%';