import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

interface ABTest {
  campaignId: string;
  name: string;
  variants: ABVariant[];
  status: 'draft' | 'running' | 'completed' | 'paused';
  winner?: string;
  startDate?: Date;
  endDate?: Date;
  metrics: ABMetrics;
}

interface ABVariant {
  id: string;
  name: string;
  subject?: string;
  body?: string;
  html?: string;
  traffic: number;
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
}

interface ABMetrics {
  opens: number;
  clicks: number;
  conversions: number;
  revenue?: number;
}

interface ABTestResult {
  variantId: string;
  metrics: ABMetrics;
  confidence: number;
  winner: boolean;
}

router.post('/ab-tests', async (req: Request, res: Response) => {
  try {
    const { tenantId, campaignId, name, variants, trafficSplit } = req.body;
    
    if (!tenantId || !name || !variants?.length) {
      res.status(400).json({ error: 'tenantId, name, variants required' });
      return;
    }

    if (variants.length < 2 || variants.length > 4) {
      res.status(400).json({ error: '2-4 variants required' });
      return;
    }

    const totalTraffic = variants.reduce((sum, v) => sum + (v.traffic || 25), 0);
    const normalizedVariants = variants.map(v => ({
      ...v,
      id: v.id || `var_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      traffic: Math.round(((v.traffic || 25) / totalTraffic) * 100),
      sent: 0,
      opens: 0,
      clicks: 0,
      bounces: 0
    }));

    const test = await prisma.emailCampaign.create({
      data: {
        tenantId,
        name: `A/B Test: ${name}`,
        subject: `A/B Test: ${name}`,
        body: JSON.stringify({ type: 'ab_test', variants: normalizedVariants }),
        status: 'DRAFT',
        metadata: {
          isABTest: true,
          variants: normalizedVariants,
          trafficSplit: normalizedVariants.map(v => v.traffic),
          createdAt: new Date().toISOString()
        }
      }
    });

    res.json({ success: true, test, variants: normalizedVariants });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ab-tests', async (req: Request, res: Response) => {
  try {
    const { tenantId, status } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const where: any = { 
      tenantId: tenantId as string,
      metadata: { path: ['isABTest'], equals: true }
    };

    const tests = await prisma.emailCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const formatted = tests.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      variants: (t.metadata as any)?.variants || [],
      winner: (t.metadata as any)?.winner
    }));

    res.json({ success: true, tests: formatted });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ab-tests/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    const test = await prisma.emailCampaign.findFirst({
      where: { id, tenantId: tenantId as string }
    });

    if (!test) {
      res.status(404).json({ error: 'A/B test not found' });
      return;
    }

    const variants = (test.metadata as any)?.variants || [];
    
    const results = variants.map((v: any): ABTestResult => {
      const openRate = v.sent > 0 ? (v.opens / v.sent) * 100 : 0;
      const clickRate = v.opens > 0 ? (v.clicks / v.opens) * 100 : 0;
      
      const otherVariants = variants.filter((o: any) => o.id !== v.id);
      let confidence = 0;
      
      if (otherVariants.length > 0) {
        const maxOtherRate = Math.max(...otherVariants.map((o: any) => 
          o.sent > 0 ? (o.opens / o.sent) * 100 : 0
        ));
        confidence = Math.min(100, Math.abs(openRate - maxOtherRate) * 10);
      }

      return {
        variantId: v.id,
        name: v.name,
        metrics: {
          sent: v.sent,
          opens: v.opens,
          clicks: v.clicks,
          openRate: openRate.toFixed(2),
          clickRate: clickRate.toFixed(2)
        },
        confidence: Math.round(confidence),
        winner: confidence > 95
      };
    });

    res.json({ 
      success: true, 
      test: {
        id: test.id,
        name: test.name,
        status: test.status,
        createdAt: test.createdAt,
        sentAt: test.sentAt
      },
      results 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ab-tests/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.body;

    await prisma.emailCampaign.updateMany({
      where: { id, tenantId },
      data: { status: 'SENDING', scheduledAt: new Date() }
    });

    res.json({ success: true, message: 'A/B test started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ab-tests/:id/winner', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, variantId } = req.body;

    const test = await prisma.emailCampaign.findFirst({
      where: { id, tenantId }
    });

    if (!test) {
      res.status(404).json({ error: 'Test not found' });
      return;
    }

    const variants = (test.metadata as any)?.variants || [];
    const winnerVariant = variants.find((v: any) => v.id === variantId);

    if (!winnerVariant) {
      res.status(400).json({ error: 'Variant not found' });
      return;
    }

    await prisma.emailCampaign.updateMany({
      where: { id, tenantId },
      data: {
        status: 'SENT',
        metadata: {
          ...(test.metadata as any),
          winner: variantId,
          completedAt: new Date().toISOString()
        }
      }
    });

    res.json({ success: true, winner: winnerVariant });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function calculateStatisticalSignificance(
  control: ABMetrics,
  variant: ABMetrics
): number {
  const controlOpens = control.opens;
  const variantOpens = variant.opens;
  const controlSent = control.opens + (control.opens * 0.1);
  const variantSent = variant.opens + (variant.opens * 0.1);

  if (controlSent === 0 || variantSent === 0) return 0;

  const p1 = controlOpens / controlSent;
  const p2 = variantOpens / variantSent;
  const p = (controlOpens + variantOpens) / (controlSent + variantSent);
  
  const se = Math.sqrt(p * (1 - p) * (1/controlSent + 1/variantSent));
  
  if (se === 0) return 0;
  
  const z = Math.abs(p1 - p2) / se;
  
  const confidence = (1 - Math.exp(-0.5 * z * z)) * 100;
  
  return Math.min(99.9, Math.round(confidence * 10) / 10);
}

export default router;
export { calculateStatisticalSignificance };
