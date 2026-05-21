FROM node:20-alpine AS base

# Install dependencies for node-gyp
RUN apk add --no-cache python3 make g++

WORKDIR /app

# ===========================================
# Dependencies
# ===========================================
FROM base AS deps

COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ===========================================
# Builder
# ===========================================
FROM base AS builder

COPY --from=deps /app/node_modules node_modules
COPY . .

RUN npx prisma generate
RUN npm run build || echo "No build configured"

# ===========================================
# Runner
# ===========================================
FROM base AS runner

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Environment
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_URL=postgresql://postgres:postgres@db:5432/emailv \
    REDIS_URL=redis://redis:6379

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "dist/index.js"]