import { createTransport, Transporter } from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from?: string;
  fromName?: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  from?: string;
  fromName?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const smtpConfigs: Map<string, SMTPConfig> = new Map();

export function configureSMTP(tenantId: string, config: SMTPConfig) {
  smtpConfigs.set(tenantId, config);
}

export function getSMTPConfig(tenantId: string): SMTPConfig | undefined {
  return smtpConfigs.get(tenantId);
}

export function removeSMTPConfig(tenantId: string) {
  smtpConfigs.delete(tenantId);
}

export async function sendEmail(tenantId: string, options: EmailOptions): Promise<SendResult> {
  const config = smtpConfigs.get(tenantId);
  
  if (!config) {
    const tenantSettings = await prisma.tenantSetting.findUnique({
      where: { tenantId }
    });
    
    if (!tenantSettings?.spfDomain) {
      return { success: false, error: 'SMTP not configured' };
    }
    
    config.host = tenantSettings.spfDomain;
    config.port = 587;
    config.secure = false;
    config.auth = {
      user: tenantSettings.fromEmail,
      pass: process.env.SMTP_PASSWORD || ''
    };
    config.from = tenantSettings.fromEmail;
    config.fromName = tenantSettings.fromName;
  }

  try {
    const transporter: Transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      connectionTimeout: 10000
    });

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    
    const info = await transporter.sendMail({
      from: `"${options.fromName || config.fromName || config.from || 'EmailV Pro'}" <${options.from || config.from}>`,
      to: recipients.join(', '),
      cc: options.cc?.join(', '),
      bcc: options.bcc?.join(', '),
      subject: options.subject,
      text: options.body,
      html: options.html || options.body.replace(/<[^>]*>/g, ''),
      replyTo: options.replyTo
    });

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

export async function sendBatchEmails(tenantId: string, emails: EmailOptions[]): Promise<SendResult[]> {
  const results: SendResult[] = [];
  
  for (const email of emails) {
    const result = await sendEmail(tenantId, email);
    results.push(result);
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

export async function testSMTPConnection(tenantId: string): Promise<{ success: boolean; error?: string }> {
  const config = smtpConfigs.get(tenantId);
  
  if (!config) {
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
    });

    await transporter.verify();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
