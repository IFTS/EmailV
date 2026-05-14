import { Worker, Job, FlowProducer } from 'bullmq';
import Redis from 'ioredis';
import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';

interface EmailJobData {
  tenantId: string;
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  html?: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  metadata?: Record<string, any>;
}

interface RetryJobData {
  originalJobId: string;
  tenantId: string;
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attempts: number;
}

const prisma = new PrismaClient();
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

const resend = new Resend({
  apiKey: process.env.RESEND_API_KEY || '',
});

const EMAIL_CONCURRENCY = parseInt(process.env.EMAIL_CONCURRENCY || '5');
const EMAIL_RATE_LIMIT = parseInt(process.env.EMAIL_RATE_LIMIT || '10');
const EMAIL_RATE_DURATION = parseInt(process.env.EMAIL_RATE_DURATION || '1000');
const MAX_RETRIES = parseInt(process.env.EMAIL_MAX_RETRIES || '3');

const emailWorker = new Worker<EmailJobData>(
  'email-queue',
  async (job: Job<EmailJobData>) => {
    const { tenantId, campaignId, recipientEmail, subject, body, html, fromEmail, fromName, replyTo, metadata } = job.data;
    
    try {
      const result = await resend.emails.send({
        from: fromName ? `"${fromName}" <${fromEmail || 'onboarding@resend.dev'}>` 
          : (fromEmail || 'onboarding@resend.dev'),
        to: recipientEmail,
        subject: subject,
        text: body,
        html: html || body,
        reply_to: replyTo,
        metadata: {
          ...metadata,
          jobId: job.id,
          campaignId,
          tenantId
        }
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } }
      });

      return { 
        success: true, 
        messageId: result.data?.id,
        email: recipientEmail
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        await job.moveToDelayed(Date.now() + 60000);
        return { success: false, reason: 'rate_limited', retry: true };
      }

      if (errorMessage.includes('spam') || errorMessage.includes('blocked')) {
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: {
            bounces: { push: recipientEmail },
            bounceCount: { increment: 1 }
          }
        });
        return { success: false, reason: 'blocked', retry: false };
      }

      const shouldRetry = job.attemptsMade < MAX_RETRIES;
      
      if (shouldRetry) {
        throw error;
      }

      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          bounces: { push: recipientEmail },
          bounceCount: { increment: 1 }
        }
      });

      return { success: false, reason: 'failed', error: errorMessage, retry: false };
    }
  },
  { 
    connection,
    concurrency: EMAIL_CONCURRENCY,
    limiter: {
      max: EMAIL_RATE_LIMIT,
      duration: EMAIL_RATE_DURATION
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
);

emailWorker.on('completed', async (job, result) => {
  console.log(`[${job.id}] ✓ Sent to ${job.data.recipientEmail}`);
  
  await prisma.auditLog.create({
    data: {
      tenantId: job.data.tenantId,
      userId: job.data.campaignId,
      action: 'email_sent',
      resource: 'email',
      resourceId: job.data.campaignId,
      details: {
        recipient: job.data.recipientEmail,
        messageId: result.messageId,
        jobId: job.id
      }
    }
  });
});

emailWorker.on('failed', async (job, err) => {
  console.error(`[${job?.id}] ✗ Failed: ${err.message}`);
  
  if (job?.data) {
    await prisma.auditLog.create({
      data: {
        tenantId: job.data.tenantId,
        userId: job.data.campaignId,
        action: 'email_failed',
        resource: 'email',
        resourceId: job.data.campaignId,
        details: {
          recipient: job.data.recipientEmail,
          error: err.message,
          attempts: job.attemptsMade
        }
      }
    });
  }
});

emailWorker.on('stalled', async (jobId) => {
  console.warn(`[${jobId}] ⚠ Stalled job detected`);
});

emailWorker.on('error', (err) => {
  console.error('Worker error:', err);
});

async function addEmailToQueue(data: EmailJobData, options?: { delay?: number; priority?: number }): Promise<void> {
  const jobOptions: any = {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 100 },
    attempts: MAX_RETRIES,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  };
  
  if (options?.delay) {
    jobOptions.delay = options.delay;
  }
  
  if (options?.priority) {
    jobOptions.priority = options.priority;
  }
  
  await emailWorker.add(data, jobOptions);
}

async function addBulkEmails(emails: EmailJobData[], priority: number = 1): Promise<void> {
  const jobs = emails.map(email => ({
    name: 'send-email',
    data: email,
    opts: {
      priority,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 50 },
      attempts: MAX_RETRIES
    }
  }));
  
  await emailWorker.addBulk(jobs);
}

async function pauseQueue(): Promise<void> {
  await emailWorker.pause();
}

async function resumeQueue(): Promise<void> {
  await emailWorker.resume();
}

async function getWorkerStats() {
  const counts = await emailWorker.getJobCounts();
  const isPaused = await emailWorker.isPaused();
  
  return {
    ...counts,
    isPaused,
    concurrency: EMAIL_CONCURRENCY,
    rateLimit: EMAIL_RATE_LIMIT,
    rateDuration: EMAIL_RATE_DURATION
  };
}

async function closeWorker() {
  await emailWorker.close();
  await connection.quit();
  await prisma.$disconnect();
}

process.on('SIGTERM', async () => {
  await closeWorker();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeWorker();
  process.exit(0);
});

export { 
  emailWorker, 
  addEmailToQueue, 
  addBulkEmails,
  pauseQueue, 
  resumeQueue,
  getWorkerStats,
  closeWorker 
};
export default emailWorker;
