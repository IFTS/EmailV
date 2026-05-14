import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface IpWarmingConfig {
  ip: string;
  dailyLimit: number;
  currentCount: number;
  lastReset: number;
  reputation: number;
  warmupPhase: 'cold' | 'warming' | 'warm' | 'active' | 'paused';
  history: Array<{ date: string; sent: number; opens: number; clicks: number; bounces: number; complaints: number };
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

const WARMUP_SCHEDULE = [
  { day: 1, limit: 50, phase: 'cold' },
  { day: 2, limit: 100, phase: 'warming' },
  { day: 3, limit: 200, phase: 'warming' },
  { day: 4, limit: 400, phase: 'warming' },
  { day: 5, limit: 800, phase: 'warming' },
  { day: 6, limit: 1500, phase: 'warming' },
  { day: 7, limit: 2500, phase: 'warm' },
  { day: 8, limit: 4000, phase: 'warm' },
  { day: 9, limit: 6000, phase: 'warm' },
  { day: 10, limit: 8000, phase: 'warm' },
  { day: 14, limit: 15000, phase: 'warm' },
  { day: 21, limit: 25000, phase: 'active' },
  { day: 28, limit: 50000, phase: 'active' }
];

export async function initializeIpWarming(ip: string): Promise<IpWarmingConfig> {
  const key = `ipwarm:${ip}`;
  
  const config: IpWarmingConfig = {
    ip,
    dailyLimit: 50,
    currentCount: 0,
    lastReset: Date.now(),
    reputation: 0,
    warmupPhase: 'cold',
    history: []
  };
  
  await redis.hset(key, {
    dailyLimit: '50',
    currentCount: '0',
    lastReset: Date.now().toString(),
    reputation: '0',
    warmupPhase: 'cold',
    history: JSON.stringify([])
  });
  
  return config;
}

export async function checkIpSendingLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  phase: string;
}> {
  const key = `ipwarm:${ip}`;
  const exists = await redis.exists(key);
  
  if (!exists) {
    await initializeIpWarming(ip);
  }
  
  const config = await redis.hgetall(key);
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  
  if (parseInt(config.lastReset || '0') < dayStart) {
    await redis.hset(key, {
      currentCount: '0',
      lastReset: Date.now().toString()
    });
    config.currentCount = '0';
  }
  
  const currentCount = parseInt(config.currentCount || '0');
  const dailyLimit = parseInt(config.dailyLimit || '50');
  
  return {
    allowed: currentCount < dailyLimit,
    remaining: Math.max(0, dailyLimit - currentCount),
    limit: dailyLimit,
    phase: config.warmupPhase || 'cold'
  };
}

export async function recordIpSent(ip: string, count: number = 1): Promise<void> {
  const key = `ipwarm:${ip}`;
  await redis.hincrby(key, 'currentCount', count);
  
  const statsKey = `ipstats:${ip}:${new Date().toISOString().split('T')[0]}`;
  await redis.hincrby(statsKey, 'sent', count);
  await redis.expire(statsKey, 90 * 24 * 60 * 60);
}

export async function recordIpMetrics(
  ip: string, 
  opens: number = 0, 
  clicks: number = 0, 
  bounces: number = 0, 
  complaints: number = 0
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const statsKey = `ipstats:${ip}:${today}`;
  
  const pipeline = redis.multi();
  if (opens > 0) pipeline.hincrby(statsKey, 'opens', opens);
  if (clicks > 0) pipeline.hincrby(statsKey, 'clicks', clicks);
  if (bounces > 0) pipeline.hincrby(statsKey, 'bounces', bounces);
  if (complaints > 0) pipeline.hincrby(statsKey, 'complaints', complaints);
  
  pipeline.expire(statsKey, 90 * 24 * 60 * 60);
  await pipeline.exec();
  
  await updateIpReputation(ip);
}

