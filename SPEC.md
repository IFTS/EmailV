# Contact Manager Pro - Specification Document

## 1. Project Overview

**Project Name:** Contact Manager Pro  
**Type:** Single-Page Web Application  
**Core Functionality:** A full-featured contact management system with import/export capabilities, contact editing, email validation, and mass email campaign features.  
**Target Users:** Small business owners, marketers, and anyone managing contact lists.

---

## 2. UI/UX Specification

### Layout Structure

**Page Sections:**
- **Header** - App title, navigation tabs
- **Sidebar** - Quick actions and filter panel (280px width)
- **Main Content Area** - Dynamic content based on selected tab
- **Modal Overlays** - For imports, exports, editing, and email campaigns

**Responsive Breakpoints:**
- Desktop: > 1024px (full sidebar)
- Tablet: 768px - 1024px (collapsible sidebar)
- Mobile: < 768px (hamburger menu, stacked layout)

### Visual Design

**Color Palette:**
- Primary: `#1a1a2e` (Deep Navy)
- Secondary: `#16213e` (Dark Blue)
- Accent: `#e94560` (Coral Red)
- Accent Hover: `#ff6b6b` (Light Coral)
- Success: `#00d9a5` (Mint Green)
- Warning: `#ffc93c` (Golden Yellow)
- Error: `#ff4757` (Bright Red)
- Text Primary: `#eaeaea` (Off White)
- Text Secondary: `#a0a0a0` (Gray)
- Background: `#0f0f1a` (Near Black)
- Card Background: `#1a1a2e` (Deep Navy)
- Border: `#2d2d44` (Muted Purple)

**Typography:**
- Heading Font: `'Sora', sans-serif` (Google Fonts)
- Body Font: `'DM Sans', sans-serif` (Google Fonts)
- Monospace: `'JetBrains Mono', monospace`
- H1: 32px, weight 700
- H2: 24px, weight 600
- H3: 18px, weight 600
- Body: 14px, weight 400
- Small: 12px, weight 400

**Spacing System:**
- Base unit: 8px
- XS: 4px, SM: 8px, MD: 16px, LG: 24px, XL: 32px, XXL: 48px

**Visual Effects:**
- Card shadows: `0 4px 24px rgba(0, 0, 0, 0.4)`
- Hover transitions: 0.3s cubic-bezier(0.4, 0, 0.2, 1)
- Button hover: scale(1.02), brightness increase
- Modal backdrop: rgba(0, 0, 0, 0.8) with blur(8px)
- Border radius: 12px for cards, 8px for buttons, 6px for inputs

### Components

**Navigation Tabs:**
- Contacts, Import, Export, Validate Emails, Email Campaign
- States: default, hover (accent underline), active (accent background)

**Contact Cards:**
- Avatar circle with initials
- Name, email, phone display
- Quick action icons (edit, delete, validate)
- Checkbox for batch operations
- States: default, selected (accent border), hover (lift effect)

**Buttons:**
- Primary: Accent background, white text
- Secondary: Transparent, accent border
- Icon buttons: circular, subtle background
- States: default, hover, active, disabled

**Form Inputs:**
- Dark background with subtle border
- Focus state: accent border glow
- Error state: error border + message
- Labels above inputs

**Modals:**
- Centered, max-width 600px
- Close button top-right
- Smooth fade + scale animation

**Data Tables:**
- Alternating row colors
- Sortable columns with indicators
- Pagination controls
- Bulk action bar

**Toast Notifications:**
- Bottom-right positioned
- Auto-dismiss after 3s
- Types: success, error, warning, info

---

## 3. Functionality Specification

### Core Features

#### 3.1 Contact Import
**Supported Formats:**
- CSV (Comma-Separated Values)
- VCF/vCard (Version 3.0, 4.0)
- JSON (Array of contact objects)
- XML (Standard contact format)
- TSV (Tab-Separated Values)
- LDIF (LDAP Data Interchange Format)

**Import Process:**
1. Drag-and-drop or file picker
2. Auto-detect format
3. Preview contacts before import
4. Map fields (auto-map common fields)
5. Handle duplicates (skip, merge, replace)
6. Show import summary

