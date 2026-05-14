import { Router, Request, Response } from 'express';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const TRACKING_BUFFER_KEY = 'tracking:events';
const BUFFER_SIZE = 50;
const PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface TrackingEvent {
  id: string;
  type: 'open' | 'click' | 'bounce' | 'unsubscribe' | 'complaint';
  campaignId: string;
  contactId: string;
  email: string;
  url?: string;
  timestamp: number;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, any>;
}

const trackingBuffer: TrackingEvent[] = [];

async function bufferEvent(event: TrackingEvent): Promise<void> {
  trackingBuffer.push(event);
  
  if (trackingBuffer.length >= BUFFER_SIZE) {
    await flushBuffer();
  }
}

async function flushBuffer(): Promise<void> {
  if (trackingBuffer.length === 0) return;
  
  const events = [...trackingBuffer];
  trackingBuffer.length = 0;
  
  const pipeline = redis.multi();
  
  for (const event of events) {
    const key = `tracking:${event.type}:${event.campaignId}`;
    const score = event.timestamp;
    const member = JSON.stringify(event);
    
    pipeline.zadd(key, score, member);
    pipeline.zremrangebyscore(key, 0, Date.now() - (30 * 24 * 60 * 60 * 1000));
    
    pipeline.hincrby('tracking:stats', `${event.campaignId}:${event.type}`, 1);
  }
  
  await pipeline.exec();
}

function generateTrackingPixel(): Buffer {
  return Buffer.from(PIXEL_BASE64, 'base64');
}

const trackingRouter = Router();

trackingRouter.get('/track/open/:campaignId/:contactId', async (req: Request, res: Response) => {
  const { campaignId, contactId } = req.params;
  const email = req.query.email as string;
  
  const event: TrackingEvent = {
    id: uuidv4(),
    type: 'open',
    campaignId,
    contactId,
    email: email || '',
    timestamp: Date.now(),
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  await bufferEvent(event);
  
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(generateTrackingPixel());
});

trackingRouter.get('/track/click/:campaignId/:contactId', async (req: Request, res: Response) => {
  const { campaignId, contactId } = req.params;
  const { url, email } = req.query;
  
  const event: TrackingEvent = {
    id: uuidv4(),
    type: 'click',
    campaignId,
    contactId,
    email: (email as string) || '',
    url: url as string,
    timestamp: Date.now(),
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  await bufferEvent(event);
  
  if (url) {
    res.redirect(url as string);
  } else {
    res.json({ success: true });
  }
});

trackingRouter.get('/track/bounce/:campaignId/:contactId', async (req: Request, res: Response) => {
  const { campaignId, contactId } = req.params;
  const { email, reason } = req.query;
  
  const event: TrackingEvent = {
    id: uuidv4(),
    type: 'bounce',
    campaignId,
    contactId,
    email: (email as string) || '',
    timestamp: Date.now(),
    meta: { reason: reason as string }
  };
  
  await bufferEvent(event);
  
  res.setHeader('Content-Type', 'image/png');
  res.send(generateTrackingPixel());
});

trackingRouter.get('/track/unsubscribe/:campaignId/:contactId', async (req: Request, res: Response) => {
  const { campaignId, contactId } = req.params;
  const { email } = req.query;
  
  const event: TrackingEvent = {
    id: uuidv4(),
    type: 'unsubscribe',
    campaignId,
    contactId,
    email: (email as string) || '',
    timestamp: Date.now(),
    ip: req.ip
  };
  
  await bufferEvent(event);
  
  res.redirect('/unsubscribed');
});

trackingRouter.get('/stats/:campaignId', async (req: Request, res: Response) => {
  const { campaignId } = req.params;
  
  const [opens, clicks, bounces, unsubscribes] = await Promise.all([
    redis.zcard(`tracking:open:${campaignId}`),
    redis.zcard(`tracking:click:${campaignId}`),
    redis.zcard(`tracking:bounce:${campaignId}`),
    redis.zcard(`tracking:unsubscribe:${campaignId}`)
  ]);
  
  const totalSent = await redis.hget('tracking:stats', `${campaignId}:sent`);
  
  res.json({
    campaignId,
    sent: parseInt(totalSent || '0'),
    opens,
    clicks,
    bounces,
    unsubscribes,
    openRate: totalSent ? ((opens / parseInt(totalSent)) * 100).toFixed(2) : 0,
    clickRate: opens ? ((clicks / opens) * 100).toFixed(2) : 0
  });
});

setInterval(flushBuffer, 5000);

export default trackingRouter;
export { trackingRouter, bufferEvent, flushBuffer };