export async function updateIpReputation(ip: string): Promise<ReputationMetrics> {
  const key = `ipwarm:${ip}`;
  const stats: any[] = [];
  
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayStats = await redis.hgetall(`ipstats:${ip}:${dateStr}`);
    if (Object.keys(dayStats).length > 0) {
      stats.push(dayStats);
    }
  }
  
  let totalSent = 0, totalOpens = 0, totalClicks = 0, totalBounces = 0, totalComplaints = 0;
  
  for (const day of stats) {
    totalSent += parseInt(day.sent || '0');
    totalOpens += parseInt(day.opens || '0');
    totalClicks += parseInt(day.clicks || '0');
    totalBounces += parseInt(day.bounces || '0');
    totalComplaints += parseInt(day.complaints || '0');
  }
  
  const engagementRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : 0;
  const clickRate = totalOpens > 0 ? (totalClicks / totalOpens) * 100 : 0;
  const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
  const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;
  
  const volumeScore = Math.min(100, (totalSent / 10000) * 100);
  const engagementScore = Math.min(100, (engagementRate / 40) * 100 + (clickRate / 10) * 100);
  const complaintScore = Math.max(0, 100 - (complaintRate * 100));
  const bounceScore = Math.max(0, 100 - (bounceRate * 20));
  const ageScore = Math.min(100, (stats.length / 30) * 100);
  
  const overallScore = Math.round(
    (volumeScore * 0.15) +
    (engagementScore * 0.35) +
    (complaintScore * 0.25) +
    (bounceScore * 0.15) +
    (ageScore * 0.10)
  );
  
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (overallScore >= 95) grade = 'A+';
  else if (overallScore >= 85) grade = 'A';
  else if (overallScore >= 70) grade = 'B';
  else if (overallScore >= 55) grade = 'C';
  else if (overallScore >= 40) grade = 'D';
  else grade = 'F';
  
  await redis.hset(key, {
    reputation: overallScore.toString()
  });
  
  return {
    score: overallScore,
    grade,
    factors: {
      volume: Math.round(volumeScore),
      engagement: Math.round(engagementScore),
      complaints: Math.round(complaintScore),
      bounces: Math.round(bounceScore),
      age: Math.round(ageScore)
    }
  };
}

export async function getIpReputation(ip: string): Promise<ReputationMetrics> {
  const key = `ipwarm:${ip}`;
  const reputation = await redis.hget(key, 'reputation');
  
  if (!reputation) {
    return {
      score: 0,
      grade: 'F',
      factors: { volume: 0, engagement: 0, complaints: 0, bounces: 0, age: 0 }
    };
  }
  
  return updateIpReputation(ip);
}

export async function advanceIpWarmup(ip: string): Promise<void> {
  const key = `ipwarm:${ip}`;
  const config = await redis.hgetall(key);
  const daysActive = Math.floor((Date.now() - parseInt(config.lastReset || Date.now().toString())) / (24 * 60 * 60 * 1000));
  
  const schedule = WARMUP_SCHEDULE.find(s => s.day >= Math.max(1, daysActive));
  
  if (schedule) {
    await redis.hset(key, {
      dailyLimit: schedule.limit.toString(),
      warmupPhase: schedule.phase
    });
  }
}

export async function pauseIpWarmup(ip: string): Promise<void> {
  const key = `ipwarm:${ip}`;
  await redis.hset(key, { warmupPhase: 'paused' });
}

export async function getAllIpStats(): Promise<IpWarmingConfig[]> {
  const keys = await redis.keys('ipwarm:*');
  const configs: IpWarmingConfig[] = [];
  
  for (const key of keys) {
    const ip = key.replace('ipwarm:', '');
    const config = await redis.hgetall(key);
    configs.push({
      ip,
      dailyLimit: parseInt(config.dailyLimit || '50'),
      currentCount: parseInt(config.currentCount || '0'),
      lastReset: parseInt(config.lastReset || '0'),
      reputation: parseInt(config.reputation || '0'),
      warmupPhase: (config.warmupPhase || 'cold') as any,
      history: []
    });
  }
  
  return configs;
}
