import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface WarmupHistory {
  date: string;
  sent: number;
  opens: number;
  clicks: number;
  bounces: number;
  complaints: number;
}

interface IpWarmingConfig {
  ip: string;
  dailyLimit: number;
  currentCount: number;
  lastReset: number;
  reputation: number;
  warmupPhase: 'cold' | 'warming' | 'warm' | 'active' | 'paused';
  history: WarmupHistory[];
}

interface ReputationMetrics {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    volume: number;
    engagement: number;
    complaints: number;
    bounces: number;
    age: number;
  };
}

const WARMUP_SCHEDULE = {
  cold: 10,
  warming: 50,
  warm: 200,
  active: 1000,
  paused: 0
};

const IP_WARMING_PREFIX = 'ip_warming:';
const REPUTATION_KEY = 'reputation:scores';

export async function createIpWarmingProfile(
  ip: string,
  dailyLimit: number = 10
): Promise<IpWarmingConfig> {
  const config: IpWarmingConfig = {
    ip,
    dailyLimit,
    currentCount: 0,
    lastReset: Date.now(),
    reputation: 0,
    warmupPhase: 'cold',
    history: []
  };

  await redis.set(`${IP_WARMING_PREFIX}${ip}`, JSON.stringify(config), 'EX', 86400 * 30);
  return config;
}

export async function getIpWarmingProfile(ip: string): Promise<IpWarmingConfig | null> {
  const data = await redis.get(`${IP_WARMING_PREFIX}${ip}`);
  return data ? JSON.parse(data) : null;
}

export async function canSendEmail(ip: string): Promise<boolean> {
  const config = await getIpWarmingProfile(ip);
  if (!config) return true;

  const now = Date.now();
  if (now - config.lastReset > 86400000) {
    config.currentCount = 0;
    config.lastReset = now;
    await redis.set(`${IP_WARMING_PREFIX}${ip}`, JSON.stringify(config));
  }

  return config.currentCount < config.dailyLimit;
}

export async function recordSentEmail(
  ip: string,
  outcome: 'sent' | 'open' | 'click' | 'bounce' | 'complaint'
): Promise<void> {
  const config = await getIpWarmingProfile(ip);
  if (!config) return;

  config.currentCount++;

  const today = new Date().toISOString().split('T')[0];
  const todayEntry = config.history.find(h => h.date === today);

  if (todayEntry) {
    if (outcome === 'sent') todayEntry.sent++;
    if (outcome === 'open') todayEntry.opens++;
    if (outcome === 'click') todayEntry.clicks++;
    if (outcome === 'bounce') todayEntry.bounces++;
    if (outcome === 'complaint') todayEntry.complaints++;
  } else {
    config.history.push({
      date: today,
      sent: outcome === 'sent' ? 1 : 0,
      opens: outcome === 'open' ? 1 : 0,
      clicks: outcome === 'click' ? 1 : 0,
      bounces: outcome === 'bounce' ? 1 : 0,
      complaints: outcome === 'complaint' ? 1 : 0
    });
  }

  if (config.history.length > 30) {
    config.history = config.history.slice(-30);
  }

  await updateWarmupPhase(ip, config);
  await redis.set(`${IP_WARMING_PREFIX}${ip}`, JSON.stringify(config));
}

async function updateWarmupPhase(
  ip: string,
  config: IpWarmingConfig
): Promise<void> {
  const last30Days = config.history.slice(-30);
  const totalSent = last30Days.reduce((sum, h) => sum + h.sent, 0);
  const totalOpens = last30Days.reduce((sum, h) => sum + h.opens, 0);
  const totalClicks = last30Days.reduce((sum, h) => sum + h.clicks, 0);
  const totalBounces = last30Days.reduce((sum, h) => sum + h.bounces, 0);
  const totalComplaints = last30Days.reduce((sum, h) => sum + h.complaints, 0);

  const volume = Math.min(100, (totalSent / 1000) * 100);
  const engagement = totalSent > 0 ? ((totalOpens + totalClicks) / totalSent) * 100 : 0;
  const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
  const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;

  let score = 100;
  score -= Math.max(0, 100 - volume);
  score -= Math.max(0, 50 - engagement);
  score -= bounceRate * 5;
  score -= complaintRate * 20;
  score = Math.max(0, Math.min(100, score));

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';

  config.reputation = score;
  config.warmupPhase = score >= 95 ? 'active' : score >= 70 ? 'warm' : score >= 40 ? 'warming' : 'cold';

  config.dailyLimit = WARMUP_SCHEDULE[config.warmupPhase];

  await redis.zadd(REPUTATION_KEY, score, ip);
}

export async function getReputation(ip: string): Promise<ReputationMetrics | null> {
  const config = await getIpWarmingProfile(ip);
  if (!config) return null;

  const last30Days = config.history.slice(-30);
  const totalSent = last30Days.reduce((sum, h) => sum + h.sent, 0);
  const totalOpens = last30Days.reduce((sum, h) => sum + h.opens, 0);
  const totalClicks = last30Days.reduce((sum, h) => sum + h.clicks, 0);
  const totalBounces = last30Days.reduce((sum, h) => sum + h.bounces, 0);
  const totalComplaints = last30Days.reduce((sum, h) => sum + h.complaints, 0);

  const score = config.reputation;
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 95) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 30) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    factors: {
      volume: Math.min(100, (totalSent / 1000) * 100),
      engagement: totalSent > 0 ? ((totalOpens + totalClicks) / totalSent) * 100 : 0,
      complaints: totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0,
      bounces: totalSent > 0 ? (totalBounces / totalSent) * 100 : 0,
      age: config.history.length
    }
  };
}
