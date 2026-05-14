import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { addEmailToQueue } from '../queue/emailWorker.js';
import { 
  generateStructuredEmailCampaign, 
  generateSubjectLines,
  segmentContacts,
  analyzeEmailPerformance 
} from '../services/aiStructuredOutputs.js';

const router = Router();
const prisma = new PrismaClient();

router.post('/ai/generate-content', async (req: Request, res: Response) => {
  try {
    const { type, tone, context, brandVoice } = req.body;
    
    if (!type || !context) {
      res.status(400).json({ error: 'type and context required' });
      return;
    }

    const startTime = Date.now();

    const result = await generateStructuredEmailCampaign(context, type, tone || 'professional');

    const duration = Date.now() - startTime;

    await prisma.aiAgentLog.create({
      data: {
        tenantId: req.body.tenantId || 'system',
        action: 'generate_content',
        prompt: context,
        response: JSON.stringify(result),
        model: 'gpt-4o-structured',
        status: 'completed',
        tokens: 0,
        duration,
        cost: duration * 0.001
      }
    });

    res.json({
      success: true,
      content: result,
      model: 'gpt-4o-structured',
      duration
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/subject-line', async (req: Request, res: Response) => {
  try {
    const { content, count = 5 } = req.body;
    
    if (!content) {
      res.status(400).json({ error: 'content required' });
      return;
    }

    const subjects = await generateSubjectLines(content, count);

    res.json({
      success: true,
      subjects,
      count: subjects.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/segment', async (req: Request, res: Response) => {
  try {
    const { tenantId, goal } = req.body;
    
    if (!tenantId || !goal) {
      res.status(400).json({ error: 'tenantId and goal required' });
      return;
    }

    const contacts = await prisma.contact.findMany({
      where: { tenantId, status: 'ACTIVE' },
      take: 100,
      select: { id: true, email: true, firstName: true, lastName: true, company: true, tags: true }
    });

    const contactData = contacts.map(c => ({
      email: c.email,
      name: `${c.firstName} ${c.lastName}`.trim(),
      company: c.company || undefined,
      tags: c.tags || []
    }));

    const segmentation = await segmentContacts(contactData, goal);

    res.json({
      success: true,
      segments: segmentation.segments,
      totalContacts: contacts.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/analyze-performance', async (req: Request, res: Response) => {
  try {
    const { campaignId, openRate, clickRate } = req.body;
    
    if (!campaignId) {
      res.status(400).json({ error: 'campaignId required' });
      return;
    }

    const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
    
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const analysis = await analyzeEmailPerformance({
      subject: campaign.subject,
      body: campaign.body,
      openRate,
      clickRate
    });

    res.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/create-campaign', async (req: Request, res: Response) => {
  try {
    const { tenantId, campaignName, type, tone, context, targetAudience, goal } = req.body;
    
    if (!tenantId || !campaignName || !context) {
      res.status(400).json({ error: 'tenantId, campaignName, and context required' });
      return;
    }

    const startTime = Date.now();

    const log = await prisma.aiAgentLog.create({
      data: {
        tenantId,
        action: 'create_campaign',
        prompt: context,
        status: 'processing'
      }
    });

    const contacts = await prisma.contact.findMany({
      where: { tenantId, validity: 'valid', status: 'ACTIVE' },
      take: 100
    });

    const result = await generateStructuredEmailCampaign(context, type || 'promotional', tone || 'professional');

    const campaign = await prisma.emailCampaign.create({
      data: {
        tenantId,
        name: campaignName,
        subject: result.subject,
        preheader: result.preheader,
        body: result.body,
        html: result.html,
        status: 'DRAFT'
      }
    });

    const duration = Date.now() - startTime;

    await prisma.aiAgentLog.update({
      where: { id: log.id },
      data: {
        response: JSON.stringify({ campaignId: campaign.id, subject: result.subject }),
        status: 'completed',
        tokens: 0,
        duration,
        cost: duration * 0.001
      }
    });

    res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status
      },
      content: result,
      contactsProcessed: contacts.length,
      duration
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/send-campaign', async (req: Request, res: Response) => {
  try {
    const { tenantId, campaignId, fromEmail, scheduleAt } = req.body;
    
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

    const contacts = await prisma.contact.findMany({
      where: { tenantId, validity: 'valid', status: 'ACTIVE' },
      take: 500
    });

    const sender = fromEmail || 'onboarding@resend.dev';

    for (const contact of contacts) {
      const personalizedHtml = (campaign.html || campaign.body || '')
        .replace(/{{firstName}}/gi, contact.firstName || '')
        .replace(/{{lastName}}/gi, contact.lastName || '')
        .replace(/{{email}}/gi, contact.email || '')
        .replace(/{{company}}/gi, contact.company || '');

      await addEmailToQueue({
        tenantId,
        campaignId,
        recipientEmail: contact.email,
        subject: campaign.subject,
        body: campaign.body || '',
        html: personalizedHtml,
        fromEmail: sender
      });
    }

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' }
    });

    res.json({
      success: true,
      queued: contacts.length,
      campaign: campaignId
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/content-types', (req: Request, res: Response) => {
  res.json({
    success: true,
    types: [
      { key: 'welcome', label: 'Welcome Email', description: 'Onboarding emails for new subscribers' },
      { key: 'promotional', label: 'Promotional', description: 'Sales and offers' },
      { key: 'newsletter', label: 'Newsletter', description: 'Regular updates and content' },
      { key: 'announcement', label: 'Announcement', description: 'Product/feature announcements' },
      { key: 'followup', label: 'Follow-up', description: 'Nurture sequences' },
      { key: 'confirmation', label: 'Confirmation', description: 'Order confirmations' },
      { key: 'reengagement', label: 'Re-engagement', description: 'Win back inactive users' },
      { key: 'survey', label: 'Survey', description: 'Feedback requests' }
    ],
    tones: [
      { key: 'professional', label: 'Professional' },
      { key: 'friendly', label: 'Friendly' },
      { key: 'casual', label: 'Casual' },
      { key: 'excited', label: 'Excited' },
      { key: 'empathetic', label: 'Empathetic' }
    ]
  });
});

router.get('/ai/logs', async (req: Request, res: Response) => {
  try {
    const { tenantId, page = '1', limit = '20' } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [logs, total] = await Promise.all([
      prisma.aiAgentLog.findMany({
        where: { tenantId: tenantId as string },
        take: parseInt(limit as string),
        skip,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.aiAgentLog.count({ where: { tenantId: tenantId as string } })
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { prisma };
