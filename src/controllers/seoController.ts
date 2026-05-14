import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';

const router = Router();
const prisma = new PrismaClient();

interface SeoAnalysis {
  url: string;
  score: number;
  title?: string;
  metaDesc?: string;
  h1Count: number;
  h2Count: number;
  imagesAlt: number;
  imagesTotal: number;
  lcp?: number;
  fid?: number;
  cls?: number;
  issues: Array<{ type: string; message: string }>;
}

async function analyzeSeo(url: string): Promise<SeoAnalysis> {
  const issues: Array<{ type: string; message: string }> = [];
  let score = 0;
  
  let title: string | undefined;
  let metaDesc: string | undefined;
  let h1Count = 0;
  let h2Count = 0;
  let imagesAlt = 0;
  let imagesTotal = 0;

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailV-Bot/1.0)'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);

    const titleEl = $('title').first();
    title = titleEl.text().trim();
    if (title && title.length > 0) {
      score += 10;
      if (title.length < 30 || title.length > 60) {
        issues.push({ type: 'warning', message: 'Title length should be 30-60 characters' });
      }
    } else {
      issues.push({ type: 'error', message: 'Missing title tag' });
    }

    const metaDescEl = $('meta[name="description"]').attr('content');
    metaDesc = metaDescEl;
    if (metaDesc && metaDesc.length > 0) {
      score += 10;
      if (metaDesc.length < 50 || metaDesc.length > 160) {
        issues.push({ type: 'warning', message: 'Meta description should be 50-160 characters' });
      }
    } else {
      issues.push({ type: 'error', message: 'Missing meta description' });
    }

    h1Count = $('h1').length;
    h2Count = $('h2').length;
    
    if (h1Count === 0) {
      issues.push({ type: 'error', message: 'No H1 tags found' });
    } else if (h1Count === 1) {
      score += 10;
    } else {
      score += 5;
      issues.push({ type: 'warning', message: `Multiple H1 tags found (${h1Count})` });
    }

    if (h2Count > 0) score += 5;

    $('img').each((_, el) => {
      imagesTotal++;
      const alt = $(el).attr('alt');
      if (alt && alt.length > 0) {
        imagesAlt++;
      }
    });

    if (imagesTotal > 0) {
      const altRatio = (imagesAlt / imagesTotal) * 100;
      if (altRatio >= 90) {
        score += 10;
      } else if (altRatio >= 70) {
        score += 5;
      } else {
        issues.push({ type: 'error', message: `${imagesTotal - imagesAlt} images missing alt attributes` });
      }
    }

    const h1Text = $('h1').first().text().toLowerCase();
    const domainName = new URL(url).hostname.replace('www.', '');
    if (h1Text.includes(domainName.split('.')[0])) {
      score += 5;
    }

    const keywords = [title, metaDesc].filter(Boolean).join(' ').toLowerCase().split(' ');
    const uniqueKeywords = new Set(keywords.filter(k => k.length > 4));
    if (uniqueKeywords.size >= 3) {
      score += 5;
    }

  } catch (error: any) {
    issues.push({ type: 'error', message: `Failed to fetch URL: ${error.message}` });
  }

  score = Math.min(100, Math.max(0, score));

  return {
    url,
    score,
    title,
    metaDesc,
    h1Count,
    h2Count,
    imagesAlt,
    imagesTotal,
    issues
  };
}

router.post('/seo/analyze', async (req: Request, res: Response) => {
  try {
    const { tenantId, url } = req.body;
    
    if (!tenantId || !url) {
      res.status(400).json({ error: 'tenantId and url required' });
      return;
    }

    const analysis = await analyzeSeo(url);

    const audit = await prisma.seoAudit.create({
      data: {
        tenantId,
        url,
        score: analysis.score,
        title: analysis.title,
        metaDesc: analysis.metaDesc,
        h1Count: analysis.h1Count,
        h2Count: analysis.h2Count,
        imagesAlt: analysis.imagesAlt,
        imagesTot: analysis.imagesTotal,
        lcp: analysis.lcp || null,
        fid: analysis.fid || null,
        cls: analysis.cls || null,
        issues: analysis.issues as any
      }
    });

    res.json({ success: true, audit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/seo/audits', async (req: Request, res: Response) => {
  try {
    const { tenantId, page = '1', limit = '20' } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [audits, total] = await Promise.all([
      prisma.seoAudit.findMany({
        where: { tenantId: tenantId as string },
        take: parseInt(limit as string),
        skip,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.seoAudit.count({ where: { tenantId: tenantId as string } })
    ]);

    res.json({
      success: true,
      audits,
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

router.get('/seo/audits/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;

    const audit = await prisma.seoAudit.findFirst({
      where: { id, tenantId: tenantId as string }
    });

    if (!audit) {
      res.status(404).json({ error: 'Audit not found' });
      return;
    }

    res.json({ success: true, audit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
export { prisma };
