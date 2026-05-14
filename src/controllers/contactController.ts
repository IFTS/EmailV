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

    const results = [];
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (const contact of contacts) {
      const { firstName, lastName, email, phone, company, tags, groupIds, notes, favorite } = contact;
      
      if (!email || !isValidEmailFormat(email)) {
        results.push({ contact, status: 'skipped', reason: 'invalid email format' });
        continue;
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      if (deduplicate) {
        if (seenEmails.has(normalizedEmail)) {
          results.push({ contact, status: 'skipped', reason: 'duplicate in batch' });
          continue;
        }
        seenEmails.add(normalizedEmail);
      }

      let validity = 'unknown';
      let validityDtls = {};

      if (validate) {
        const validation = await validateEmail(normalizedEmail);
        validity = validation.validity;
        validityDtls = validation;
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
            metadata: { notes, favorite: favorite || false },
            validity,
            validatedAt: new Date()
          },
          update: {
            firstName: firstName || '',
            lastName: lastName || '',
            phone: phone || null,
            company: company || null,
            tags: tags || [],
            metadata: { notes, favorite: favorite || false },
            validity,
            validatedAt: new Date()
          }
        });

        results.push({ contact: saved, status: 'saved', validation: validityDtls });
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

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        take: parseInt(limit as string),
        skip,
        orderBy: { [sort as string]: order as 'asc' | 'desc' }
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

router.post('/contacts/bulk-edit', async (req: Request, res: Response) => {
  try {
    const { tenantId, contactIds, action, data } = req.body;
    
    if (!tenantId || !Array.isArray(contactIds) || !action) {
      res.status(400).json({ error: 'tenantId, contactIds, action required' });
      return;
    }

    let updateData: any = {};
    
    switch (action) {
      case 'add_tags':
        const contacts = await prisma.contact.findMany({
          where: { id: { in: contactIds }, tenantId
        });
        const newTags = data.tags || [];
        for (const contact of contacts) {
          const existing = contact.tags || [];
          await prisma.contact.update({
            where: { id: contact.id },
            data: { tags: [...new Set([...existing, ...newTags])] }
          });
        }
        updateData = { count: contacts.length };
        break;
        
      case 'remove_tags':
        for (const id of contactIds) {
          const contact = await prisma.contact.findUnique({ where: { id } });
          if (contact) {
            const tags = (contact.tags || []).filter((t: string) => !(data.tags || []).includes(t));
            await prisma.contact.update({ where: { id }, data: { tags } });
          }
        }
        updateData = { count: contactIds.length };
        break;
        
      case 'delete':
        await prisma.contact.deleteMany({
          where: { id: { in: contactIds }, tenantId
        });
        updateData = { count: contactIds.length };
        break;
        
      case 'validate':
        for (const id of contactIds) {
          const contact = await prisma.contact.findUnique({ where: { id } });
          if (contact) {
            const validation = await validateEmailFull(contact.email);
            await prisma.contact.update({
              where: { id },
              data: { 
                validity: validation.result,
                validityDtls: validation,
                validatedAt: new Date()
              }
            });
          }
        }
        updateData = { count: contactIds.length };
        break;
        
      default:
        res.status(400).json({ error: 'Invalid action' });
        return;
    }

    res.json({ success: true, ...updateData });
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
      duplicates: duplicates.filter(d => d.contacts.length > 1),
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
      where: { id: { in: mergeContactIds }, tenantId
    });

    const keepContact = await prisma.contact.findUnique({ where: { id: keepContactId } });
    
    const mergedTags = new Set(keepContact?.tags || []);
    const mergedNotes = (keepContact?.metadata as any)?.notes || '';
    let favorite = (keepContact?.metadata as any)?.favorite || false;

    for (const contact of contacts) {
      if (contact.tags) contact.tags.forEach((t: string) => mergedTags.add(t));
      const notes = (contact.metadata as any)?.notes || '';
      if (notes && !mergedNotes.includes(notes)) {
        mergedNotes += '\n' + notes;
      }
      if ((contact.metadata as any)?.favorite) favorite = true;
    }

    await prisma.contact.update({
      where: { id: keepContactId },
      data: {
        tags: Array.from(mergedTags),
        metadata: { notes: mergedNotes, favorite }
      }
    });

    await prisma.contact.deleteMany({
      where: { id: { in: mergeContactIds }, tenantId
    });

    res.json({ success: true, merged: keepContactId, removed: mergeContactIds.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contacts/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId, type, description } = req.body;

    const activity = await prisma.auditLog.create({
      data: {
        tenantId,
        userId: id,
        action: type,
        resource: 'contact_activity',
        details: { contactId: id, description }
      }
    });

    res.json({ success: true, activity });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    const activities = await prisma.auditLog.findMany({
      where: { tenantId: tenantId as string, userId: id, resource: 'contact_activity' },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ success: true, activities });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contacts/import-history', async (req: Request, res: Response) => {
  try {
    const { tenantId, fileName, stats } = req.body;

    const importRecord = await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'import',
        resource: 'contacts',
        details: { fileName, stats, importedAt: new Date() }
      }
    });

    res.json({ success: true, import: importRecord });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts/import-history', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;

    const imports = await prisma.auditLog.findMany({
      where: { tenantId: tenantId as string, action: 'import', resource: 'contacts' },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ success: true, imports });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contacts/backup', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;

    const contacts = await prisma.contact.findMany({ where: { tenantId } });
    const campaigns = await prisma.emailCampaign.findMany({ where: { tenantId } });

    const backup = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      contacts,
      campaigns
    };

    res.json({ success: true, backup, count: contacts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/contacts/restore', async (req: Request, res: Response) => {
  try {
    const { tenantId, backup } = req.body;

    if (!backup || !backup.contacts) {
      res.status(400).json({ error: 'Invalid backup data' });
      return;
    }

    let restored = 0;
    
    for (const contact of backup.contacts) {
      await prisma.contact.upsert({
        where: { tenantId_email: { tenantId, email: contact.email } },
        create: { ...contact, tenantId },
        update: contact
      });
      restored++;
    }

    res.json({ success: true, restored });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tags', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, color } = req.body;
    
    const tag = await prisma.contact.create({
      data: { tenantId, name, color: color || '#6366f1' }
    });
    
    res.json({ success: true, tag });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tags', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    
    const tags = await prisma.contact.findMany({
      where: { tenantId: tenantId as string },
      select: { tags: true }
    });
    
    const allTags = new Map<string, number>();
    tags.forEach(c => {
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

router.post('/groups', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, color, contactIds } = req.body;
    
    const group = await prisma.contact.create({
      data: {
        tenantId,
        firstName: name,
        lastName: 'Group',
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@group.local`,
        tags: [name],
        metadata: { isGroup: true, color, memberCount: contactIds?.length || 0 }
      }
    });
    
    res.json({ success: true, group });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/groups', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    
    const groups = await prisma.contact.findMany({
      where: { tenantId: tenantId as string, metadata: { path: 'isGroup', equals: true } }
    });
    
    res.json({ success: true, groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { emails, provider } = req.body;

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
