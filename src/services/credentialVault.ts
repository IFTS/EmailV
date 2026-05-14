import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, ENCRYPTION_KEY_LENGTH);
}

function createMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('MASTER_ENCRYPTION_KEY environment variable not set');
  }
  return createHash('sha256').update(key).digest();
}

export function encryptCredential(plaintext: string): string {
  const masterKey = createMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  
  const key = deriveKey(masterKey.toString('base64'), salt);
  
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  const result = Buffer.concat([salt, iv, tag, encrypted]);
  
  return result.toString('base64');
}

export function decryptCredential(encryptedData: string): string {
  const masterKey = createMasterKey();
  
  const data = Buffer.from(encryptedData, 'base64');
  
  const salt = data.subarray(0, SALT_LENGTH);
  const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = deriveKey(masterKey.toString('base64'), salt);
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

export async function storeCredential(
  tenantId: string,
  key: string,
  value: string
): Promise<void> {
  const encrypted = encryptCredential(value);
  const redisKey = `credential:${tenantId}:${key}`;
  
  await redis.set(redisKey, encrypted, 'EX', 86400 * 30);
}

export async function retrieveCredential(
  tenantId: string,
  key: string
): Promise<string | null> {
  const redisKey = `credential:${tenantId}:${key}`;
  const encrypted = await redis.get(redisKey);
  
  if (!encrypted) return null;
  
  return decryptCredential(encrypted);
}

export async function deleteCredential(
  tenantId: string,
  key: string
): Promise<void> {
  const redisKey = `credential:${tenantId}:${key}`;
  await redis.del(redisKey);
}

export async function rotateCredential(
  tenantId: string,
  key: string,
  newValue: string
): Promise<void> {
  await storeCredential(tenantId, key, newValue);
}

export async function listCredentials(
  tenantId: string
): Promise<string[]> {
  const pattern = `credential:${tenantId}:*`;
  const keys = await redis.keys(pattern);
  
  return keys.map(key => key.replace(`credential:${tenantId}:`, ''));
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export async function storeApiKey(
  tenantId: string,
  apiKeyName: string,
  apiKey: string
): Promise<{ key: string; hash: string }> {
  const key = `${apiKeyName}_${randomBytes(8).toString('hex')}`;
  const hash = hashApiKey(apiKey);
  
  await redis.set(`apikey:${tenantId}:${key}`, hash, 'EX', 86400 * 365);
  
  return { key, hash };
}

export async function verifyApiKey(
  tenantId: string,
  key: string,
  providedApiKey: string
): Promise<boolean> {
  const storedHash = await redis.get(`apikey:${tenantId}:${key}`);
  
  if (!storedHash) return false;
  
  const providedHash = hashApiKey(providedApiKey);
  
  return storedHash === providedHash;
}

export async function revokeApiKey(
  tenantId: string,
  key: string
): Promise<void> {
  await redis.del(`apikey:${tenantId}:${key}`);
}
