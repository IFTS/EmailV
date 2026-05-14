const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

// Simulated Database (replace with real DB in production)
const usersDb = new Map();

// Email Configuration using Environment Variables
const createTransporter = () => {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Validation Constants
const TOKEN_EXPIRY_MINUTES = 15;
const VERIFICATION_EXPIRY = TOKEN_EXPIRY_MINUTES * 60 * 1000;

// 1. Signup and Generate Token Route
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  // Input validation - strict RegEx
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Check if already exists
  for (const [token, user] of usersDb) {
    if (user.email === email && user.isVerified) {
      return res.status(409).json({ error: 'Email already registered and verified' });
    }
  }

  // Generate secure token using crypto.randomBytes
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const tokenExpires = Date.now() + VERIFICATION_EXPIRY;

  // Store user with is_verified: false
  usersDb.set(verificationToken, {
    email,
    password: crypto.createHash('sha256').update(password).digest('hex'), // Hash password
    expires: tokenExpires,
    isVerified: false,
    createdAt: new Date().toISOString()
  });

  const verificationUrl = `${process.env.APP_URL}/api/auth/verify?token=${verificationToken}`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${process.env.APP_NAME}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Please click the button below to verify your email address.</p>
          <p>This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background: #e94560; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">If you didn't create this account, you can safely ignore this email.</p>
        </div>
      `
    });
    res.status(201).json({ message: 'Registration initiated. Verification email sent.' });
  } catch (err) {
    usersDb.delete(verificationToken);
    res.status(500).json({ error: 'Email delivery failed. Try again later.' });
  }
});

// 2. Token Validation Route
app.get('/api/auth/verify', (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Invalid token format' });
  }

  const user = usersDb.get(token);

  if (!user) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  // Check expiration
  if (Date.now() > user.expires) {
    usersDb.delete(token);
    return res.status(400).json({ error: 'Verification token has expired' });
  }

  // Mark as verified and nullify token (prevent replay)
  user.isVerified = true;
  user.verifiedAt = new Date().toISOString();
  
  // Store verified user separately and remove verification token
  usersDb.set('verified_' + user.email, user);
  usersDb.delete(token);

  res.status(200).send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #00d9a5;">✓ Email Verified!</h1>
        <p>You can now log in to your account.</p>
      </body>
    </html>
  `);
});

// 3. Login Route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const user = usersDb.get('verified_' + email);
  if (!user || !user.isVerified) {
    return res.status(401).json({ error: 'Invalid credentials or email not verified' });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  if (passwordHash !== user.password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  usersDb.set('session_' + sessionToken, { email, createdAt: Date.now() });

  res.json({ 
    message: 'Login successful',
    sessionToken,
    email: user.email
  });
});

// 4. Email Verification API (for contacts)
app.post('/api/verify/email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const domain = email.split('@')[1];
  if (!domain) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    // Check MX records
    const mxResponse = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    const mxData = await mxResponse.json();
    const hasMX = (mxData.Answer || []).length > 0;

    // Check SPF
    const spfResponse = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`);
    const spfData = await spfResponse.json();
    const hasSPF = (spfData.Answer || []).some(r => r.data.includes('v=spf1'));

    // Check disposable
    const disposableDomains = ['tempmail.com', 'mailinator.com', 'yopmail.com', 'guerrillamail.com'];
    const isDisposable = disposableDomains.includes(domain);

    // Response
    const result = {
      email,
      valid: hasMX,
      deliverable: hasMX && !isDisposable,
      checks: {
        mx: hasMX,
        spf: hasSPF,
        disposable: isDisposable,
        format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      }
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;