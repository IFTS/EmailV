import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';

const router = Router();
const prisma = new PrismaClient();

interface SeoIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  element?: string;
}

interface SeoAudit {
  url: string;
  score: number;
  grade: string;
  title: string | null;
  titleLen: number;
  metaDesc: string | null;
  metaLen: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  imagesAlt: number;
  imagesTot: number;
  altRatio: number;
  linksInt: number;
  linksExt: number;
  keywords: string[];
  issues: SeoIssue[];
  performance: Record<string, number>;
}

function calculateGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4);
  const freq: Record<string, number> = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

async function analyzeSeo(url: string): Promise<SeoAudit> {
  const issues: SeoIssue[] = [];
  let score = 0;
  
  let title: string | null = null;
  let titleLen = 0;
  let metaDesc: string | null = null;
  let metaLen = 0;
  let h1Count = 0;
  let h2Count = 0;
  let h3Count = 0;
  let h4Count = 0;
  let h5Count = 0;
  let h6Count = 0;
  let imagesAlt = 0;
  let imagesTot = 0;
  let linksInt = 0;
  let linksExt = 0;
  let keywords: string[] = [];
  
  let html = '';
  let loadTime = 0;
  let statusCode = 200;

  const startTime = Date.now();

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EmailV-SEO-Bot/2.0)'
      }
    });
    
    statusCode = response.status;
    loadTime = Date.now() - startTime;
    html = response.data;
    const $ = cheerio.load(html);

    const titleEl = $('title').first();
    title = titleEl.text().trim() || null;
    titleLen = title?.length || 0;
    
    if (title && titleLen > 0) {
      score += 10;
      if (titleLen >= 30 && titleLen <= 60) {
        score += 5;
      } else if (titleLen < 30) {
        issues.push({ type: 'warning', code: 'TITLE_SHORT', message: `Title too short (${titleLen} chars). Aim for 30-60.` });
      } else if (titleLen > 60) {
        issues.push({ type: 'warning', code: 'TITLE_LONG', message: `Title too long (${titleLen} chars). Keep under 60.` });
      }
    } else {
      issues.push({ type: 'error', code: 'TITLE_MISSING', message: 'Missing title tag' });
    }

    const metaDescEl = $('meta[name="description"]').attr('content');
    metaDesc = metaDescEl || null;
    metaLen = metaDesc?.length || 0;
    
    if (metaDesc && metaLen > 0) {
      score += 10;
      if (metaLen >= 50 && metaLen <= 160) {
        score += 5;
      } else if (metaLen < 50) {
        issues.push({ type: 'warning', code: 'META_SHORT', message: `Meta description too short (${metaLen} chars).` });
      } else if (metaLen > 160) {
        issues.push({ type: 'warning', code: 'META_LONG', message: `Meta description too long (${metaLen} chars).` });
      }
    } else {
      issues.push({ type: 'warning', code: 'META_MISSING', message: 'Missing meta description' });
    }

    h1Count = $('h1').length;
    h2Count = $('h2').length;
    h3Count = $('h3').length;
    h4Count = $('h4').length;
    h5Count = $('h5').length;
    h6Count = $('h6').length;

    if (h1Count === 0) {
      issues.push({ type: 'error', code: 'H1_MISSING', message: 'No H1 tags found' });
    } else if (h1Count === 1) {
      score += 10;
    } else {
      score += 5;
      issues.push({ type: 'warning', code: 'H1_MULTIPLE', message: `Multiple H1 tags (${h1Count}). Use only one.` });
    }

    if (h2Count > 0) score += 3;
    if (h3Count > 0) score += 2;

    $('img').each((_, el) => {
      imagesTot++;
      const alt = $(el).attr('alt');
      if (alt && alt.length > 0) {
        imagesAlt++;
      }
    });

    if (imagesTot > 0) {
      const altRatio = (imagesAlt / imagesTot) * 100;
      if (altRatio >= 90) {
        score += 10;
      } else if (altRatio >= 70) {
        score += 5;
      } else {
        issues.push({ type: 'error', code: 'IMG_MISSING_ALT', message: `${imagesTot - imagesAlt} images missing alt text` });
      }
    }

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http')) {
        try {
          const linkUrl = new URL(href);
          const baseUrl = new URL(url);
          if (linkUrl.hostname === baseUrl.hostname) {
            linksInt++;
          } else {
            linksExt++;
          }
        } catch {
          linksExt++;
        }
      }
    });

    if (linksInt > 5) score += 3;
    if (linksExt > 3) score += 2;

    $('meta[name="keywords"]').each((_, el) => {
      const kw = $(el).attr('content');
      if (kw) {
        keywords = kw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      }
    });

    const textContent = $('body').text();
    keywords = keywords.length ? keywords : extractKeywords(textContent);

    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    
    if (ogTitle) score += 3;
    if (ogDesc) score += 3;
    if (ogImage) score += 2;

    const twitterCard = $('meta[name="twitter:card"]').attr('content');
    if (twitterCard) score += 2;

    const canonical = $('link[rel="canonical"]').attr('href');
    if (canonical) score += 2;

    const h1Text = $('h1').first().text().toLowerCase();
    const domainName = new URL(url).hostname.replace('www.', '');
    if (h1Text.includes(domainName.split('.')[0])) {
      score += 3;
    }

    if (loadTime < 2000) {
      score += 5;
    } else if (loadTime > 5000) {
      issues.push({ type: 'warning', code: 'SLOW_LOAD', message: `Slow load time (${loadTime}ms)` });
    }

  } catch (error: any) {
    issues.push({ type: 'error', code: 'FETCH_ERROR', message: `Failed to fetch: ${error.message}` });
  }

  score = Math.min(100, Math.max(0, score));
  const grade = calculateGrade(score);

  const performance: Record<string, number> = {
    loadTime,
    statusCode,
    htmlSize: html.length,
    requestSize: url.length
  };

  return {
    url,
    score,
    grade,
    title,
    titleLen,
    metaDesc,
    metaLen,
    h1Count,
    h2Count,
    h3Count,
    h4Count,
    h5Count,
    h6Count,
    imagesAlt,
    imagesTot,
    altRatio: imagesTot > 0 ? (imagesAlt / imagesTot) * 100 : 0,
    linksInt,
    linksExt,
    keywords,
    issues,
    performance
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
        grade: analysis.grade,
        title: analysis.title,
        titleLen: analysis.titleLen,
        metaDesc: analysis.metaDesc,
        metaLen: analysis.metaLen,
        h1Count: analysis.h1Count,
        h2Count: analysis.h2Count,
        h3Count: analysis.h3Count,
        imagesAlt: analysis.imagesAlt,
        imagesTot: analysis.imagesTot,
        altRatio: analysis.altRatio,
        linksInt: analysis.linksInt,
        linksExt: analysis.linksExt,
        keywords: analysis.keywords,
        issues: analysis.issues as any,
        performance: analysis.performance as any
      }
    });

    res.json({ success: true, audit });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/seo/audits', async (req: Request, res: Response) => {
  try {
    const { tenantId, page = '1', limit = '20', sort = 'createdAt', order = 'desc' } = req.query;
    
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
        orderBy: { [sort as string]: order as 'asc' | 'desc' }
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
export { analyzeSeo };
