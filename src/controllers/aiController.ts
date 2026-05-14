import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { addEmailToQueue } from '../queue/emailWorker.js';

const router = Router();
const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

interface CampaignContext {
  context: string;
  tone: string;
  type: string;
  contacts: Array<{ firstName: string; lastName: string; email: string; company: string }>;
}

router.post('/ai/generate-content', async (req: Request, res: Response) => {
  try {
    const { type, tone, context } = req.body;
    
    if (!type || !context) {
      res.status(400).json({ error: 'type and context required' });
      return;
    }

    const typeContext: Record<string, string> = {
      welcome: 'Write a warm welcome email',
      promotional: 'Write a promotional email with a compelling offer',
      followup: 'Write a friendly follow-up email',
      newsletter: 'Write an engaging newsletter',
      confirmation: 'Write a clear confirmation email'
    };

    const toneContext: Record<string, string> = {
      friendly: 'Use a friendly, casual tone',
      professional: 'Use a professional, business tone',
      casual: 'Use a casual, relaxed tone',
      formal: 'Use a formal, elegant tone'
    };

    const systemPrompt = `${typeContext[type] || typeContext.welcome}. ${toneContext[tone] || toneContext.friendly}. The email should be concise, well-structured, and have a clear call-to-action.`;

    const userPrompt = `Context: ${context}\n\nGenerate email content with subject line and HTML body.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    res.json({
      success: true,
      content: parsed,
      tokens: completion.usage?.total_tokens || 0
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/create-campaign', async (req: Request, res: Response) => {
  try {
    const { tenantId, context, tone, type, campaignName } = req.body as CampaignContext;
    
    if (!tenantId || !context || !campaignName) {
      res.status(400).json({ error: 'tenantId, context, and campaignName required' });
      return;
    }

    const log = await prisma.aiAgentLog.create({
      data: {
        tenantId,
        action: 'create_campaign',
        prompt: context,
        status: 'pending'
      }
    });

    const contacts = await prisma.contact.findMany({
      where: { tenantId, validity: 'valid' },
      take: 100
    });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Generate a marketing email campaign. Output JSON with subject and body fields.' },
        { role: 'user', content: `Create a ${type || 'promotional'} email for: ${context}. Contact names: ${contacts.map(c => c.firstName).join(', ')}` }
      ],
      response_format: { type: 'json_object' }
    });

    const emailContent = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    const campaign = await prisma.emailCampaign.create({
      data: {
        tenantId,
        name: campaignName,
        subject: emailContent.subject || 'Newsletter',
        body: emailContent.body || context,
        status: 'draft'
      }
    });

    await prisma.aiAgentLog.update({
      where: { id: log.id },
      data: {
        response: JSON.stringify({ campaignId: campaign.id }),
        status: 'completed',
        tokens: completion.usage?.total_tokens || 0
      }
    });

    res.json({
      success: true,
      campaign,
      contactsProcessed: contacts.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/send-campaign', async (req: Request, res: Response) => {
  try {
    const { tenantId, campaignId, fromEmail } = req.body;
    
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
      where: { tenantId, validity: 'valid' },
      take: 500
    });

    for (const contact of contacts) {
      await addEmailToQueue({
        tenantId,
        campaignId,
        recipientEmail: contact.email,
        subject: campaign.subject,
        body: campaign.body.replace('{{name}}', contact.firstName).replace('{{email}}', contact.email),
        fromEmail: fromEmail || 'onboarding@resend.dev'
      });
    }

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'queued' }
    });

    res.json({
      success: true,
      queued: contacts.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
