import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface TrackingEvent {
  id: string;
  type: 'open' | 'click' | 'bounce' | 'unsubscribe';
  timestamp: number;
  contactId: string;
  campaignId?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
}

const TRACKING_PREFIX = 'tracking:';
const EVENT_TTL = 86400 * 30;

export async function trackEvent(event: Omit<TrackingEvent, 'timestamp'>): Promise<void> {
  const key = `${TRACKING_PREFIX}${event.type}:${event.campaignId || 'general'}`;
  const eventData: TrackingEvent = {
    ...event,
    timestamp: Date.now()
  };

  await redis.lpush(key, JSON.stringify(eventData));
  await redis.expire(key, EVENT_TTL);
}

export async function getTrackingStats(campaignId?: string): Promise<{
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
}> {
  const key = campaignId 
    ? `${TRACKING_PREFIX}*:${campaignId}`
    : `${TRACKING_PREFIX}*`;

  const stats = await redis.keys(key);
  
  const result = { opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 };
  
  for (const k of stats) {
    const type = k.split(':')[1] as 'open' | 'click' | 'bounce' | 'unsubscribe';
    const count = await redis.llen(k);
    if (type === 'open') result.opens += count;
    else if (type === 'click') result.clicks += count;
    else if (type === 'bounce') result.bounces += count;
    else if (type === 'unsubscribe') result.unsubscribes += count;
  }

  return result;
}

export async function getCampaignStats(campaignId: string): Promise<{
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  uniqueOpens: number;
  uniqueClicks: number;
}> {
  const openKey = `${TRACKING_PREFIX}open:${campaignId}`;
  const clickKey = `${TRACKING_PREFIX}click:${campaignId}`;

  const openEvents = await redis.lrange(openKey, 0, -1);
  const clickEvents = await redis.lrange(clickKey, 0, -1);

  const uniqueOpens = new Set<string>();
  const uniqueClicks = new Set<string>();

  for (const e of openEvents) {
    try {
      const parsed = JSON.parse(e) as TrackingEvent;
      if (parsed.contactId) uniqueOpens.add(parsed.contactId);
    } catch {}
  }

  for (const e of clickEvents) {
    try {
      const parsed = JSON.parse(e) as TrackingEvent;
      if (parsed.contactId) uniqueClicks.add(parsed.contactId);
    } catch {}
  }

  return {
    opens: openEvents.length,
    clicks: clickEvents.length,
    bounces: 0,
    unsubscribes: 0,
    uniqueOpens: uniqueOpens.size,
    uniqueClicks: uniqueClicks.size
  };
}

export async function clearOldEvents(days: number = 30): Promise<number> {
  const cutoff = Date.now() - (days * 86400000);
  const pattern = `${TRACKING_PREFIX}*`;
  
  let cleared = 0;
  const keys = await redis.keys(pattern);
  
  for (const key of keys) {
    const events = await redis.lrange(key, 0, -1);
    const kept: string[] = [];
    
    for (const e of events) {
      try {
        const parsed = JSON.parse(e) as TrackingEvent;
        if (parsed.timestamp > cutoff) {
          kept.push(e);
        }
      } catch {}
    }
    
    await redis.del(key);
    if (kept.length > 0) {
      await redis.rpush(key, ...kept);
      cleared++;
    }
  }

  return cleared;
}
