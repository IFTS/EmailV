import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { addEmailToQueue } from '../queue/emailWorker.js';

const router = Router();
const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

const CONTENT_TYPES = {
  welcome: { system: 'Write a warm, welcoming onboarding email', category: 'onboarding' },
  promotional: { system: 'Write a compelling promotional email with a clear offer', category: 'promotional' },
  newsletter: { system: 'Write an engaging newsletter with valuable content', category: 'newsletter' },
  announcement: { system: 'Write an exciting product/service announcement', category: 'announcement' },
  followup: { system: 'Write a friendly follow-up email to nurture relationships', category: 'nurture' },
  confirmation: { system: 'Write a clear confirmation email with details', category: 'transactional' },
  reengagement: { system: 'Write a re-engagement email to win back inactive users', category: 'retention' },
  survey: { system: 'Write a polite request for feedback or survey participation', category: 'feedback' }
};

const TONES = {
  friendly: 'Use a warm, conversational tone that feels like a friend',
  professional: 'Use a polished, business-appropriate tone',
  casual: 'Use a relaxed, informal tone',
  formal: 'Use a dignified, authoritative tone',
  excited: 'Use an enthusiastic, energetic tone',
  empathetic: 'Use a caring, understanding tone'
};

interface GenerateContentInput {
  type: string;
  tone: string;
  context: string;
  brandVoice?: string;
  maxLength?: number;
}

interface CreateCampaignInput {
  tenantId: string;
  campaignName: string;
  type: string;
  tone: string;
  context: string;
  targetAudience?: string;
  goal?: string;
}

