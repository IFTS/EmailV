/**
 * Test Setup
 */

// Test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost:5432/emailv_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars!';
process.env.MASTER_ENCRYPTION_KEY = 'test-master-key-32-characters!';

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});