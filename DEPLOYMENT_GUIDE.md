# EmailV Deployment Guide - Linux Mint

## Opening Terminal

**Method 1:** Press `Ctrl + Alt + T`  
**Method 2:** Click Terminal icon in taskbar (bottom-left)  
**Method 3:** Press `Super` (Windows key) → type "terminal" → press Enter

---

## Finding Your Project Path

First, find where EmailV is installed:

```bash
# Option A: In your home folder
ls ~ | grep -i email

# Option B: Search for it
find ~ -maxdepth 3 -type d -iname "*emailv*" 2>/dev/null

# Option C: Check common locations
ls ~/_emailv 2>/dev/null || ls ~/projects/EmailV 2>/dev/null || ls ~/EmailV 2>/dev/null
```

---

## Detailed Steps

### Step 1: Navigate to Project

```bash
# Replace PATH with actual path from above
cd PATH/EmailV

# Example if in home folder:
cd ~/_emailv/EmailV

# Verify you're in the right place:
ls -la
# You should see: package.json, prisma/, src/, etc.
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- bcrypt (password hashing)
- zod (validation)
- prisma (database)
- All other packages listed in package.json

### Step 3: Check Environment Variables

```bash
# Check if .env file exists
ls -la .env

# View current settings (don't share!)
cat .env
```

Make sure these are set:
```
DATABASE_URL=postgresql://user:password@localhost:5432/emailv
REDIS_URL=redis://localhost:6379
MASTER_ENCRYPTION_KEY=your_32char_key_here
```

### Step 4: Run Database Migration

```bash
npx prisma migrate dev --name add_auth_attempt_and_password_hash
```

What this does:
1. Creates new table `AuthAttempt` for tracking login attempts
2. Adds `passwordHash` column (renames from `password`)
3. Updates database schema

**If it asks about existing data:** The legacy SHA256 passwords will be copied but users need to reset them.

### Step 5: Regenerate Prisma Client

```bash
npx prisma generate
```

This updates the TypeScript types to match the new database schema.

### Step 6: Restart the Server

```bash
# Check if running with PM2:
pm2 status

# If running, restart:
pm2 restart all

# If not using PM2, find the process:
ps aux | grep -E "tsx|node" | grep -v grep
```

### Step 7: Run Password Audit

```bash
npm run password:audit
```

Sample output:
```
📊 Password Audit:
  - bcrypt: 15
  - legacy/other: 3
```

If "legacy/other" > 0, those users need to reset passwords.

---

## Common Issues

### Issue 1: "npx: command not found"

```bash
# Install npx globally
npm install -g npx

# Or use this instead:
./node_modules/.bin/prisma migrate dev
```

### Issue 2: Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Start if stopped
sudo systemctl start postgresql
```

### Issue 3: Redis Connection Failed

```bash
# Check Redis
sudo systemctl status redis-server

# Start if stopped
sudo systemctl start redis-server
```

### Issue 4: Port Already in Use

```bash
# Find what's using port 3001
sudo lsof -i :3001

# Kill it if needed
sudo kill -9 PROCESS_ID
```

---

## Quick Test Commands

```bash
# Health check
curl http://localhost:3001/api/health

# Check logs (if using PM2)
pm2 logs

# Check for errors
dmesg | tail -20
```

---

## Rollback (If Something Goes Wrong)

```bash
# Undo last migration
npx prisma migrate rollback

# Or reset completely (WARNING: deletes data)
npx prisma migrate reset
```

---

Still stuck? Let me know:
1. Which step you're on
2. What error message you see