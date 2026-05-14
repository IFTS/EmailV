import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

import contactRouter from './controllers/contactController.js';
import seoRouter from './controllers/seoController.js';
import aiRouter from './controllers/aiController.js';

const app = express();
const prisma = new PrismaClient();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: ALLOWED_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP.' }
});

app.use('/api/', apiLimiter);

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'disconnected' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId required' });
      return;
    }

    const [contacts, campaigns, audits, aiLogs] = await Promise.all([
      prisma.contact.count({ where: { tenantId: tenantId as string } }),
      prisma.emailCampaign.count({ where: { tenantId: tenantId as string } }),
      prisma.seoAudit.count({ where: { tenantId: tenantId as string } }),
      prisma.aiAgentLog.count({ where: { tenantId: tenantId as string } })
    ]);

    const validContacts = await prisma.contact.count({
      where: { tenantId: tenantId as string, validity: 'valid' }
    });

    res.json({
      success: true,
      stats: {
        contacts,
        validContacts,
        campaigns,
        seoAudits: audits,
        aiLogs
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api', contactRouter);
app.use('/api', seoRouter);
app.use('/api', aiRouter);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`EmailV Backend running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
