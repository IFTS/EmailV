/**
 * Services Unit Tests
 */

import { hashPassword, verifyPassword } from '../../src/services/authenticationImproved';
import { checkRateLimit } from '../../src/services/rateLimiter';
import { encryptCredential, decryptCredential } from '../../src/services/credentialVault';

describe('Authentication Service', () => {
  
  describe('Password hashing with bcrypt', () => {
    const testPassword = 'TestPassword123!';

    it('should hash password', async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).toBeDefined();
      expect(hash).toMatch(/^\$2[aby]\$\d{2\$/);
    });

    it('should verify correct password', async () => {
      const hash = await hashPassword(testPassword);
      const result = await verifyPassword(testPassword, hash);
      expect(result).toBe(true);
    });

    it('should reject wrong password', async () => {
      const hash = await hashPassword(testPassword);
      const result = await verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });
  });
});

describe('Rate Limiter', () => {
  // Note: Requires Redis running
  
  describe.skip('checkRateLimit', () => {
    it('should allow requests under limit', async () => {
      const result = await checkRateLimit('test-ip-1', 'api');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });
  });
});

describe('Credential Vault', () => {
  const testCredential = 'my-super-secret-api-key';
  
  describe('encryptCredential', () => {
    it('should encrypt credential', () => {
      const encrypted = encryptCredential(testCredential);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testCredential);
    });
  });

  describe('decryptCredential', () => {
    it('should decrypt correctly', () => {
      const encrypted = encryptCredential(testCredential);
      const decrypted = decryptCredential(encrypted);
      expect(decrypted).toBe(testCredential);
    });
  });

  it('should produce different ciphertext each time', () => {
    const encrypted1 = encryptCredential(testCredential);
    const encrypted2 = encryptCredential(testCredential);
    expect(encrypted1).not.toBe(encrypted2);
  });
});