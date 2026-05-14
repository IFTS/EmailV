# EmailV Pro - Technical Specification

## Project Overview
- **Name**: EmailV Pro
- **Type**: Enterprise Multi-tenant SaaS Email Marketing Platform
- **Version**: 3.0.0
- **Stack**: TypeScript, Express, Prisma, PostgreSQL, Redis, BullMQ

## Architecture

### Frontend (index.html - Single Page App)
- Vanilla JavaScript with modern ES6+
- Tailwind CSS styling
- LocalStorage for demo data persistence
- Font Awesome icons

### Backend (src/)
- Express.js REST API
- Prisma ORM with PostgreSQL
- BullMQ for job queues
- Redis for caching/rate limiting

## API Endpoints

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/contacts | Import contacts |
| GET | /api/contacts | List contacts |
| GET | /api/contacts/:id | Get contact |
| PUT | /api/contacts/:id | Update contact |
| DELETE | /api/contacts/:id | Delete contact |
| POST | /api/contacts/bulk-edit | Bulk operations |
| GET | /api/contacts/duplicates | Find duplicates |
| POST | /api/contacts/merge | Merge contacts |
| GET | /api/tags | Get all tags |
| GET | /api/groups | Get groups |
| POST | /api/validate | Validate emails |

### Templates & SMTP
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/email/templates | Create template |
| GET | /email/templates | List templates |
| GET | /email/templates/:id | Get template |
| PUT | /email/templates/:id | Update template |
| DELETE | /email/templates/:id | Delete template |
| POST | /api/email/smtp | Configure SMTP |
| GET | /api/email/smtp | Get SMTP config |
| POST | /api/email/smtp/test | Test SMTP |

### SEO
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/seo/analyze | Analyze URL |
| GET | /api/seo/audits | List audits |
| GET | /api/seo/audits/:id | Get audit |

### AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/ai/generate-content | AI content |
| POST | /api/ai/subject-line | Subject lines |
| POST | /api/ai/segment | Segment contacts |
| POST | /api/ai/analyze-performance | Analyze campaign |
| POST | /api/ai/create-campaign | Create campaign |
| POST | /api/ai/send-campaign | Send campaign |
| GET | /api/ai/content-types | Get types/tones |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/ping | Ping |
| GET | /api/stats | Dashboard stats |

## Database Schema

### Core Tables
- **Tenant**: Multi-tenant organization
- **User**: Tenant users with roles
- **Contact**: Email contacts
- **EmailCampaign**: Campaign tracking
- **SeoAudit**: SEO analysis results
- **AiAgentLog**: AI usage logging
- **TenantSetting**: Tenant configuration
- **Webhook**: Webhook configurations
- **AuditLog**: System audit trail

## Security Features
- Helmet.js security headers
- CORS configuration
- Rate limiting (express-rate-limit)
- Tenant isolation middleware
- Token-based auth
- Credential vault (AES-256-GCM)
- API key management

## Rate Limiting
- API: 100 req/15min
- Auth: 10 req/15min
- Per-tenant quotas via Redis

## Queue System
- BullMQ for email sending
- Per-domain rate limiting
- IP warming schedules
- Exponential backoff retry

## Email Validation
- RFC 5322 format check
- MX record lookup
- SMTP verification
- Disposable domain detection (500+)
- Role account detection (50+)
- Catch-all detection

## External Integrations
- Resend (email sending)
- OpenAI GPT-4o (AI content)
- ZeroBounce/NeverBounce/Kickbox (validation)

## Environment Variables
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
RESEND_API_KEY=re_xxx
OPENAI_API_KEY=sk_xxx
MASTER_ENCRYPTION_KEY=xxx
PORT=3001
```
