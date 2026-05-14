import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmail, configureSMTP } from '../services/smtpSender.js';

const router = Router();
const prisma = new PrismaClient();

router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, subject, body, html, category, variables } = req.body;
    
    if (!tenantId || !name) {
      res.status(400).json({ error: 'tenantId and name required' });
      return;
    }

    const template = await prisma.emailCampaign.create({
      data: {
        tenantId,
        name,
        subject: subject || '',
        body: body || '',
        html: html || body || '',
        status: 'DRAFT',
        metadata: { category, variables }
      }
    });

    res.json({ success: true, template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { tenantId, category, page = '1', limit = '20' } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const where: any = { tenantId: tenantId as string };

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    const skip = (pageNum - 1) * limitNum;

    const [templates, total] = await Promise.all([
      prisma.emailCampaign.findMany({
        where,
        take: limitNum,
        skip,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.emailCampaign.count({ where })
    ]);

    res.json({
      success: true,
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        preview: t.body?.substring(0, 100),
        category: (t.metadata as any)?.category,
        createdAt: t.createdAt
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    const template = await prisma.emailCampaign.findFirst({
      where: { id, tenantId: tenantId as string }
    });

    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ success: true, template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, name, subject, body, html, category, variables } = req.body;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const template = await prisma.emailCampaign.updateMany({
      where: { id, tenantId },
      data: {
        name: name || undefined,
        subject: subject || undefined,
        body: body || undefined,
        html: html || undefined,
        metadata: { category, variables },
        updatedAt: new Date()
      }
    });

    if (template.count === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    await prisma.emailCampaign.deleteMany({
      where: { id, tenantId: tenantId as string }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/smtp', async (req: Request, res: Response) => {
  try {
    const { tenantId, host, port, secure, username, password, from, fromName } = req.body;
    
    if (!tenantId || !host || !username) {
      res.status(400).json({ error: 'tenantId, host, username required' });
      return;
    }

    configureSMTP(tenantId, {
      host,
      port: port || 587,
      secure: secure || false,
      auth: { user: username, pass: password || '' },
      from,
      fromName
    });

    await prisma.tenantSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        spfDomain: host,
        fromEmail: from || username,
        fromName: fromName || 'EmailV Pro'
      },
      update: {
        spfDomain: host,
        fromEmail: from || username,
        fromName: fromName || 'EmailV Pro'
      }
    });

    res.json({ success: true, message: 'SMTP configured' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/smtp', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const settings = await prisma.tenantSetting.findUnique({
      where: { tenantId: tenantId as string }
    });

    res.json({
      success: true,
      smtp: {
        configured: !!settings?.spfDomain,
        host: settings?.spfDomain || null,
        from: settings?.fromEmail || null,
        fromName: settings?.fromName || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/smtp/test', async (req: Request, res: Response) => {
  try {
    const { tenantId, testEmail } = req.body;
    
    if (!tenantId || !testEmail) {
      res.status(400).json({ error: 'tenantId and testEmail required' });
      return;
    }

    const result = await sendEmail(tenantId, {
      to: testEmail,
      subject: 'EmailV Pro SMTP Test',
      body: 'This is a test email from EmailV Pro SMTP configuration.'
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/smtp', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { prisma };