router.post('/ai/generate-content', async (req: Request, res: Response) => {
  try {
    const { type, tone, context, brandVoice, maxLength = 500 } = req.body as GenerateContentInput;
    
    if (!type || !context) {
      res.status(400).json({ error: 'type and context required' });
      return;
    }

    const typeConfig = CONTENT_TYPES[type] || CONTENT_TYPES.promotional;
    const toneConfig = TONES[tone] || TONES.friendly;
    
    const startTime = Date.now();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `${typeConfig.system}. ${toneConfig}. Keep the email under ${maxLength} words.` },
        { role: 'user', content: `Context/Topic: ${context}${brandVoice ? `\n\nBrand Voice: ${brandVoice}` : ''}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500
    });

    const duration = Date.now() - startTime;
    const content = JSON.parse(completion.choices[0]?.message?.content || '{}');

    await prisma.aiAgentLog.create({
      data: {
        tenantId: req.body.tenantId || 'system',
        action: 'generate_content',
        prompt: context,
        response: JSON.stringify(content),
        model: 'gpt-4o',
        status: 'completed',
        tokens: completion.usage?.total_tokens || 0,
        duration,
        cost: (completion.usage?.total_tokens || 0) * 0.00001
      }
    });

    res.json({
      success: true,
      content,
      model: 'gpt-4o',
      tokens: completion.usage?.total_tokens,
      duration,
      category: typeConfig.category
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/subject-line', async (req: Request, res: Response) => {
  try {
    const { subject, body, count = 5 } = req.body;
    
    if (!subject || !body) {
      res.status(400).json({ error: 'subject and body required' });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `Generate ${count} alternative subject lines. Be creative but relevant.` },
        { role: 'user', content: `Current subject: ${subject}\nEmail body preview: ${body.slice(0, 500)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 500
    });

    const subjects = JSON.parse(completion.choices[0]?.message?.content || '{}');

    res.json({
      success: true,
      subjects: subjects.subjectLines || [],
      tokens: completion.usage?.total_tokens
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/send-time', async (req: Request, res: Response) => {
  try {
    const { tenantId, contactIds } = req.body;
    
    const contacts = await prisma.contact.findMany({
      where: { 
        tenantId, 
        id: { in: contactIds },
        status: 'ACTIVE'
      },
      select: { id: true, email: true }
    });

    const sendTimes: Record<string, string> = {};
    
    for (const contact of contacts) {
      const domains = contact.email.split('@')[1]?.split('.');
      const tld = domains?.[domains.length - 1];
      
      if (['com', 'net', 'org'].includes(tld)) {
        sendTimes[contact.id] = '09:00:00';
      } else if (['co', 'uk'].includes(tld)) {
        sendTimes[contact.id] = '14:00:00';
      } else {
        sendTimes[contact.id] = '08:00:00';
      }
    }

    res.json({
      success: true,
      sendTimes,
      optimized: contacts.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/create-campaign', async (req: Request, res: Response) => {
  try {
    const { tenantId, campaignName, type, tone, context, targetAudience, goal } = req.body as CreateCampaignInput;
    
    if (!tenantId || !campaignName || !context) {
      res.status(400).json({ error: 'tenantId, campaignName, and context required' });
      return;
    }

    const startTime = Date.now();

    const typeConfig = CONTENT_TYPES[type] || CONTENT_TYPES.promotional;
    const toneConfig = TONES[tone] || TONES.friendly;

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
      take: 100,
      select: { id: true, firstName: true, lastName: true, email: true, company: true }
    });

    const audienceContext = targetAudience 
      ? `\nTarget audience: ${targetAudience}` 
      : contacts.length > 0 
        ? `\nContacts: ${contacts.map(c => c.firstName).slice(0, 5).join(', ')}` 
        : '';
    
    const goalContext = goal ? `\nGoal: ${goal}` : '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `${typeConfig.system}. ${toneConfig}. Output JSON with subject, preheader, body, and html fields. Use personalization tokens {{firstName}}` },
        { role: 'user', content: `Campaign name: ${campaignName}\nContext: ${context}${audienceContext}${goalContext}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000
    });

    const duration = Date.now() - startTime;
    const emailContent = JSON.parse(completion.choices[0]?.message?.content || '{}');

    const campaign = await prisma.emailCampaign.create({
      data: {
        tenantId,
        name: campaignName,
        subject: emailContent.subject || campaignName,
        preheader: emailContent.preheader || '',
        body: emailContent.body || emailContent.text || context,
        html: emailContent.html || `<body><p>${emailContent.body || context}</p></body>`,
        status: 'DRAFT'
      }
    });

    await prisma.aiAgentLog.update({
      where: { id: log.id },
      data: {
        response: JSON.stringify({ campaignId: campaign.id, subject: emailContent.subject }),
        status: 'completed',
        tokens: completion.usage?.total_tokens || 0,
        duration,
        cost: (completion.usage?.total_tokens || 0) * 0.00001
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
      contactsProcessed: contacts.length,
      tokens: completion.usage?.total_tokens,
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
      const personalizedBody = (campaign.body || '')
        .replace(/{{firstName}}/gi, contact.firstName || '')
        .replace(/{{lastName}}/gi, contact.lastName || '')
        .replace(/{{email}}/gi, contact.email || '')
        .replace(/{{company}}/gi, contact.company || '');
      
      const personalizedHtml = (campaign.html || '')
        .replace(/{{firstName}}/gi, contact.firstName || '')
        .replace(/{{lastName}}/gi, contact.lastName || '')
        .replace(/{{email}}/gi, contact.email || '')
        .replace(/{{company}}/gi, contact.company || '');

      await addEmailToQueue({
        tenantId,
        campaignId,
        recipientEmail: contact.email,
        subject: campaign.subject,
        body: campaign.html || campaign.body,
        fromEmail: sender
      });
    }

    const updateData: any = { status: 'SENDING' };
    if (scheduleAt) updateData.scheduledAt = new Date(scheduleAt);

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: updateData
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

router.get('/ai/content-types', (req: res) => {
  res.json({
    success: true,
    types: Object.entries(CONTENT_TYPES).map(([key, value]) => ({
      key,
      ...value
    })),
    tones: Object.entries(TONES).map(([key, value]) => ({
      key,
      description: value
    }))
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
export { CONTENT_TYPES, TONES };
