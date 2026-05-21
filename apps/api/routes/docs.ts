/**
 * Swagger/OpenAPI Documentation
 */

import { Router, Request, Response } from 'express';
// import swaggerUi from 'swagger-ui-express';

/**
 * Inline OpenAPI 3.0 Specification
 * Note: Install swagger-ui-express for the UI: npm install swagger-ui-express
 */

/**
 * OpenAPI Specification
 */
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EmailV API',
    description: 'Enterprise Multi-Tenant Email Marketing API',
    version: '3.0.0',
    contact: { name: 'API Support', email: 'support@emailv.pro' }
  },
  servers: [
    { url: 'https://api.emailv.pro', description: 'Production' },
    { url: 'http://localhost:3001', description: 'Development' }
  ],
  tags: [
    { name: 'Health', description: 'System health' },
    { name: 'Auth', description: 'Authentication' },
    { name: 'Contacts', description: 'Contact management' },
    { name: 'Emails', description: 'Email operations' },
    { name: 'Campaigns', description: 'Campaign management' },
    { name: 'SEO', description: 'SEO tools' },
    { name: 'AI', description: 'AI features' }
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object' } } }
          }
        }
      }
    },
    '/api/metrics': {
      get: {
        tags: ['Health'],
        summary: 'Prometheus metrics',
        responses: { '200': { description: 'Metrics', content: { 'text/plain': {} } } }
      }
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Success' }, '401': { description: 'Invalid' } }
      }
    },
    '/api/contacts': {
      get: {
        tags: ['Contacts'],
        summary: 'List contacts',
        parameters: [
          { name: 'tenantId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { '200': { description: 'OK' } }
      },
      post: {
        tags: ['Contacts'],
        summary: 'Create contact',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tenantId', 'contacts'],
                properties: {
                  tenantId: { type: 'string' },
                  contacts: { type: 'array' }
                }
              }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/api/emails/validate': {
      post: {
        tags: ['Emails'],
        summary: 'Validate email addresses',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { emails: { type: 'array', items: { type: 'string' } } }
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    },
    '/api/seo/analyze': {
      post: {
        tags: ['SEO'],
        summary: 'Analyze SEO',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tenantId', 'url'],
                properties: { tenantId: { type: 'string' }, url: { type: 'string' } }
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    },
    '/api/ai/prompt': {
      post: {
        tags: ['AI'],
        summary: 'AI prompt',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tenantId', 'prompt'],
                properties: {
                  tenantId: { type: 'string' },
                  prompt: { type: 'string' },
                  temperature: { type: 'number' },
                  maxTokens: { type: 'integer' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
    }
  }
};

const router = Router();

/**
 * Get OpenAPI spec as JSON
 */
router.get('/api-docs.json', (req: Request, res: Response) => {
  res.json(openApiSpec);
});

/**
 * Note: To enable Swagger UI, install swagger-ui-express:
 * npm install swagger-ui-express
 * 
 * Then add to index.ts:
 * import docsRouter from './routes/docs.js';
 * app.use('/docs', docsRouter);
 */

export default router;
export { openApiSpec };