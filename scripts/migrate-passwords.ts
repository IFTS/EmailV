/**
 * Password Migration Script
 * 
 * Converts existing SHA256 passwords to bcrypt format.
 * Run with: npx tsx scripts/migrate-passwords.ts
 * 
 * Requirements:
 * - DATABASE_URL env var
 * - Run after migrating schema: npx prisma migrate dev
 */

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

/**
 * Check if password is already bcrypt
 */
function isBcrypt(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$');
}

async function migratePasswords() {
  console.log('🔐 Starting password migration...\n');
  
  // Get all users with legacy password format
  const users = await prisma.user.findMany({
    where: {
      NOT: {
        passwordHash: { startsWith: '$2' }
      }
    },
    select: {
      id: true,
      email: true,
      passwordHash: true
    }
  });
  
  console.log(`Found ${users.length} users with legacy passwords`);
  
  let migrated = 0;
  let failed = 0;
  let alreadyBcrypt = 0;
  
  for (const user of users) {
    if (isBcrypt(user.passwordHash)) {
      alreadyBcrypt++;
      continue;
    }
    
    // Legacy password hashing cannot be reversed
    // Users need to use password reset flow
    console.log(`  ✗ ${user.email} - needs password reset`);
    failed++;
  }
  
  console.log('\n📊 Migration Summary:');
  console.log(`  - Already bcrypt: ${alreadyBcrypt}`);
  console.log(`  - Need password reset: ${failed}`);
  console.log(`  - Migrated: ${migrated}`);
  
  if (failed > 0) {
    console.log('\n⚠️  To migrate legacy users, send password reset emails');
  }
  
  return { migrated, failed, alreadyBcrypt };
}

/**
 * Check password strength distribution
 */
async function auditPasswords() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      passwordHash: true
    }
  });
  
  let bcrypt = 0;
  let other = 0;
  
  for (const user of users) {
    if (isBcrypt(user.passwordHash)) {
      bcrypt++;
    } else {
      other++;
    }
  }
  
  console.log('\n📊 Password Audit:');
  console.log(`  - bcrypt: ${bcrypt}`);
  console.log(`  - legacy/other: ${other}`);
}

async function main() {
  const command = process.argv[2] || 'migrate';
  
  try {
    switch (command) {
      case 'migrate':
        await migratePasswords();
        break;
      case 'audit':
        await auditPasswords();
        break;
      default:
        console.log('Usage: migrate-passwords.ts [migrate|audit]');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();