**Field Mapping:**
- Name → First Name, Last Name, Full Name
- Email → Email, Email Address, Mail
- Phone → Phone, Phone Number, Mobile, Cell
- Company → Company, Organization, Business
- Address → Address, Street, City, State, Zip, Country
- Notes → Notes, Comments, Description
- Custom fields supported

#### 3.2 Contact Management (CRUD)
**Create:**
- Add single contact via form
- Required: Name or Email
- Optional: All other fields

**Read:**
- List view with pagination (25, 50, 100 per page)
- Search by any field
- Filter by group, tags, validity
- Sort by any column

**Update:**
- Edit via modal form
- Batch edit selected contacts
- Quick inline edit for common fields

**Delete:**
- Single contact with confirmation
- Batch delete selected
- Soft delete (recoverable for 30 days)

#### 3.3 Contact Editing & Fixing
**Data Cleaning:**
- Trim whitespace
- Proper case (John Doe, not JOHN DOE)
- Standardize phone formats
- Fix common email typos (.com vs .co, gmail.com vs goglemail.com)
- Remove duplicates

**Validation:**
- Email format validation
- Phone number format check
- Required field validation
- Duplicate detection

**Fix Suggestions:**
- Suggest corrections for invalid emails
- Suggest proper case for names
- Suggest phone format normalization

#### 3.4 Email Validation
**Validation Methods:**
- Format validation (regex)
- Domain check (MX records)
- Disposable email detection
- Role-based email detection (info@, admin@)
- Typo detection (gamil.com → gmail.com)

**Validation Status:**
- Valid (✓ green)
- Invalid (✗ red)
- Risky (⚠ yellow) - disposable/role
- Unknown (?) gray - not checked
- Checking... (↻ animated)

**Batch Validation:**
- Queue-based processing
- Rate limiting
- Progress indicator
- Results export

#### 3.5 Mass Email Campaign
**Campaign Features:**
- Compose email with rich text editor
- Template variables: {{name}}, {{email}}, {{company}}
- Preview per recipient
- Personalization tokens
- Attachment support (future)

**Confirmation Page:**
- Customizable message
- "Do you want to continue subscribing?"
- Yes/No response links
- One-click unsubscribe
- Responsive email template

**Sending Options:**
- Send to all contacts
- Send to validated only
- Send to selected groups
- Schedule sending (future)

**Delivery Tracking:**
- Sent count
- Opened count (with tracking pixel)
- Clicked count
- Bounced count

### User Interactions

**Keyboard Shortcuts:**
- `Ctrl/Cmd + I` - Import
- `Ctrl/Cmd + E` - Export
- `Ctrl/Cmd + F` - Search
- `Ctrl/Cmd + N` - New contact
- `Delete` - Delete selected
- `Escape` - Close modals

**Drag and Drop:**
- Import zone accepts files
- Reorder contacts in list
- Move to groups

### Data Handling

**Storage:**
- LocalStorage for persistence
- Export to file
- Import from file

**Data Structure:**
```json
{
  "contacts": [{
    "id": "uuid",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "company": "string",
    "address": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string",
    "notes": "string",
    "tags": ["array"],
    "group": "string",
    "validity": "valid|invalid|risky|unknown",
    "validatedAt": "timestamp",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }]
}
```

### Edge Cases

- Empty file import
- Malformed file handling
- Very large files (>10k contacts)
- Duplicate detection
- Invalid characters in fields
- Missing required fields
- Network errors during validation

---

## 4. Acceptance Criteria

### Visual Checkpoints
- [ ] Dark theme renders correctly
- [ ] All fonts load properly
- [ ] Animations are smooth
- [ ] Responsive layout works
- [ ] Modals center properly

### Functional Checkpoints
- [ ] CSV import works with preview
- [ ] VCF import works
- [ ] JSON import works
- [ ] Contact list displays with pagination
- [ ] Search filters contacts
- [ ] Edit contact saves
- [ ] Delete contact removes
- [ ] Email validation shows status
- [ ] Mass email compose works
- [ ] Confirmation page generates with tokens
- [ ] Export to CSV works
- [ ] Data persists on refresh

### Error Handling
- [ ] Invalid file shows error
- [ ] Network error handled gracefully
- [ ] Empty state displays message
- [ ] Validation runs without blocking UI