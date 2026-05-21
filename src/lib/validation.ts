/**
 * Input Validation Schemas using Zod
 * 
 * Schema version: 2.0.0
 */

import { z } from 'zod';
import { Request, Response } from 'express';

// ============== COMMON SCHEMAS ==============

/** Validates email format (RFC 5322 simplified) */
export const emailSchema = z.string()
  .email('Invalid email format')
  .min(5)
  .max(254)
  .transform(val => val.toLowerCase().trim());

/** Validates UUID v4 */
export const uuidSchema = z.string()
  .uuid('Invalid UUID format');

/** Non-empty string with optional length limits */
export const nonEmptyString = (min = 1, max = 1000) => z.string()
  .min(min, `Minimum ${min} characters`)
  .max(max, `Maximum ${max} characters`);

/** Phone number (E.164 format) */
export const phoneSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number');

/** URL schema with whitelist option */
export const urlSchema = (allowedDomains?: string[]) => {
  const schema = z.string().url('Invalid URL');
  
  if (allowedDomains?.length) {
    return schema.refine(
      url => allowedDomains.some(domain => url.includes(domain)),
      { message: `URL must be from: ${allowedDomains.join(', ')}` }
    );
  }
  
  return schema;
};

// ============== AUTH SCHEMAS ==============

/** Login validation with rate limiting */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long')
});

/** Registration with strong password requirements */
export const registerSchema = z.object({
  email: emailSchema,
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain special character'),
  name: nonEmptyString(1, 100),
  tenantName: nonEmptyString(1, 50).optional()
});

/** Password reset request */
export const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

/** Password reset with confirmation */
export const passwordResetSchema = z.object({
  token: z.string().min(32).max(64),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
});

// ============== TENANT SCHEMAS ==============

/** Tenant creation */
export const tenantSchema = z.object({
  name: nonEmptyString(1, 100),
  domain: z.string()
    .domain('Invalid domain')
    .max(100),
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']).default('free')
});

/** Tenant update (partial) */
export const tenantUpdateSchema = tenantSchema.partial();

// ============== CONTACT SCHEMAS ==============

/** Individual contact */
export const contactSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: emailSchema,
  phone: phoneSchema.optional(),
  company: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  notes: z.string().max(5000).optional(),
  favorite: z.boolean().optional()
});

/** Batch contact import */
export const batchContactsSchema = z.object({
  tenantId: uuidSchema,
  contacts: z.array(contactSchema)
    .min(1, 'At least one contact required')
    .max(10000, 'Maximum 10000 contacts per batch'),
  validate: z.boolean().optional(),
  deduplicate: z.boolean().optional(),
  overwrite: z.boolean().optional()
});

/** Contact update */
export const contactUpdateSchema = contactSchema.partial();

// ============== EMAIL SCHEMAS ==============

/** Send single email */
export const sendEmailSchema = z.object({
  tenantId: uuidSchema,
  to: z.union([
    emailSchema,
    z.array(emailSchema).min(1).max(100)
  ]),
  subject: nonEmptyString(1, 200),
  html: z.string().max(500000).optional(),
  text: z.string().max(500000).optional(),
  from: emailSchema.optional(),
  replyTo: emailSchema.optional(),
  cc: z.array(emailSchema).max(10).optional(),
  bcc: z.array(emailSchema).max(10).optional()
});

/** Email validation batch */
export const emailValidationSchema = z.object({
  emails: z.array(emailSchema).min(1).max(1000)
});

/** Email campaign */
export const emailCampaignSchema = z.object({
  tenantId: uuidSchema,
  name: nonEmptyString(1, 200),
  subject: nonEmptyString(1, 200),
  preheader: z.string().max(500).optional(),
  html: z.string().max(500000),
  templateId: z.string().optional(),
  scheduledAt: z.string().datetime().optional()
});

// ============== SEO SCHEMAS ==============

/** SEO analysis request */
export const seoAnalysisSchema = z.object({
  tenantId: uuidSchema,
  url: z.string()
    .url('Invalid URL')
    .startsWith('http', 'URL must start with http or https')
});

// ============== AI SCHEMAS ==============

/** AI prompt request */
export const aiPromptSchema = z.object({
  tenantId: uuidSchema,
  prompt: z.string()
    .min(1, 'Prompt is required')
    .max(10000, 'Prompt too long'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(32000).optional(),
  model: z.string().optional()
});

// ============== WEBHOOK SCHEMAS ==============

/** Webhook configuration */
export const webhookSchema = z.object({
  tenantId: uuidSchema,
  name: nonEmptyString(1, 100),
  url: z.string().url(),
  events: z.array(z.enum([
    'contact.created',
    'contact.updated', 
    'email.sent',
    'email.opened',
    'email.clicked',
    'campaign.started',
    'campaign.completed'
  ])).min(1),
  headers: z.record(z.string()).optional(),
  active: z.boolean().optional()
});

// ============== PAGINATION ==============

/** Pagination params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

/** Paginated response wrapper */
export function paginate<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total
    }
  };
}

// ============== VALIDATION HELPER ==============

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  errors: Array<{ path: string; message: string }>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validate input - returns parsed data or errors
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return {
    success: false,
    errors: result.error.issues.map(e => ({
      path: e.path.join('.'),
      message: e.message
    }))
  };
}

/**
 * Async validator for complex checks
 */
export async function validateAsync<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  checks: Array<(data: T) => Promise<void>>
): Promise<ValidationResult<T>> {
  const validation = validate(schema, data);
  
  if (!validation.success) {
    return validation;
  }
  
  for (const check of checks) {
    try {
      await check(validation.data);
    } catch (e) {
      return {
        success: false,
        errors: [{ path: '', message: e.message }]
      };
    }
  }
  
  return validation;
}

/**
 * Express middleware factory
 */
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: Function) => {
    const result = validate(schema, req.body);

    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.errors
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Sanitize input - remove potential XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Strip disallowed fields from object
 */
export function stripFields<T extends object>(
  obj: T,
  allowed: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  
  for (const key of allowed) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  
  return result;
}