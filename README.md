# EmailV Pro - Enterprise Email Marketing Platform

<p align="center">
  <img src="https://img.shields.io/badge/Version-3.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node">
</p>

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push

# Run backend (port 3001)
npm run backend

# Run email worker (separate terminal)
npm run worker

# Run frontend (port 3000)
npm run dev
```

## 📋 Features

### Contact Management
- Multi-format import (CSV, VCF, JSON, XML, TSV, LDIF)
- Advanced email validation (RFC 5322, MX, SMTP)
- Disposable domain detection (500+ domains)
- Role-based email detection
- Tags, Groups, Favorites organization
- Duplicate finder & smart merge
- Bulk edit operations
- Import history & backup/restore

### Email Sending
- SMTP integration (nodemailer)
- External validation APIs (ZeroBounce, NeverBounce, Kickbox)
- Template management system
- BullMQ email queue with rate limiting
- Domain-based throttling
- IP warming with reputation tracking

### AI Features
- GPT-4o structured outputs
- 8 email types (welcome, promotional, newsletter, etc.)
- 6 tone options
- Subject line generation
- Contact segmentation
- SEO analysis

### Enterprise Security
- Multi-tenant isolation (Prisma extensions)
- Rate limiting (Redis sliding window)
- Credential vault (AES-256-GCM encryption)
- Token-based authentication
- API key management

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts` | Import contacts |
| GET | `/api/contacts` | List contacts |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |
| POST | `/api/contacts/bulk-edit` | Bulk operations |
| GET | `/api/contacts/duplicates` | Find duplicates |
| POST | `/api/contacts/merge` | Merge contacts |
| POST | `/api/validate` | Validate emails |
| POST | `/api/templates` | Create template |
| GET | `/api/templates` | List templates |
| POST | `/api/smtp` | Configure SMTP |
| POST | `/api/smtp/test` | Test SMTP |
| POST | `/api/seo/analyze` | Analyze SEO |
| POST | `/api/ai/generate-content` | AI content |
| POST | `/api/ai/create-campaign` | AI campaign |

## 🔧 Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/emailv
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=re_xxx
OPENAI_API_KEY=sk_xxx
MASTER_ENCRYPTION_KEY=your_key
PORT=3001
```

## 📁 Project Structure

```
src/
├── controllers/     # API route handlers
├── services/        # Business logic
├── queue/          # Background workers
├── app/            # Next.js frontend
└── index.ts        # Express server
```

## License

MIT - EmailV Pro 2024
