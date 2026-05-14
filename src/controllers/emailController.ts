import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendEmail, configureSMTP, testSMTPConnection } from '../services/smtpSender.js';

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
    if (category) where.metadata = { category };

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [templates, total] = await Promise.all([
      prisma.emailCampaign.findMany({
        where,
        take: parseInt(limit as string),
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

    const template = await prisma.emailCampaign.update({
      where: { id },
      data: {
        name: name || undefined,
        subject: subject || undefined,
        body: body || undefined,
        html: html || undefined,
        metadata: { category, variables }
      }
    });

    res.json({ success: true, template });
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

router.post('/templates/:id/preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, variables } = req.body;

    const template = await prisma.emailCampaign.findUnique({ where: { id } });
    
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    let previewBody = template.body || '';
    let previewHtml = template.html || '';
    
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        previewBody = previewBody.replace(regex, String(value));
        previewHtml = previewHtml.replace(regex, String(value));
      });
    }

    res.json({
      success: true,
      preview: { subject: template.subject, body: previewBody, html: previewHtml }
    });
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
      auth: { user: username, pass: password },
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
    
    removeSMTPConfig(tenantId as string);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/send-test', async (req: Request, res: Response) => {
  try {
    const { tenantId, to, subject, body } = req.body;
    
    if (!tenantId || !to || !subject || !body) {
      res.status(400).json({ error: 'tenantId, to, subject, body required' });
      return;
    }

    const result = await sendEmail(tenantId, { to, subject, body });
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { prisma };
