import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const API_KEY_HASH_LENGTH = 32;
const API_KEY_SCRYPT_N = 16384;
const API_KEY_SCRYPT_R = 8;
const API_KEY_SCRYPT_P = 1;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, ENCRYPTION_KEY_LENGTH);
}

export async function storeCredential(
  tenantId: string,
  key: string,
  plaintext: string,
  encryptionPassword: string
): Promise<void> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = deriveKey(encryptionPassword, salt);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  const storedValue = JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    encrypted,
    authTag: authTag.toString('hex'),
  });

  await redis.set(`credential:${tenantId}:${key}`, storedValue);
}

export async function retrieveCredential(
  tenantId: string,
  key: string,
  encryptionPassword: string
): Promise<string> {
  const storedValue = await redis.get(`credential:${tenantId}:${key}`);

  if (!storedValue) {
    throw new Error('Credential not found');
  }

  const stored = JSON.parse(storedValue);

  const salt = Buffer.from(stored.salt, 'hex');
  const derivedKey = deriveKey(encryptionPassword, salt);

  const iv = Buffer.from(stored.iv, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);

  const authTag = Buffer.from(stored.authTag, 'hex');
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(stored.encrypted, 'hex', 'utf-8');
  plaintext += decipher.final('utf-8');

  return plaintext;
}

export async function deleteCredential(tenantId: string, key: string): Promise<void> {
  await redis.del(`credential:${tenantId}:${key}`);
}

export async function credentialExists(tenantId: string, key: string): Promise<boolean> {
  const exists = await redis.exists(`credential:${tenantId}:${key}`);
  return exists === 1;
}

export async function listCredentials(tenantId: string): Promise<string[]> {
  const pattern = `credential:${tenantId}:*`;
  const keys = await redis.keys(pattern);

  return keys.map((key) => key.replace(`credential:${tenantId}:`, ''));
}

export function hashApiKey(apiKey: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = scryptSync(apiKey, salt, API_KEY_HASH_LENGTH, {
    N: API_KEY_SCRYPT_N,
    r: API_KEY_SCRYPT_R,
    p: API_KEY_SCRYPT_P
  });
  return `scrypt$${API_KEY_SCRYPT_N}$${API_KEY_SCRYPT_R}$${API_KEY_SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function storeApiKey(
  tenantId: string,
  key: string,
  apiKey: string,
  expiresIn?: number
): Promise<void> {
  const hash = hashApiKey(apiKey);

  const storageKey = `apikey:${tenantId}:${key}`;

  if (expiresIn) {
    await redis.setex(storageKey, expiresIn, hash);
  } else {
    await redis.set(storageKey, hash);
  }
}

export async function verifyApiKey(
  tenantId: string,
  key: string,
  providedApiKey: string
): Promise<boolean> {
  const storedHash = await redis.get(`apikey:${tenantId}:${key}`);
  
  if (!storedHash) return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];

  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expectedHash = Buffer.from(hashHex, 'hex');
  const providedHash = scryptSync(providedApiKey, salt, expectedHash.length, { N: n, r, p });

  if (providedHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(providedHash, expectedHash);
}

export async function revokeApiKey(tenantId: string, key: string): Promise<void> {
  await redis.del(`apikey:${tenantId}:${key}`);
}

export async function listApiKeys(tenantId: string): Promise<string[]> {
  const pattern = `apikey:${tenantId}:*`;
  const keys = await redis.keys(pattern);

  return keys.map((key) => key.replace(`apikey:${tenantId}:`, ''));
}
