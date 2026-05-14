# EmailV Pro - Enterprise Specification

## 1. Project Overview

**Project Name:** EmailV Pro (IFTS/EmailV)
**Type:** Enterprise Contact Management & Mass Email Marketing Platform
**Core Functionality:** Complete email verification, contact management, campaign automation, and mass emailing system
**Target Users:** Marketers, CRM managers, sales teams, and enterprises

---

## 2. Architecture

### Technology Stack
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend:** Node.js 18+, Express.js
- **Security:** Helmet.js, CORS, Rate Limiting
- **Email:** Nodemailer with SMTP
- **Validation:** DNS MX/SPF/DMARC lookups

### Repository Structure
```
/
├── index.html           # Frontend SPA
├── backend/
│   └── server.js       # Express API server
├── package.json       # Dependencies
├── .env.example       # Environment template
├── .gitignore         # Git ignore rules
├── SPEC.md           # This file
└── .github/
    └── workflows/
        └── ci.yml    # CI pipeline
```

---

## 3. Validation Methods

### Email Verification (Multi-Layer)
1. **Format Check** - RFC 5322 compliant regex
2. **MX Record Check** - DNS resolution for mail servers
3. **SPF Check** - DNS TXT record validation
4. **DMARC Check** - Domain policy validation
5. **Disposable Detection** - Temporary email blocking (40+ providers)
6. **Role Detection** - info@, admin@, support@ flagging

### Disposable Email Providers
- tempmail.com, throwaway.email, 10minutemail.com
- guerrillamail.com, mailinator.com, yopmail.com
- getnada.com, sharklasers.com, mintemail.com
- maildrop.cc, mohmal.com, tempail.com, spam4.me
- And 30+ more...

### Role-Based Accounts
- info, admin, support, help, noreply
- sales, contact, webmaster, hostmaster
- postmaster, abuse, security, team, staff

---

## 4. API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Register with email verification |
| GET | /api/auth/verify | Verify email token (15min TTL) |
| POST | /api/auth/login | Session login |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/contacts | List all contacts |
| POST | /api/contacts | Create contact |
| PUT | /api/contacts/:id | Update contact |
| DELETE | /api/contacts/:id | Delete contact |
| POST | /api/contacts/import | Batch import |

### Validation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/validate/email | Single email validation |
| POST | /api/validate/batch | Batch validation |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/campaigns | List campaigns |
| POST | /api/campaigns | Create campaign |
| POST | /api/campaigns/:id/send | Send campaign |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/templates | List templates |
| POST | /api/templates | Create template |
| DELETE | /api/templates/:id | Delete template |

### Mail Lists
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/lists | List mail lists |
| POST | /api/lists | Create list |
| POST | /api/lists/:id/subscribe | Subscribe |
| POST | /api/lists/:id/unsubscribe | Unsubscribe |

### Telemetry
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/telemetry/open | Open tracking (1x1 GIF) |
| GET | /api/telemetry/click | Click tracking redirect |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/stats | Dashboard stats |
| GET | /api/activities | Activity log |

---

## 5. Security Features

- **Token Generation:** crypto.randomBytes(32) for secure tokens
- **Password Hashing:** SHA256 for verification tokens
- **Token Expiry:** 15-minute verification TTL
- **Rate Limiting:** 100 requests per 15 minutes
- **Helmet.js:** Security headers
- **CORS:** Configured for cross-origin requests
- **Suppression List:** Tracks unsubscribes/bounces

---

## 6. Frontend Features

### Dashboard
- Statistics cards (Total, Valid, Invalid, Risky)
- Quick action buttons

### Contact Management
- Add/Edit/Delete contacts
- Import (CSV, VCF, JSON, XML, TSV, LDIF)
- Export (CSV, JSON, vCard)
- Search and filter
- Bulk actions

### Email Tools
- Email validator with progress
- Email spider (website scraping)
- Duplicate finder

### Campaign
- Create campaigns
- Template selection
- Personalization ({{name}}, {{email}})
- Open/click tracking

### Mail Lists
- Create lists
- Subscribe/unsubscribe

### Settings
- SMTP configuration
- Email service API
- Validation settings
- Backup/restore

---

## 7. Environment Variables

```env
PORT=3000
NODE_ENV=production
APP_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@email.com
SMTP_PASS=app_password
```

---

## 8. Running

### Frontend
Open index.html in browser

### Full Stack
```bash
npm install
cp .env.example .env
# Configure .env
npm start
```

Server: http://localhost:3000

---

*Last Updated: 2026-05-14*
*Version: 2.0.0*
*License: MIT*
