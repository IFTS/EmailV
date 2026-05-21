import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateEmail, validateBatch, isValidEmailFormat } from '../services/emailValidator.js';
import { validateEmailFull } from '../services/externalValidator.js';

const router = Router();
const prisma = new PrismaClient();

router.post('/contacts', async (req: Request, res: Response) => {
  try {
    const { tenantId, contacts, validate = true, deduplicate = true } = req.body;
    
    if (!tenantId || !Array.isArray(contacts)) {
      res.status(400).json({ error: 'tenantId and contacts array required' });
      return;
    }

    const results: any[] = [];
    const seenEmails = new Set<string>();

    for (const contact of contacts) {
      const { firstName, lastName, email, phone, company, tags, notes, favorite } = contact;
      
      if (!email || !isValidEmailFormat(email)) {
        results.push({ contact: { email }, status: 'skipped', reason: 'invalid email format' });
        continue;
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      if (deduplicate) {
        if (seenEmails.has(normalizedEmail)) {
          results.push({ contact: { email: normalizedEmail }, status: 'skipped', reason: 'duplicate in batch' });
          continue;
        }
        seenEmails.add(normalizedEmail);
      }

      let validity = 'unknown';
      let validityDtls: any = {};

      if (validate) {
        try {
          const validation = await validateEmail(normalizedEmail);
          validity = validation.validity;
          validityDtls = validation;
        } catch (e) {
          validity = 'unknown';
        }
      }

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
            metadata: { notes: notes || '', favorite: favorite || false },
            validity,
            updatedAt: new Date()
          },
          update: {
            firstName: firstName || '',
            lastName: lastName || '',
            phone: phone || null,
            company: company || null,
            tags: tags || [],
            metadata: { notes: notes || '', favorite: favorite || false },
            validity,
            updatedAt: new Date()
          }
        });

        results.push({ contact: saved, status: 'saved', validation: validityDtls });
      } catch (dbError: any) {
        results.push({ contact: { email: normalizedEmail }, status: 'error', reason: dbError.message });
      }
    }

    const stats = {
      total: contacts.length,
      saved: results.filter((r) => r.status === 'saved').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length
    };

    res.json({ success: true, results, stats });
  } catch (error: any) {
    console.error('Contact import error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const { tenantId, search, validity, page = '1', limit = '50', sort = 'createdAt', order = 'desc' } = req.query;
    
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
    
    if (validity) where.validity = validity;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);
    const skip = (pageNum - 1) * limitNum;

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        take: limitNum,
        skip,
        orderBy: { [sort as string]: order as 'asc' | 'desc' }
      }),
      prisma.contact.count({ where })
    ]);

    res.json({
      success: true,
      contacts,
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
    const { tenantId, firstName, lastName, email, phone, company, tags, notes, favorite } = req.body;

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email?.toLowerCase() || undefined,
        phone: phone || undefined,
        company: company || undefined,
        tags: tags || undefined,
        metadata: { notes: notes || '', favorite: favorite || false },
        updatedAt: new Date()
      }
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

router.post('/contacts/bulk-edit', async (req: Request, res: Response) => {
  try {
    const { tenantId, contactIds, action, data } = req.body;
    
    if (!tenantId || !Array.isArray(contactIds) || !action) {
      res.status(400).json({ error: 'tenantId, contactIds, action required' });
      return;
    }

    let count = 0;
    
    switch (action) {
      case 'add_tags':
        const newTags = data?.tags || [];
        for (const id of contactIds) {
          const contact = await prisma.contact.findFirst({ where: { id, tenantId } });
          if (contact) {
            const existing = contact.tags || [];
            await prisma.contact.update({
              where: { id },
              data: { tags: [...new Set([...existing, ...newTags])] }
            });
            count++;
          }
        }
        break;
        
      case 'remove_tags':
        const removeTags = data?.tags || [];
        for (const id of contactIds) {
          const contact = await prisma.contact.findFirst({ where: { id, tenantId } });
          if (contact) {
            const tags = (contact.tags || []).filter((t) => !removeTags.includes(t));
            await prisma.contact.update({ where: { id }, data: { tags } });
            count++;
          }
        }
        break;
        
      case 'delete':
        const del = await prisma.contact.deleteMany({
          where: { id: { in: contactIds }, tenantId }
        });
        count = del.count;
        break;
        
      case 'validate':
        for (const id of contactIds) {
          const contact = await prisma.contact.findFirst({ where: { id, tenantId } });
          if (contact) {
            try {
              const validation = await validateEmailFull(contact.email);
              await prisma.contact.update({
                where: { id },
                data: { 
                  validity: validation.result,
                  validityDtls: validation,
                  updatedAt: new Date()
                }
              });
              count++;
            } catch (e) {
              // Skip failed validations
            }
          }
        }
        break;
        
      default:
        res.status(400).json({ error: 'Invalid action' });
        return;
    }

    res.json({ success: true, count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts/duplicates', async (req: Request, res: Response) => {
  try {
    const { tenantId, matchBy = 'email' } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const contacts = await prisma.contact.findMany({
      where: { tenantId: tenantId as string },
      select: { id: true, email: true, firstName: true, lastName: true, company: true }
    });

    const duplicates: any[] = [];
    const seen = new Map<string, any[]>();

    for (const contact of contacts) {
      let key = '';
      if (matchBy === 'email') {
        key = contact.email?.toLowerCase() || '';
      } else {
        key = `${(contact.firstName || '').toLowerCase()}-${(contact.lastName || '').toLowerCase()}`;
      }
      
      if (!key) continue;
      
      if (seen.has(key)) {
        duplicates.push({ key, contacts: [contact, ...seen.get(key)] });
      } else {
        seen.set(key, [contact]);
      }
    }

    res.json({
      success: true,
      duplicates: duplicates.filter((d) => d.contacts.length > 1),
      count: duplicates.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contacts/merge', async (req: Request, res: Response) => {
  try {
    const { tenantId, keepContactId, mergeContactIds } = req.body;
    
    if (!tenantId || !keepContactId || !Array.isArray(mergeContactIds)) {
      res.status(400).json({ error: 'tenantId, keepContactId, mergeContactIds required' });
      return;
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: mergeContactIds }, tenantId }
    });

    const keepContact = await prisma.contact.findFirst({ where: { id: keepContactId, tenantId } });
    
    if (!keepContact) {
      res.status(404).json({ error: 'Keep contact not found' });
      return;
    }
    
    let mergedTags = new Set(keepContact.tags || []);
    let existingNotes = (keepContact.metadata as any)?.notes || '';
    let favorite = (keepContact.metadata as any)?.favorite || false;

    for (const contact of contacts) {
      if (contact.tags) contact.tags.forEach((t) => mergedTags.add(t));
      const notes = (contact.metadata as any)?.notes || '';
      if (notes && !existingNotes.includes(notes)) {
        existingNotes = existingNotes + '\n' + notes;
      }
      if ((contact.metadata as any)?.favorite) favorite = true;
    }

    await prisma.contact.update({
      where: { id: keepContactId },
      data: {
        tags: Array.from(mergedTags),
        metadata: { notes: existingNotes, favorite },
        updatedAt: new Date()
      }
    });

    await prisma.contact.deleteMany({
      where: { id: { in: mergeContactIds }, tenantId }
    });

    res.json({ success: true, merged: keepContactId, removed: mergeContactIds.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tags', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }
    
    const contacts = await prisma.contact.findMany({
      where: { tenantId: tenantId as string },
      select: { tags: true }
    });
    
    const allTags = new Map<string, number>();
    contacts.forEach((c) => {
      (c.tags || []).forEach((t: string) => {
        allTags.set(t, (allTags.get(t) || 0) + 1);
      });
    });
    
    res.json({ 
      success: true, 
      tags: Array.from(allTags.entries()).map(([name, count]) => ({ name, count })) 
    });
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

    const limitedEmails = emails.slice(0, 100);
    const results = await validateBatch(limitedEmails);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/groups', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const groups = await prisma.contact.findMany({
      where: { 
        tenantId: tenantId as string, 
        metadata: { path: ['isGroup'], equals: true } 
      }
    });
    
    res.json({ success: true, groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { prisma };
