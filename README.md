# EmailV Pro - Enterprise Marketing Platform

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Platform-Multi--tenant-purple" alt="Platform">
</p>

## 📋 Overview

EmailV Pro is an enterprise-grade, multi-tenant SaaS marketing platform built with modern technologies. It provides comprehensive contact management, email campaign automation, AI-powered content generation, and SEO analytics.

## ✨ Features

### 📱 Contacts App
- Import contacts from multiple formats (CSV, VCF, JSON, XML, TSV, LDIF)
- Export to CSV, JSON, or vCard
- Email validation with deep verification (RFC 5322, MX, SMTP)
- Duplicate detection and merging
- Custom fields and contact groups

### 📧 Emailing App
- Email campaigns with templates
- Mass mailing with queue processing
- Multi-provider support (Resend, SendGrid, Mailgun, AWS SES)
- Bounce tracking and management

### 🔍 SEO App
- Website SEO analysis
- Core Web Vitals scoring
- Title/Meta tag validation
- Image alt attribute checking
- H1-H6 hierarchy analysis

### 🤖 AI Marketing Agent
- GPT-4 powered content generation
- Automated campaign creation
- Tone-specific email writing
- Newsletter, promotional, welcome emails

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-------------|
| Frontend | Next.js 14, Tailwind CSS, Lucide Icons |
| Backend | Express, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| Queue | Redis + BullMQ |
| Email | Resend API |
| AI | OpenAI GPT-4o |

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
│   │   ├── layout.tsx      # Next.js layout
│   │   ├── page.tsx        # Landing page
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
│   └── index.ts            # Express backend entry
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
| POST | `/api/ai/create-campaign` | AI campaign creation |
| POST | `/api/ai/send-campaign` | Queue campaign emails |
| GET | `/api/stats` | Dashboard statistics |

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

<p align="center">Built with ❤️ using Next.js + TypeScript</p>
