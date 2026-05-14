const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

// Rate limiter
const limiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
app.use('/api/', limiter);

// In-memory database (replace with PostgreSQL in production)
const db = {
  users: new Map(),
  contacts: new Map(),
  campaigns: new Map(),
  templates: new Map(),
  mailLists: new Map(),
  suppressionList: new Set(),
  activities: []
};

// Initialize with demo data
function initDB() {
  // Demo templates
  db.templates.set('tpl1', { id: 'tpl1', name: 'Confirmation', subject: 'Confirm your subscription', body: '<p>Click to confirm:</p><a href="{{confirmation_url}}">Confirm</a>', createdAt: new Date().toISOString() });
  db.templates.set('tpl2', { id: 'tpl2', name: 'Welcome', subject: 'Welcome!', body: '<p>Thank you for joining us, {{name}}!</p>', createdAt: new Date().toISOString() });
  
  // Demo campaigns
  db.campaigns.set('camp1', { id: 'camp1', name: 'Newsletter', subject: 'Weekly Update', status: 'draft', sentCount: 0, openRate: 0, clickRate: 0, createdAt: new Date().toISOString() });
  
  // Demo mail lists
  db.mailLists.set('list1', { id: 'list1', name: 'newsletter', title: 'Weekly Newsletter', description: 'Our weekly updates', subscribers: [], createdAt: new Date().toISOString() });
}
initDB();

// Email transporter
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be 8+ chars' });
  
  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 15*60*1000; // 15 min
  
  db.users.set(token, { email, password: crypto.createHash('sha256').update(password).digest('hex'), expires, verified: false });
  
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Verify Email',
      html: `<a href="${process.env.APP_URL}/verify?token=${token}">Verify</a>`
    });
    res.status(201).json({ message: 'Verification email sent' });
  } catch (err) {
    db.users.delete(token);
    res.status(500).json({ error: 'Email failed' });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const { token } = req.query;
  const user = db.users.get(token);
  if (!user) return res.status(400).json({ error: 'Invalid token' });
  if (Date.now() > user.expires) { db.users.delete(token); return res.status(400).json({ error: 'Expired' }); }
  
  user.verified = true;
  db.users.set('verified_' + user.email, user);
  db.users.delete(token);
  res.send('<h1>Verified! You can now log in.</h1>');
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.users.get('verified_' + email);
  if (!user || !user.verified) return res.status(401).json({ error: 'Invalid' });
  
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  if (hash !== user.password) return res.status(401).json({ error: 'Invalid' });
  
  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.users.set('session_' + sessionToken, { email, createdAt: Date.now() });
  res.json({ token: sessionToken, email });
});

// ==================== CONTACTS ROUTES ====================

app.get('/api/contacts', (req, res) => {
  const contacts = Array.from(db.contacts.values());
  res.json(contacts);
});

app.post('/api/contacts', (req, res) => {
  const { firstName, lastName, email, phone, company, tags } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const contact = {
    id: 'cnt_' + uuidv4(),
    firstName, lastName, email, phone, company, tags: tags || [],
    validity: 'unknown',
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.contacts.set(contact.id, contact);
  logActivity('contact_created', contact);
  res.status(201).json(contact);
});

app.put('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  const contact = db.contacts.get(id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  
  const updated = { ...contact, ...req.body, updatedAt: new Date().toISOString() };
  db.contacts.set(id, updated);
  res.json(updated);
});

app.delete('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  db.contacts.delete(id);
  res.json({ success: true });
});

app.post('/api/contacts/import', (req, res) => {
  const { contacts: newContacts } = req.body;
  const added = [];
  
  newContacts.forEach(c => {
    const contact = {
      id: 'cnt_' + uuidv4(),
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      phone: c.phone || '',
      company: c.company || '',
      validity: 'unknown',
      createdAt: new Date().toISOString()
    };
    db.contacts.set(contact.id, contact);
    added.push(contact);
  });
  
  logActivity('contacts_imported', { count: added.length });
  res.status(201).json({ imported: added.length, contacts: added });
});

// ==================== EMAIL VALIDATION ====================

app.post('/api/validate/email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const result = { email, valid: false, validity: 'invalid', checks: {} };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) { result.reason = 'Invalid format'; return res.json(result); }
  result.checks.format = true;
  
  const domain = email.split('@')[1];
  
  // Disposable check
  const disposable = ['tempmail.com','throwaway.email','10minutemail.com','guerrillamail.com','mailinator.com','yopmail.com','getnada.com'];
  result.checks.disposable = disposable.some(d => domain.includes(d));
  
  // Role check
  const roles = ['info','admin','support','help','noreply','sales'];
  result.checks.role = roles.includes(email.split('@')[0].toLowerCase());
  
  // MX check
  try {
    const mxRes = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX');
    const mxData = await mxRes.json();
    result.checks.mx = (mxData.Answer || []).length > 0;
  } catch { result.checks.mx = false; }
  
  // Determine validity
  if (result.checks.mx && !result.checks.disposable) {
    result.valid = true;
    result.validity = 'valid';
  } else if (result.checks.disposable) {
    result.validity = 'risky';
  }
  
  res.json(result);
});

app.post('/api/validate/batch', async (req, res) => {
  const { emails } = req.body;
  const results = [];
  
  for (const email of emails) {
    const result = { email, valid: false, validity: 'invalid', checks: {} };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
      const domain = email.split('@')[1];
      const disposable = ['tempmail.com','mailinator.com'];
      result.checks.disposable = disposable.some(d => domain.includes(d));
      result.checks.format = true;
      if (!result.checks.disposable && domain) {
        try {
          const mxRes = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX');
          const mxData = await mxRes.json();
          result.checks.mx = (mxData.Answer || []).length > 0;
        } catch { result.checks.mx = false; }
        if (result.checks.mx) { result.valid = true; result.validity = 'valid'; }
      }
    }
    results.push(result);
  }
  
  res.json(results);
});

