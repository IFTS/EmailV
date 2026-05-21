/**
 * Improved Authentication Service
 * - Uses bcrypt for password hashing (not SHA256)
 * - Structurally sound authentication
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { compare, hash } from 'bcrypt';
import Redis from 'ioredis';
import { storeCredential, retrieveCredential, hashApiKey } from './credentialVault.js';
import { checkRateLimit } from './rateLimiter.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

// Use bcrypt rounds - cost factor 12 is secure yet reasonable
const BCRYPT_ROUNDS = 12;

function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash password using bcrypt (secure password hashing)
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await compare(password, hash);
  } catch {
    // Fallback for legacy SHA256 hashes
    return verifyLegacyPassword(password, hash);
  }
}

/**
 * Legacy password verification for migration
 */
function verifyLegacyPassword(password: string, storedHash: string): boolean {
  if (storedHash.length !== 64) return false;
  const salt = storedHash.slice(0, 16);
  const originalHash = storedHash.slice(16);
  const computed = createHash('sha256').update(password + salt).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(originalHash), Buffer.from(computed));
  } catch {
    return false;
  }
}

/**
 * Authenticate user with rate limiting
 */
export async function authenticateUser(
  email: string,
  password: string,
  ipAddress: string
): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
  // Check rate limit first - fail fast
  const rateLimit = await checkRateLimit(ipAddress, 'auth');
  if (!rateLimit.allowed) {
    return { success: false, error: 'Too many attempts. Try again later.' };
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    // Delay to prevent enumeration
    await new Promise(r => setTimeout(r, 100));
    return { success: false, error: 'Invalid credentials' };
  }

  // Use bcrypt verification
  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    await prisma.authAttempt.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        ipAddress,
        success: false,
        timestamp: new Date()
      }
    });
    return { success: false, error: 'Invalid credentials' };
  }

  // Successful login - record it
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() }
  });

  await prisma.authAttempt.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress,
      success: true,
      timestamp: new Date()
    }
  });

  const accessToken = generateToken(32);
  const refreshToken = generateToken(64);
  const tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);

  await redis.set(
    `auth:${accessToken}`,
    JSON.stringify({ userId: user.id, tenantId: user.tenantId, role: user.role }),
    'EX',
    86400
  );

  await redis.set(
    `refresh:${refreshToken}`,
    user.id,
    'EX',
    604800
  );

  return {
    success: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token: accessToken
  };
}

export async function verifyToken(token: string): Promise<{ valid: boolean; user?: any }> {
  const data = await redis.get(`auth:${token}`);

  if (!data) {
    return { valid: false };
  }

  return { valid: true, user: JSON.parse(data) };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ token?: string; error?: string }> {
  const userId = await redis.get(`refresh:${refreshToken}`);

  if (!userId) {
    return { error: 'Invalid refresh token' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return { error: 'User not found' };
  }

  const newAccessToken = generateToken(32);

  await redis.set(
    `auth:${newAccessToken}`,
    JSON.stringify({ userId: user.id, tenantId: user.tenantId, role: user.role }),
    'EX',
    86400
  );

  return { token: newAccessToken };
}

export async function revokeToken(token: string): Promise<void> {
  await redis.del(`auth:${token}`);
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: Function
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  const { valid, user } = await verifyToken(token);

  if (!valid) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as any).user = user;
  (req as any).tenantId = user.tenantId;
  next();
}

export async function requireRole(roles: string[]) {
  return async (req: Request, res: Response, next: Function): Promise<void> => {
    const user = (req as any).user;

    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export async function createApiKey(
  tenantId: string,
  name: string,
  permissions: string[]
): Promise<{ key: string; keyId: string }> {
  const key = generateToken(48);
  const keyId = generateToken(16);
  const keyHash = hashApiKey(key);

  await redis.hset(
    `apikeys:${tenantId}`,
    keyId,
    JSON.stringify({ name, permissions, createdAt: Date.now() })
  );

  await redis.set(
    `apikey:${keyId}`,
    `${tenantId}:${keyHash}`,
    'EX',
    86400 * 365
  );

  return { key: `${keyId}_${key}`, keyId };
}

export async function verifyApiKey(key: string): Promise<{ valid: boolean; tenantId?: string; permissions?: string[] }> {
  const [keyId, keyPart] = key.split('_');

  if (!keyId || !keyPart) {
    return { valid: false };
  }

  const stored = await redis.get(`apikey:${keyId}`);

  if (!stored) {
    return { valid: false };
  }

  const [tenantId, keyHash] = stored.split(':');
  const providedHash = hashApiKey(keyPart);

  if (keyHash !== providedHash) {
    return { valid: false };
  }

  const keyData = await redis.hget(`apikeys:${tenantId}`, keyId);

  if (!keyData) {
    return { valid: false };
  }

  return { valid: true, tenantId, permissions: JSON.parse(keyData).permissions };
}

export async function revokeApiKey(tenantId: string, keyId: string): Promise<void> {
  await redis.hdel(`apikeys:${tenantId}`, keyId);
  await redis.del(`apikey:${keyId}`);
}