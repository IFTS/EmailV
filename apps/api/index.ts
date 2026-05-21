import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

import contactRouter from './controllers/contactController.js';
import seoRouter from './controllers/seoController.js';
import aiRouter from './controllers/aiController.js';
import emailRouter from './controllers/emailController.js';
import { setCurrentRequestId, setTenantContext, clearTenantContext } from './services/tenantIsolation.js';

// ===========================================
// SECURITY CHECK: Validate required keys
// ===========================================
function validateSecurityKeys() {
  // Check MASTER_ENCRYPTION_KEY
  if (!process.env.MASTER_ENCRYPTION_KEY) {
    console.error('❌ CRITICAL: MASTER_ENCRYPTION_KEY env variable is missing!');
    process.exit(1);
  }
  
  // Ensure key meets AES-256 requirements (32 bytes / 256 bits)
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (key.length < 32) {
    console.error('❌ CRITICAL: MASTER_ENCRYPTION_KEY must be at least 32 characters.');
    process.exit(1);
  }
  
  console.log('✅ Security keys validated');
}

// Run security check immediately
validateSecurityKeys();

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
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  const tenantId = (req.headers['x-tenant-id'] as string) || req.query.tenantId as string;
  
  setCurrentRequestId(requestId);
  if (tenantId) {
    setTenantContext(requestId, { tenantId, userId: req.headers['x-user-id'] as string });
  }
  
  res.setHeader('X-Request-ID', requestId);
  
  const startTime = Date.now();
  res.on('finish', () => {
    clearTenantContext(requestId);
    const duration = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${requestId.slice(0,8)} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
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

// Strict limiter for email validation (protects API credits)
const validationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // Strict limit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many email validations. Please try again later.', retryAfter: 900 },
  keyGenerator: (req) => {
    // Rate limit by tenant to protect API quotas
    return req.headers['x-tenant-id'] as string || req.ip;
  }
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

// Prometheus metrics endpoint
let requestCount = 0;
let errorCount = 0;

app.get('/api/metrics', (req, res) => {
  // Increment request counter
  requestCount++;
  
  const metrics = [
    `# HELP emailv_requests_total Total HTTP requests`,
    `# TYPE emailv_requests_total counter`,
    `emailv_requests_total ${requestCount}`,
    ``,
    `# HELP emailv_errors_total Total HTTP errors`,
    `# TYPE emailv_errors_total counter`,
    `emailv_errors_total ${errorCount}`,
    ``,
    `# HELP emailv_uptime_seconds Server uptime in seconds`,
    `# TYPE emailv_uptime_seconds gauge`,
    `emailv_uptime_seconds ${process.uptime()}`,
    ``,
    `# HELP emailv_memory_usage_bytes Memory usage`,
    `# TYPE emailv_memory_usage_bytes gauge`,
    `emailv_memory_usage_bytes ${process.memoryUsage().heapUsed}`,
    ``,
    `# HELP emailv_cpu_usage_percent CPU usage percent`,
    `# TYPE emailv_cpu_usage_percent gauge`,
    `emailv_cpu_usage_percent ${process.cpuUsage().user / 1000000}`
  ].join('\n');
  
  res.set('Content-Type', 'text/plain');
  res.send(metrics);
});

app.get('/api/stats', async (req, res) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || req.query.tenantId as string;
    
    if (!tenantId) {
      res.status(400).json({ error: 'X-Tenant-ID header or tenantId query param required' });
      return;
    }

    const [contacts, validContacts, campaigns, seoAudits, aiLogs, templates] = await Promise.all([
      prisma.contact.count({ where: { tenantId } }),
      prisma.contact.count({ where: { tenantId, validity: 'valid' } }),
      prisma.emailCampaign.count({ where: { tenantId } }),
      prisma.seoAudit.count({ where: { tenantId } }),
      prisma.aiAgentLog.count({ where: { tenantId } }),
      prisma.emailCampaign.count({ where: { tenantId, status: 'DRAFT' } })
    ]);

    const tags = await prisma.contact.findMany({
      where: { tenantId },
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

const PORT = process.env.PORT || process.env.NODE_PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
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
