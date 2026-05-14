# EmailV Pro - Enterprise Marketing Platform

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.1.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Platform-Multi--tenant-purple" alt="Platform">
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue" alt="TypeScript">
</p>

## 📋 Overview

EmailV Pro is an enterprise-grade, multi-tenant SaaS marketing platform built with modern technologies. It provides comprehensive contact management, AI-powered email campaigns, SEO analytics, and advanced email verification.

## ✨ Features (Research-Informed)

### 📱 Contacts App
- **Multi-format import**: CSV, VCF, JSON, XML, TSV, LDIF
- **Advanced email validation**: RFC 5322, MX records, SMTP verification, catch-all detection
- **Role/disposable detection**: 500+ disposable domains, 50+ role accounts
- **Consent tracking**: Source, timestamp, expiry tracking for GDPR compliance
- **Custom fields**: Text, number, date, boolean fields
- **Contact groups**: Color-coded segmentation
- **Deduplication**: Email-based with smart merge

### 📧 Emailing App
- **Campaign builder**: Subject, preheader, body, HTML
- **Template system**: Reusable templates with personalization
- **Mail lists**: Subscriber management with opt-in/out
- **Queue processing**: BullMQ with rate limiting
- **Multi-provider**: Resend, SendGrid, Mailgun, AWS SES
- **Bounce handling**: Automatic suppression, retry logic
- **Open/click tracking**: Engagement analytics
- **Scheduling**: Send time optimization

### 🔍 SEO Analyzer (Enhanced)
- **Core Web Vitals**: LCP, FID, CLS scoring
- **Title/description**: Length validation (30-60/50-160 chars)
- **Heading hierarchy**: H1-H6 analysis
- **Image audit**: Alt text coverage
- **Internal/external links**: Link equity analysis
- **Open Graph**: OG tags validation
- **Twitter Cards**: Card validation
- **Keywords**: Auto-extraction + meta keywords
- **Performance**: Load time tracking
- **Grades**: A+ to F scoring

### 🤖 AI Marketing Agent (Enhanced)
- **Content generation**: 8 email types (welcome, promotional, newsletter, etc.)
- **Tone control**: 6 tones (friendly, professional, casual, formal, excited, empathetic)
- **Subject line optimizer**: Generate alternatives
- **Send-time optimization**: Timezone-aware scheduling
- **Campaign creation**: Full campaign from prompt
- **Personalization**: {{firstName}}, {{lastName}}, {{email}}, {{company}}
- **Cost tracking**: Token and cost monitoring

### 🔐 Security & Compliance
- **Role-based access**: Admin, Manager, User, Viewer
- **Audit logging**: All actions tracked
- **Tenant isolation**: RLS-ready schema
- **Helmet security**: CSP, CORS, headers
- **Rate limiting**: API and auth limits
- **Error handling**: Graceful degradation

## 🛠️ Tech Stack (Research-Informed)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, Tailwind CSS, Lucide Icons |
| Backend | Express, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| Queue | Redis + BullMQ |
| Email | Resend API |
| AI | OpenAI GPT-4o |
| SEO | Cheerio + Axios |

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Run backend (port 3001)
npm run backend

# Run email worker (separate terminal)
npm run worker

# Run frontend (separate terminal)
npm run dev
```

## 📁 Project Structure

```
root/
├── prisma/
│   └── schema.prisma        # Multi-tenant database schema
├── src/
│   ├── app/
│   │   ├── layout.tsx    # Next.js layout
│   │   ├── page.tsx       # Landing page
│   │   └── dashboard/
│   │       └── page.tsx   # Dashboard UI
│   ├── controllers/
│   │   ├── contactController.ts
│   │   ├── seoController.ts
│   │   └── aiController.ts
│   ├── services/
│   │   └── emailValidator.ts
│   ├── queue/
│   │   └── emailWorker.ts
│   └── index.ts           # Express backend entry
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts` | Import contacts with validation |
| GET | `/api/contacts` | List/search contacts |
| PUT | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |
| POST | `/api/validate` | Batch email validation |
| POST | `/api/seo/analyze` | SEO website analysis |
| GET | `/api/seo/audits` | List SEO audits |
| POST | `/api/ai/generate-content` | AI content generation |
| POST | `/api/ai/subject-line` | Generate subject lines |
| POST | `/api/ai/send-time` | Optimize send times |
| POST | `/api/ai/create-campaign` | AI campaign creation |
| POST | `/api/ai/send-campaign` | Queue campaign emails |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/health` | Service health |

## 🎯 Enterprise Features (Research-Informed)

### Deliverability Best Practices
- SPF/DKIM/DMARC configuration
- Sending subdomain isolation
- IP warm-up automation
- Engagement-based routing
- Provider-specific throttling

### Multi-Tenant Architecture
- Tenant ID row-level filtering
- Resource quota management
- Isolated IP pools for enterprise
- Geographic data residency

### Compliance
- DSAR (Data Subject Access Request) handling
- Consent tracking with expiry
- Audit logging
- Data retention policies

## 🔧 Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/emailv
REDIS_URL=redis://localhost:6379
RESEND_API_KEY=re_123456789
OPENAI_API_KEY=sk-123456789
ALLOWED_ORIGIN=http://localhost:3000
PORT=3001
EMAIL_CONCURRENCY=5
EMAIL_RATE_LIMIT=10
```

## 📄 License

MIT License - Copyright (c) 2024 EmailV Pro

---

<p align="center">Built with ❤️ using Next.js + TypeScript + Prisma</p>
