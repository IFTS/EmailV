/**
 * Database Package - Prisma Client Re-export
 * This package provides isolated database access for all apps
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export default prisma;