import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateEmail, validateBatch, isValidEmailFormat } from '../services/emailValidator.js';

const router = Router();
const prisma = new PrismaClient();

router.post('/contacts', async (req: Request, res: Response) => {
  try {
    const { tenantId, contacts } = req.body;
    
    if (!tenantId || !Array.isArray(contacts)) {
      res.status(400).json({ error: 'tenantId and contacts array required' });
      return;
    }

    if (contacts.length === 0) {
      res.status(400).json({ error: 'No contacts provided' });
      return;
    }

    const results = [];
    const seenEmails = new Set<string>();

    for (const contact of contacts) {
      const { firstName, lastName, email, phone, company, tags } = contact;
      
      if (!email || !isValidEmailFormat(email)) {
        results.push({ contact, status: 'skipped', reason: 'invalid email format' });
        continue;
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      if (seenEmails.has(normalizedEmail)) {
        results.push({ contact, status: 'skipped', reason: 'duplicate in batch' });
        continue;
      }
      seenEmails.add(normalizedEmail);

      const validation = await validateEmail(normalizedEmail);
      
      try {
        const saved = await prisma.contact.upsert({
          where: { tenantId_email: { tenantId, email: normalizedEmail } },
          create: {
            tenantId,
            firstName: firstName || '',
            lastName: lastName || '',
            email: normalizedEmail,
            phone: phone || null,
            company: company || null,
            tags: tags || [],
            validity: validation.validity,
            validatedAt: new Date()
          },
          update: {
            firstName: firstName || '',
            lastName: lastName || '',
            phone: phone || null,
            company: company || null,
            tags: tags || [],
            validity: validation.validity,
            validatedAt: new Date()
          }
        });

        results.push({ contact: saved, status: 'saved', validation });
      } catch (dbError: any) {
        results.push({ contact, status: 'error', reason: dbError.message });
      }
    }

    const stats = {
      total: contacts.length,
      saved: results.filter((r: any) => r.status === 'saved').length,
      skipped: results.filter((r: any) => r.status === 'skipped').length,
      errors: results.filter((r: any) => r.status === 'error').length
    };

    res.json({ success: true, results, stats });
  } catch (error: any) {
    console.error('Contact import error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const { tenantId, search, validity, page = '1', limit = '50' } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const where: any = { tenantId: tenantId as string };
    
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { company: { contains: search as string, mode: 'insensitive' } }
      ];
    }
    
    if (validity) {
      where.validity = validity;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        take: parseInt(limit as string),
        skip,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.contact.count({ where })
    ]);

    res.json({
      success: true,
      contacts,
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

router.get('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    const contact = await prisma.contact.findFirst({
      where: { id, tenantId: tenantId as string }
    });

    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    res.json({ success: true, contact });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, ...data } = req.body;

    if (!tenantId || !id) {
      res.status(400).json({ error: 'tenantId and id required' });
      return;
    }

    if (data.email) {
      data.email = data.email.toLowerCase().trim();
      const validation = await validateEmail(data.email);
      data.validity = validation.validity;
    }

    const contact = await prisma.contact.update({
      where: { id },
      data
    });

    res.json({ success: true, contact });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    await prisma.contact.deleteMany({
      where: { id, tenantId: tenantId as string }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails)) {
      res.status(400).json({ error: 'emails array required' });
      return;
    }

    const results = await validateBatch(emails.slice(0, 100));
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { prisma };
