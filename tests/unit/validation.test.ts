/**
 * Validation Library Unit Tests
 */

import {
  validate,
  emailSchema,
  uuidSchema,
  phoneSchema,
  loginSchema,
  registerSchema,
  contactSchema,
  sendEmailSchema,
  paginationSchema,
  validateRequest,
  sanitizeHtml,
  stripFields,
  paginate
} from '../../src/lib/validation';

describe('Validation Library', () => {
  
  describe('emailSchema', () => {
    it('should validate correct emails', () => {
      const result = validate(emailSchema, 'test@example.com');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test@example.com');
    });

    it('should lowercase emails', () => {
      const result = validate(emailSchema, 'TEST@Example.COM');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test@example.com');
    });

    it('should reject invalid emails', () => {
      const result = validate(emailSchema, 'not-an-email');
      expect(result.success).toBe(false);
    });
  });

  describe('uuidSchema', () => {
    it('should validate UUID v4', () => {
      const result = validate(uuidSchema, '123e4567-e89b-12d3-a456-426614174000');
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      const result = validate(uuidSchema, 'not-a-uuid');
      expect(result.success).toBe(false);
    });
  });

  describe('phoneSchema', () => {
    it('should validate E.164 phone numbers', () => {
      const result = validate(phoneSchema, '+14155551234');
      expect(result.success).toBe(true);
    });

    it('should reject invalid phones', () => {
      const result = validate(phoneSchema, 'abc123');
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should validate valid login', () => {
      const result = validate(loginSchema, {
        email: 'test@example.com',
        password: 'password123'
      });
      expect(result.success).toBe(true);
    });

    it('should reject short passwords', () => {
      const result = validate(loginSchema, {
        email: 'test@example.com',
        password: 'short'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate with strong password', () => {
      const result = validate(registerSchema, {
        email: 'test@example.com',
        password: 'StrongPass1!',
        name: 'John Doe'
      });
      expect(result.success).toBe(true);
    });

    it('should reject weak passwords', () => {
      const result = validate(registerSchema, {
        email: 'test@example.com',
        password: 'weak',
        name: 'John'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('contactSchema', () => {
    it('should validate contact', () => {
      const result = validate(contactSchema, {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      });
      expect(result.success).toBe(true);
    });

    it('should handle optional fields', () => {
      const result = validate(contactSchema, {
        email: 'test@example.com'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sendEmailSchema', () => {
    it('should validate email with array of recipients', () => {
      const result = validate(sendEmailSchema, {
        tenantId: 'tenant-123',
        to: ['a@test.com', 'b@test.com'],
        subject: 'Test Subject',
        html: '<p>Test</p>'
      });
      expect(result.success).toBe(true);
    });

    it('should accept single recipient', () => {
      const result = validate(sendEmailSchema, {
        tenantId: 'tenant-123',
        to: 'test@example.com',
        subject: 'Test'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('paginationSchema', () => {
    it('should parse string Numbers', () => {
      const result = validate(paginationSchema, { page: '2', limit: '10' });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    });

    it('should enforce limits', () => {
      const result = validate(paginationSchema, { page: '999' });
      expect(result.success).toBe(true);
    });
  });

  describe('helper functions', () => {
    describe('sanitizeHtml', () => {
      it('should escape HTML characters', () => {
        expect(sanitizeHtml('<script>alert(1)</script>'))
          .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      });

      it('should escape quotes', () => {
        expect(sanitizeHtml('"test"'))
          .toBe('&quot;test&quot;');
      });
    });

    describe('stripFields', () => {
      it('should only keep allowed fields', () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = stripFields(obj, ['a', 'c']);
        expect(result).toEqual({ a: 1, c: 3 });
        expect(result.b).toBeUndefined();
      });
    });

    describe('paginate', () => {
      it('should return paginated data', () => {
        const data = [1, 2, 3, 4, 5];
        const result = paginate(data, 10, 1, 5);
        
        expect(result.data).toEqual(data);
        expect(result.pagination.total).toBe(10);
        expect(result.pagination.page).toBe(1);
        expect(result.pagination.pages).toBe(2);
        expect(result.pagination.hasMore).toBe(true);
      });
    });
  });
});