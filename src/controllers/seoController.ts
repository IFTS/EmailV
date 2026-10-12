import { Router, Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const SEO_ALLOWED_HOSTS = (process.env.SEO_ALLOWED_HOSTS || 'example.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

interface SeoAnalysis {
  title: string;
  description: string;
  keywords: string[];
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  images: Array<{ src: string; alt: string }>;
  links: Array<{ href: string; text: string }>;
  performance: {
    pageSize: number;
    loadTime: number;
  };
  score: number;
  grade: string;
  recommendations: string[];
}

function calculateScore(analysis: Partial<SeoAnalysis>): number {
  let score = 0;

  if (analysis.title && analysis.title.length > 0) score += 10;
  if (analysis.description && analysis.description.length > 0) score += 10;
  if (analysis.keywords && analysis.keywords.length > 0) score += 10;
  if (analysis.headings?.h1.length === 1) score += 15;
  if (analysis.images && analysis.images.length > 0) score += 10;
  if (analysis.links && analysis.links.length > 0) score += 10;

  return Math.min(score, 100);
}

function calculateGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function isDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host === '::1' || host === '[::1]') {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;

    const [a, b] = octets;
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    ) {
      return true;
    }
  }

  const normalized = host.replace(/^\[|\]$/g, '');
  if (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }

  return false;
}

function isAllowedSeoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return SEO_ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

function validateSeoTargetUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  if (isDisallowedHost(parsed.hostname)) {
    return null;
  }

  if (!isAllowedSeoHost(parsed.hostname)) {
    return null;
  }

  return parsed.toString();
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const frequency: Record<string, number> = {};
  words.forEach((word) => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

async function analyzeSeo(url: string): Promise<SeoAnalysis> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const $ = cheerio.load(response.data);
    const html = response.data;

    const title = $('head > title').text() || $('meta[property="og:title"]').attr('content') || '';
    const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

    const keywords = extractKeywords(html);

    const headings = {
      h1: $('h1')
        .map((_, el) => $(el).text())
        .get(),
      h2: $('h2')
        .map((_, el) => $(el).text())
        .get(),
      h3: $('h3')
        .map((_, el) => $(el).text())
        .get(),
    };

    const images = $('img')
      .map((_, el) => ({
        src: $(el).attr('src') || '',
        alt: $(el).attr('alt') || '',
      }))
      .get()
      .filter((img) => img.src);

    const links = $('a')
      .map((_, el) => ({
        href: $(el).attr('href') || '',
        text: $(el).text(),
      }))
      .get()
      .filter((link) => link.href);

    const score = calculateScore({
      title,
      description,
      keywords,
      headings,
      images,
      links,
    });

    const grade = calculateGrade(score);

    const recommendations: string[] = [];

    if (!title || title.length === 0) {
      recommendations.push('Add a page title (60 characters max)');
    } else if (title.length > 60) {
      recommendations.push('Shorten your page title to 60 characters');
    }

    if (!description || description.length === 0) {
      recommendations.push('Add a meta description (155 characters)');
    } else if (description.length < 120 || description.length > 160) {
      recommendations.push('Optimize meta description length (120-160 characters)');
    }

    if (headings.h1.length === 0) {
      recommendations.push('Add an H1 heading to your page');
    } else if (headings.h1.length > 1) {
      recommendations.push('Use only one H1 tag per page');
    }

    if (images.length === 0) {
      recommendations.push('Add images to improve engagement');
    } else {
      const imagesWithoutAlt = images.filter((img) => !img.alt).length;
      if (imagesWithoutAlt > 0) {
        recommendations.push(`Add alt text to ${imagesWithoutAlt} images`);
      }
    }

    if (links.length === 0) {
      recommendations.push('Add internal links to improve navigation');
    }

    return {
      title,
      description,
      keywords,
      headings,
      images,
      links,
      performance: {
        pageSize: html.length,
        loadTime: 0,
      },
      score,
      grade,
      recommendations,
    };
  } catch (error) {
    throw new Error(`Failed to analyze URL: ${error}`);
  }
}

router.post('/seo/analyze', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  const safeUrl = validateSeoTargetUrl(String(url));
  if (!safeUrl) {
    res.status(400).json({ error: 'Invalid or disallowed url' });
    return;
  }

  try {
    const analysis = await analyzeSeo(safeUrl);

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
>>>>>>> origin/alert-autofix-13
  }

  const safeUrl = validateSeoTargetUrl(String(url));
  if (!safeUrl) {
    res.status(400).json({ error: 'Invalid or disallowed url' });
    return;
  }

  const analysis = await analyzeSeo(safeUrl);

  const audit = await prisma.seoAudit.create({
    data: {
      url: safeUrl,
      title: analysis.title,
      description: analysis.description,
      score: analysis.score,
      grade: analysis.grade,
      recommendations: analysis.recommendations.join('\n'),
    },
  });

  res.json({
    ...analysis,
    id: audit.id,
    createdAt: audit.createdAt,
  });
});

router.get('/seo/audit/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const audit = await prisma.seoAudit.findUnique({
    where: { id },
  });

  if (!audit) {
    res.status(404).json({ error: 'Audit not found' });
    return;
  }

  res.json(audit);
});

export default router;
