import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

import contactRouter from './controllers/contactController.js';
import seoRouter from './controllers/seoController.js';
import aiRouter from './controllers/aiController.js';
import emailRouter from './controllers/emailController.js';

const app = express();
const prisma = new PrismaClient();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 
  process.env.NODE_ENV === 'production' 
    ? 'https://emailv.pro' 
    : 'http://localhost:3000';

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.openai.com', 'https://api.resend.com'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Request-ID']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP.', retryAfter: 900 }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts.', retryAfter: 900 }
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      database: 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(), 
      database: 'disconnected',
      uptime: process.uptime()
    });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

app.get('/api/stats', async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const [contacts, validContacts, campaigns, seoAudits, aiLogs, templates] = await Promise.all([
      prisma.contact.count({ where: { tenantId: tenantId as string } }),
      prisma.contact.count({ where: { tenantId: tenantId as string, validity: 'valid' } }),
      prisma.emailCampaign.count({ where: { tenantId: tenantId as string } }),
      prisma.seoAudit.count({ where: { tenantId: tenantId as string } }),
      prisma.aiAgentLog.count({ where: { tenantId: tenantId as string } }),
      prisma.emailCampaign.count({ where: { tenantId: tenantId as string, status: 'DRAFT' } })
    ]);

    const tags = await prisma.contact.findMany({
      where: { tenantId: tenantId as string },
      select: { tags: true }
    });
    const allTags = new Map<string, number>();
    tags.forEach(c => (c.tags || []).forEach((t: string) => allTags.set(t, (allTags.get(t) || 0) + 1)));

    res.json({
      success: true,
      stats: {
        contacts,
        validContacts,
        invalidContacts: contacts - validContacts,
        campaigns,
        seoAudits,
        aiLogs,
        templates,
        tags: allTags.size
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api', contactRouter);
app.use('/api', seoRouter);
app.use('/api', aiRouter);
app.use('/api/email', emailRouter);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({ error: 'Database validation error' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`EmailV Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Allowed Origin: ${ALLOWED_ORIGIN}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

export default app;
