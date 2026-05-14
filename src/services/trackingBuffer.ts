import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

const redis = new RedisClientType(process.env.REDIS_URL || 'redis://localhost:6379');

interface TrackingEvent {
  type: 'open' | 'click' | 'bounce' | 'complaint' | 'unsubscribe';
  campaignId: string;
  contactId: string;
  email: string;
  timestamp: number;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 5000;
const MAX_RETRY = 3;

class TrackingBuffer extends EventEmitter {
  private buffer: TrackingEvent[] = [];
  private flushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private redis: RedisClientType;
  private retryCount = new Map<string, number>();

  constructor(redisClient?: RedisClientType) {
    super();
    this.redis = redisClient || redis;
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('Tracking flush error:', err);
        this.emit('flush_error', err);
      });
    }, FLUSH_INTERVAL);
  }

  async track(event: TrackingEvent): Promise<void> {
    this.buffer.push(event);
    
    if (this.buffer.length >= BUFFER_SIZE) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;

    this.flushing = true;
    const events = [...this.buffer];
    this.buffer = [];

    try {
      const pipeline = this.redis.multi();
      
      for (const event of events) {
        const key = `tracking:${event.type}:${event.campaignId}`;
        const score = event.timestamp;
        const member = JSON.stringify({
          ...event,
          bufferedAt: Date.now()
        });
        
        pipeline.zadd(key, score, member);
        pipeline.zremrangebyscore(key, 0, Date.now() - (30 * 24 * 60 * 60 * 1000));
      }

      await pipeline.exec();
      
      this.retryCount.clear();
      this.emit('flushed', events.length);
      
    } catch (error) {
      console.error('Tracking flush failed:', error);
      
      const failedKey = events.map(e => `${e.campaignId}:${e.type}`).join(',');
      const currentRetry = this.retryCount.get(failedKey) || 0;
      
      if (currentRetry < MAX_RETRY) {
        this.retryCount.set(failedKey, currentRetry + 1);
        this.buffer.push(...events);
      } else {
        this.emit('flush_failed', { events, error });
      }
    } finally {
      this.flushing = false;
    }
  }

  async getTrackingStats(campaignId: string): Promise<{
    opens: number;
    clicks: number;
    bounces: number;
    unsubscribes: number;
  }> {
    const types = ['open', 'click', 'bounce', 'unsubscribe'];
    const stats = { opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 };

    for (const type of types) {
      const key = `tracking:${type}:${campaignId}`;
      const count = await this.redis.zcard(key);
      stats[type === 'open' ? 'opens' : type === 'click' ? 'clicks' : type] = count;
    }

    return stats;
  }

  async processTrackingEvents(
    processor: (events: TrackingEvent[]) => Promise<void>
  ): Promise<void> {
    const types = ['open', 'click', 'bounce', 'unsubscribe', 'complaint'];
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (const type of types) {
      const key = `tracking:${type}:*`;
      const keys = await this.redis.keys(key);

      for (const campaignKey of keys) {
        const events = await this.redis.zrangebyscore(
          campaignKey,
          thirtyDaysAgo,
          '+inf'
        );

        if (events.length === 0) continue;

        const parsedEvents: TrackingEvent[] = events.map(e => JSON.parse(e));

        await processor(parsedEvents);

        const lastProcessed = parsedEvents[parsedEvents.length - 1].timestamp;
        await this.redis.zremrangebyscore(campaignKey, 0, lastProcessed);
      }
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    await this.redis.quit();
  }
}

const trackingBuffer = new TrackingBuffer();

export { TrackingBuffer, trackingBuffer };
export type { TrackingEvent };
