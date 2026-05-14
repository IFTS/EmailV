import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';

interface EmailJobData {
  tenantId: string;
  campaignId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  fromEmail: string;
}

const prisma = new PrismaClient();
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const resend = new Resend({
  apiKey: process.env.RESEND_API_KEY || '',
});

const emailWorker = new Worker<EmailJobData>(
  'email-queue',
  async (job: Job<EmailJobData>) => {
    const { tenantId, campaignId, recipientEmail, subject, body, fromEmail } = job.data;
    
    try {
      const result = await resend.emails.send({
        from: fromEmail || 'onboarding@resend.dev',
        to: recipientEmail,
        subject: subject,
        html: body,
      });

      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } }
      });

      return { success: true, messageId: result.data?.id };
    } catch (error: any) {
      const bounceEmail = recipientEmail;
      
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          bounces: { push: bounceEmail }
        }
      });

      return { success: false, error: error.message };
    }
  },
  { 
    connection,
    concurrency: parseInt(process.env.EMAIL_CONCURRENCY || '5'),
    limiter: {
      max: parseInt(process.env.EMAIL_RATE_LIMIT || '10'),
      duration: parseInt(process.env.EMAIL_RATE_DURATION || '1000')
    }
  }
);

emailWorker.on('completed', (job, result) => {
  console.log(`[${job.id}] Email sent to ${job.data.recipientEmail}:`, result.success);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[${job?.id}] Email failed:`, err.message);
});

async function addEmailToQueue(data: EmailJobData) {
  await emailWorker.add(data, {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 100 }
  });
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

export { emailWorker, addEmailToQueue, closeWorker };
export default emailWorker;
