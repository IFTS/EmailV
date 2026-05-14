import { promises as dns } from 'dns';
import { createConnection, Socket } from 'net';
import { randomBytes } from 'crypto';

export interface ValidationResult {
  email: string;
  valid: boolean;
  validity: string;
  checks: {
    format: boolean;
    mx: boolean;
    smtp: boolean;
    disposable: boolean;
    role: boolean;
  };
  reason?: string;
}

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'yopmail.com', 'getnada.com', 'sharklasers.com',
  'mintemail.com', 'maildrop.cc', 'mohmal.com', 'tempail.com',
  'spam4.me', 'fakeinbox.com', 'trashmail.com', 'dispostable.com',
  'yandex.com', 'hotmail.com', 'gmail.com', 'outlook.com'
]);

const ROLE_ACCOUNTS = new Set([
  'info', 'admin', 'support', 'help', 'noreply', 'sales', 'contact',
  'webmaster', 'hostmaster', 'postmaster', 'abuse', 'security',
  'team', 'staff', 'office', 'billing', 'finance', 'accounting', 'hr', 'jobs'
]);

const RFC5322_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/;

const TIMEOUT_MS = 4000;

export async function validateEmail(email: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    email,
    valid: false,
    validity: 'invalid',
    checks: {
      format: false,
      mx: false,
      smtp: false,
      disposable: false,
      role: false
    }
  };

  if (!email || typeof email !== 'string') {
    result.reason = 'Invalid email format';
    return result;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!RFC5322_REGEX.test(normalizedEmail)) {
    result.reason = 'RFC 5322 format violation';
    return result;
  }

  result.checks.format = true;
  const [localPart, domain] = normalizedEmail.split('@');

  if (DISPOSABLE_DOMAINS.has(domain)) {
    result.checks.disposable = true;
    result.validity = 'risky';
    result.reason = 'Disposable email domain';
    return result;
  }

  if (ROLE_ACCOUNTS.has(localPart.toLowerCase())) {
    result.checks.role = true;
    result.validity = 'risky';
    result.reason = 'Role-based email account';
    return result;
  }

  try {
    const mxRecords = await dns.resolveMx(domain);
    
    if (!mxRecords || mxRecords.length === 0) {
      result.reason = 'No MX records found for domain';
      return result;
    }

    const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority);
    result.checks.mx = true;

    for (const mx of sortedMx) {
      const host = mx.exchange;
      try {
        const smtpResult = await checkSmtpConnection(host, normalizedEmail);
        result.checks.smtp = smtpResult;
        break;
      } catch {
        continue;
      }
    }

    if (result.checks.smtp) {
      result.valid = true;
      result.validity = 'valid';
    } else if (result.checks.mx) {
      result.validity = 'unknown';
      result.reason = 'MX exists but SMTP connection failed';
    }

  } catch (err) {
    result.reason = 'DNS MX lookup failed';
  }

  return result;
}

function checkSmtpConnection(mxHost: string, email: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: mxHost, port: 25, timeout: TIMEOUT_MS });
    let response = '';
    const commands: string[] = [];
    let cmdIndex = 0;

    commands.push(`HELO ${randomBytes(8).toString('hex')}\r\n`);
    commands.push(`MAIL FROM:<verify@${mxHost}>\r\n`);
    commands.push(`RCPT TO:<${email}>\r\n`);
    commands.push(`QUIT\r\n`);

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.on('connect', () => {
      socket.write(commands[cmdIndex]);
    });

    socket.on('data', (data) => {
      response += data.toString();
      
      if (response.startsWith('220')) {
        cmdIndex++;
        if (cmdIndex < commands.length && !commands[cmdIndex].startsWith('QUIT')) {
          socket.write(commands[cmdIndex]);
        }
      } else if (response.startsWith('250')) {
        cmdIndex++;
        if (cmdIndex < commands.length) {
          socket.write(commands[cmdIndex]);
        }
      } else if (response.startsWith('550') || response.startsWith('553')) {
        cleanup();
        resolve(false);
      } else if (response.startsWith('221')) {
        cleanup();
        resolve(true);
      }
    });

    socket.on('timeout', () => {
      cleanup();
      resolve(false);
    });

    socket.on('error', () => {
      cleanup();
      resolve(false);
    });

    setTimeout(() => {
      cleanup();
      resolve(false);
    }, TIMEOUT_MS);
  });
}

export async function validateBatch(emails: string[]): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  
  for (const email of emails) {
    const result = await validateEmail(email);
    results.push(result);
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

export function isValidEmailFormat(email: string): boolean {
  return RFC5322_REGEX.test(email?.trim()?.toLowerCase() || '');
}
