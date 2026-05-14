import Redis from 'ioredis';
import { randomBytes } from 'crypto';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

const defaultConfigs: Record<string, RateLimitConfig> = {
  api: { windowMs: 60000, maxRequests: 100, keyPrefix: 'ratelimit:api' },
  email: { windowMs: 60000, maxRequests: 50, keyPrefix: 'ratelimit:email' },
  ai: { windowMs: 60000, maxRequests: 20, keyPrefix: 'ratelimit:ai' },
  import: { windowMs: 3600000, maxRequests: 10, keyPrefix: 'ratelimit:import' },
  tenant: { windowMs: 60000, maxRequests: 500, keyPrefix: 'ratelimit:tenant' }
};

export async function checkRateLimit(
  identifier: string,
  configName: string = 'api'
): Promise<RateLimitResult> {
  const config = defaultConfigs[configName] || defaultConfigs.api;
  const key = `${config.keyPrefix}:${identifier}`;
  
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  const multi = redis.multi();
  
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zcard(key);
  multi.zadd(key, now, `${now}:${randomBytes(4).toString('hex')}`);
  multi.expire(key, Math.ceil(config.windowMs / 1000));
  
  const results = await multi.exec();
  const currentCount = results?.[1]?.[1] as number || 0;
  
  const resetAt = now + config.windowMs;
  const remaining = Math.max(0, config.maxRequests - currentCount - 1);
  
  if (currentCount >= config.maxRequests) {
    const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const oldestTimestamp = oldestEntry[1] ? parseInt(oldestEntry[1]) : now;
    const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000);
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter
    };
  }
  
  return {
    allowed: true,
    remaining,
    resetAt
  };
}

export async function checkTenantRateLimit(
  tenantId: string,
  operation: string
): Promise<RateLimitResult> {
  const key = `tenant:${tenantId}:${operation}`;
  
  const now = Date.now();
  const windowMs = 60000;
  const windowStart = now - windowMs;
  
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zcard(key);
  multi.zadd(key, now, `${now}:${randomBytes(4).toString('hex')}`);
  multi.expire(key, 120);
  
  const results = await multi.exec();
  const count = results?.[1]?.[1] as number || 0;
  
  const maxRequests = await getTenantQuota(tenantId, operation);
  const resetAt = now + windowMs;
  
  if (count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil(windowMs / 1000)
    };
  }
  
  return {
    allowed: true,
    remaining: maxRequests - count,
    resetAt
  };
}

async function getTenantQuota(tenantId: string, operation: string): Promise<number> {
  const quotaKey = `quota:${tenantId}`;
  const quota = await redis.hget(quotaKey, operation);
  
  if (quota) return parseInt(quota);
  
  const defaultQuotas: Record<string, number> = {
    email: 1000,
    ai: 100,
    import: 50,
    api: 10000
  };
  
  return defaultQuotas[operation] || 100;
}

export async function setTenantQuota(
  tenantId: string,
  operation: string,
  limit: number
): Promise<void> {
  const quotaKey = `quota:${tenantId}`;
  await redis.hset(quotaKey, operation, limit.toString());
}

export async function getRateLimitStatus(identifier: string, configName: string = 'api') {
  const config = defaultConfigs[configName] || defaultConfigs.api;
  const key = `${config.keyPrefix}:${identifier}`;
  
  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  await redis.zremrangebyscore(key, 0, windowStart);
  const count = await redis.zcard(key);
  
  return {
    current: count,
    max: config.maxRequests,
    windowMs: config.windowMs,
    resetAt: now + config.windowMs
  };
}

export async function resetRateLimit(identifier: string, configName: string = 'api'): Promise<void> {
  const config = defaultConfigs[configName] || defaultConfigs.api;
  const key = `${config.keyPrefix}:${identifier}`;
  await redis.del(key);
}

export { redis };
