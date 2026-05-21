import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { scrypt } from 'crypto';
import Redis from 'ioredis';
import { storeCredential, retrieveCredential, hashApiKey } from './credentialVault.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
  refreshTokenExpiry: number;
  mfaEnabled: boolean;
}

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(password + salt).digest('hex');
}

function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { email, tenantId: { not: '' } }
  });

  if (!user) {
    return { success: false, error: 'Invalid credentials' };
  }

  const passwordHash = hashPassword(password, user.password.slice(0, 16));
  
  if (passwordHash !== user.password) {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });
    return { success: false, error: 'Invalid credentials' };
  }

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
