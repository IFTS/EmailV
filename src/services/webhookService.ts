import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import axios from 'axios';

const router = Router();
const prisma = new PrismaClient();

interface WebhookEvent {
  id: string;
  type: 'email.sent' | 'email.opened' | 'email.clicked' | 'email.bounced' | 'email.unsubscribed' | 'contact.created' | 'contact.updated' | 'campaign.started' | 'campaign.completed';
  timestamp: Date;
  data: Record<string, any>;
}

interface WebhookConfig {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  headers?: Record<string, string>;
}

const webhookQueue: WebhookEvent[] = [];
const MAX_QUEUE = 100;

export async function triggerWebhook(
  tenantId: string,
  event: WebhookEvent['type'],
  data: Record<string, any>
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { tenantId, active: true }
  });

  const matchingWebhooks = webhooks.filter(w => 
    w.events.includes(event) || w.events.includes('*')
  );

  const webhookEvent: WebhookEvent = {
    id: `evt_${Date.now()}_${randomBytes(4).toString('hex')}`,
    type: event,
    timestamp: new Date(),
    data
  };

  for (const webhook of matchingWebhooks) {
    await sendWebhook(webhook, webhookEvent);
  }
}

async function sendWebhook(webhook: any, event: WebhookEvent): Promise<void> {
  const payload = JSON.stringify(event);
  const signature = generateSignature(payload, webhook.secret);

  try {
    await axios.post(webhook.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event.type,
        'X-Webhook-ID': webhook.id,
        ...webhook.headers
      },
      timeout: 5000
    });
  } catch (error: any) {
    console.error(`Webhook ${webhook.id} failed:`, error.message);
    await logWebhookAttempt(webhook.id, event.id, 'failed', error.message);
  }
}

function generateSignature(payload: string, secret: string): string {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

async function logWebhookAttempt(
  webhookId: string,
  eventId: string,
  status: string,
  error?: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: 'system',
      action: 'webhook_attempt',
      resource: 'webhook',
      resourceId: webhookId,
      details: { eventId, status, error }
    }
  });
}

router.post('/webhooks', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, url, events, headers, active = true } = req.body;

    if (!tenantId || !name || !url || !events?.length) {
      res.status(400).json({ error: 'tenantId, name, url, events required' });
      return;
    }

    const secret = randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        tenantId,
        name,
        url,
        events,
        secret,
        active,
        headers: headers || {}
      }
    });

    res.json({ 
      success: true, 
      webhook: {
        ...webhook,
        secret: secret
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const webhooks = await prisma.webhook.findMany({
      where: { tenantId: tenantId as string }
    });

    const formatted = webhooks.map(w => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: w.events,
      active: w.active,
      createdAt: w.createdAt
    }));

    res.json({ success: true, webhooks: formatted });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, name, url, events, headers, active } = req.body;

    const webhook = await prisma.webhook.updateMany({
      where: { id, tenantId },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(events && { events }),
        ...(headers && { headers }),
        ...(active !== undefined && { active })
      }
    });

    if (webhook.count === 0) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    await prisma.webhook.deleteMany({
      where: { id, tenantId: tenantId as string }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/webhooks/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.body;

    const webhook = await prisma.webhook.findFirst({
      where: { id, tenantId }
    });

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    const testEvent: WebhookEvent = {
      id: `test_${Date.now()}`,
      type: 'email.sent',
      timestamp: new Date(),
      data: { test: true, message: 'This is a test webhook event' }
    };

    await sendWebhook(webhook, testEvent);

    res.json({ success: true, message: 'Test event sent' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { triggerWebhook };
