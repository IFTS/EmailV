import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const router = Router();
const prisma = new PrismaClient();

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

router.post('/ai/generate-content', async (req: Request, res: Response) => {
  try {
    const { type, tone, targetAudience, productInfo, customPrompt } = req.body;

    if (!openai) {
      res.status(503).json({ error: 'OpenAI not configured' });
      return;
    }

    const systemPrompts: Record<string, string> = {
      welcome: `Generate a welcoming welcome email for ${targetAudience}. Keep the tone ${tone}. Product info: ${productInfo}`,
      promotional: `Generate a compelling promotional email for ${targetAudience}. Keep the tone ${tone}. Product info: ${productInfo}`,
      newsletter: `Generate an engaging newsletter for ${targetAudience}. Keep the tone ${tone}. Product info: ${productInfo}`
    };

    const prompt = customPrompt || systemPrompts[type] || systemPrompts.welcome;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Generate a ${type} email, ${tone} tone` }
      ],
      max_tokens: 1000
    });

    const content = completion.choices[0]?.message?.content || '';

    res.json({
      success: true,
      content,
      type,
      tone
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/subject-line', async (req: Request, res: Response) => {
  try {
    const { emailType, productInfo } = req.body;

    if (!openai) {
      res.status(503).json({ error: 'OpenAI not configured' });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `Generate 5 catchy subject lines for a ${emailType} email about ${productInfo}` },
        { role: 'user', content: 'Return only the subject lines, one per line, no numbers' }
      ],
      max_tokens: 300
    });

    const lines = completion.choices[0]?.message?.content?.split('\n').filter(Boolean) || [];

    res.json({ success: true, subjectLines: lines });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/segment', async (req: Request, res: Response) => {
  try {
    const { tenantId, criteria } = req.body;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const where: any = { tenantId };
    
    if (criteria?.validity) where.validity = criteria.validity;
    if (criteria?.status) where.status = criteria.status;
    if (criteria?.hasCompany) where.company = { not: null };
    
    if (criteria?.tags?.length) {
      where.tags = { hasSome: criteria.tags };
    }

    const contacts = await prisma.contact.findMany({ where, take: 1000 });
    
    const segments = {
      all: contacts.length,
      byValidity: {
        valid: contacts.filter(c => c.validity === 'valid').length,
        invalid: contacts.filter(c => c.validity === 'invalid').length,
        risky: contacts.filter(c => c.validity === 'risky').length
      },
      byCompany: contacts.filter(c => c.company).length
    };

    res.json({ success: true, segments, count: contacts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/analyze-performance', async (req: Request, res: Response) => {
  try {
    const { tenantId, campaignId } = req.body;

    if (!tenantId || !campaignId) {
      res.status(400).json({ error: 'tenantId and campaignId required' });
      return;
    }

    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: campaignId, tenantId }
    });

    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const totalSent = (campaign.metadata as any)?.sent || 0;
    const totalOpens = (campaign.metadata as any)?.opens || 0;
    const totalClicks = (campaign.metadata as any)?.clicks || 0;

    const openRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? (totalClicks / totalSent) * 100 : 0;

    let grade = 'F';
    if (openRate > 40 && clickRate > 10) grade = 'A+';
    else if (openRate > 30 && clickRate > 8) grade = 'A';
    else if (openRate > 20 && clickRate > 5) grade = 'B';
    else if (openRate > 15 && clickRate > 3) grade = 'C';
    else if (openRate > 10) grade = 'D';

    res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        sent: totalSent,
        opens: totalOpens,
        clicks: totalClicks,
        openRate: openRate.toFixed(1),
        clickRate: clickRate.toFixed(1),
        grade
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/content-types', (req: Request, res: Response) => {
  res.json({
    success: true,
    types: [
      { key: 'welcome', label: 'Welcome Email' },
      { key: 'promotional', label: 'Promotional' },
      { key: 'newsletter', label: 'Newsletter' },
      { key: 'announcement', label: 'Announcement' },
      { key: 'invitation', label: 'Invitation' },
      { key: 'survey', label: 'Survey' },
      { key: 'onboarding', label: 'Onboarding' },
      { key: 'reengagement', label: 'Re-engagement' }
    ],
    tones: [
      { key: 'professional', label: 'Professional' },
      { key: 'friendly', label: 'Friendly' },
      { key: 'casual', label: 'Casual' },
      { key: 'formal', label: 'Formal' }
    ]
  });
});

export default router;
export { prisma };