// ==================== CAMPAIGNS ====================

app.get('/api/campaigns', (req, res) => {
  const campaigns = Array.from(db.campaigns.values());
  res.json(campaigns);
});

app.post('/api/campaigns', (req, res) => {
  const { name, subject, body, templateId, listId } = req.body;
  if (!name || !subject) return res.status(400).json({ error: 'Name and subject required' });
  
  const campaign = {
    id: 'camp_' + uuidv4(),
    name, subject, body, templateId, listId,
    status: 'draft',
    sentCount: 0,
    openCount: 0,
    clickCount: 0,
    createdAt: new Date().toISOString()
  };
  
  db.campaigns.set(campaign.id, campaign);
  logActivity('campaign_created', campaign);
  res.status(201).json(campaign);
});

app.post('/api/campaigns/:id/send', async (req, res) => {
  const { id } = req.params;
  const campaign = db.campaigns.get(id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  
  const contacts = Array.from(db.contacts.values()).filter(c => c.validity === 'valid');
  let sent = 0;
  
  const transporter = createTransporter();
  
  for (const contact of contacts) {
    if (db.suppressionList.has(contact.email)) continue;
    
    try {
      let body = campaign.body || '';
      body = body.replace('{{name}}', contact.firstName || 'Friend');
      body = body.replace('{{email}}', contact.email);
      body = body.replace('{{unsubscribe_url}}', process.env.APP_URL + '/unsubscribe?email=' + encodeURIComponent(contact.email));
      
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: contact.email,
        subject: campaign.subject,
        html: body + '<img src="' + process.env.APP_URL + '/track/open?c=' + campaign.id + '&e=' + encodeURIComponent(contact.email) + '" width="1" height="1" />'
      });
      sent++;
    } catch (err) {
      console.error('Send failed:', err.message);
    }
  }
  
  campaign.sentCount = sent;
  campaign.status = 'sent';
  campaign.sentAt = new Date().toISOString();
  db.campaigns.set(id, campaign);
  
  logActivity('campaign_sent', campaign);
  res.json({ success: true, sent });
});

// ==================== TEMPLATES ====================

app.get('/api/templates', (req, res) => {
  const templates = Array.from(db.templates.values());
  res.json(templates);
});

app.post('/api/templates', (req, res) => {
  const { name, subject, body } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  
  const template = { id: 'tpl_' + uuidv4(), name, subject: subject || '', body: body || '', createdAt: new Date().toISOString() };
  db.templates.set(template.id, template);
  res.status(201).json(template);
});

app.delete('/api/templates/:id', (req, res) => {
  db.templates.delete(req.params.id);
  res.json({ success: true });
});

// ==================== MAIL LISTS ====================

app.get('/api/lists', (req, res) => {
  const lists = Array.from(db.mailLists.values());
  res.json(lists);
});

app.post('/api/lists', (req, res) => {
  const { name, title, description } = req.body;
  if (!name || !title) return res.status(400).json({ error: 'Name and title required' });
  
  const list = { id: 'list_' + uuidv4(), name, title, description: description || '', subscribers: [], createdAt: new Date().toISOString() };
  db.mailLists.set(list.id, list);
  res.status(201).json(list);
});

app.post('/api/lists/:id/subscribe', (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const list = db.mailLists.get(id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!list.subscribers.find(s => s.email === email)) {
    list.subscribers.push({ email, status: 'active', subscribedAt: new Date().toISOString() });
    db.mailLists.set(id, list);
  }
  res.json({ success: true });
});

app.post('/api/lists/:id/unsubscribe', (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const list = db.mailLists.get(id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  list.subscribers = list.subscribers.map(s => s.email === email ? { ...s, status: 'unsubscribed' } : s);
  db.mailLists.set(id, list);
  db.suppressionList.add(email);
  res.json({ success: true });
});

// ==================== TELEMETRY ====================

app.get('/api/telemetry/open', (req, res) => {
  const { c, e } = req.query;
  if (c && e) {
    const campaign = db.campaigns.get(c);
    if (campaign) {
      campaign.openCount = (campaign.openCount || 0) + 1;
      db.campaigns.set(c, campaign);
    }
  }
  // Return 1x1 transparent GIF
  res.set('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

app.get('/api/telemetry/click', (req, res) => {
  const { c, e, url } = req.query;
  if (c) {
    const campaign = db.campaigns.get(c);
    if (campaign) {
      campaign.clickCount = (campaign.clickCount || 0) + 1;
      db.campaigns.set(c, campaign);
    }
  }
  res.redirect(url || '/');
});

// ==================== ACTIVITY LOG ====================

function logActivity(action, details) {
  db.activities.unshift({ id: 'act_' + uuidv4(), action, details, timestamp: new Date().toISOString() });
  if (db.activities.length > 100) db.activities = db.activities.slice(0, 100);
}

app.get('/api/activities', (req, res) => {
  res.json(db.activities.slice(0, 20));
});

// ==================== STATS ====================

app.get('/api/stats', (req, res) => {
  const contacts = Array.from(db.contacts.values());
  res.json({
    total: contacts.length,
    valid: contacts.filter(c => c.validity === 'valid').length,
    invalid: contacts.filter(c => c.validity === 'invalid').length,
    risky: contacts.filter(c => c.validity === 'risky').length,
    campaigns: db.campaigns.size,
    templates: db.templates.size,
    lists: db.mailLists.size
  });
});

// ==================== HEALTH ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

module.exports = app;