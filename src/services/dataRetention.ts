import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RetentionConfig {
  table: string;
  column: string;
  retentionDays: number;
  batchSize: number;
  enabled: boolean;
}

const DEFAULT_RETENTION_CONFIG: RetentionConfig[] = [
  { table: 'AuditLog', column: 'createdAt', retentionDays: 90, batchSize: 1000, enabled: true },
  { table: 'AiAgentLog', column: 'createdAt', retentionDays: 180, batchSize: 500, enabled: true },
  { table: 'SeoAudit', column: 'createdAt', retentionDays: 365, batchSize: 500, enabled: true },
  { table: 'EmailCampaign', column: 'sentAt', retentionDays: 730, batchSize: 100, enabled: true },
  { table: 'TrackingEvent', column: 'timestamp', retentionDays: 30, batchSize: 5000, enabled: false }
];

export async function purgeExpiredData(config: RetentionConfig[] = DEFAULT_RETENTION_CONFIG): Promise<{
  deleted: Record<string, number>;
  errors: string[];
}> {
  const results: Record<string, number> = {};
  const errors: string[] = [];
  
  for (const retention of config) {
    if (!retention.enabled) continue;
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retention.retentionDays);
      
      let deleted = 0;
      
      switch (retention.table) {
        case 'AuditLog':
          deleted = await prisma.auditLog.deleteMany({
            where: { createdAt: { lt: cutoffDate } }
          });
          break;
          
        case 'AiAgentLog':
          deleted = await prisma.aiAgentLog.deleteMany({
            where: { createdAt: { lt: cutoffDate } }
          });
          break;
          
        case 'SeoAudit':
          deleted = await prisma.seoAudit.deleteMany({
            where: { createdAt: { lt: cutoffDate } }
          });
          break;
          
        case 'EmailCampaign':
          deleted = await prisma.emailCampaign.deleteMany({
            where: { 
              sentAt: { lt: cutoffDate },
              status: 'SENT'
            }
          });
          break;
      }
      
      results[retention.table] = deleted.count || 0;
      
    } catch (error: any) {
      errors.push(`${retention.table}: ${error.message}`);
    }
  }
  
  return { deleted: results, errors };
}

export async function purgeOldTrackingData(): Promise<number> {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  const keys = await redis.keys('tracking:*');
  let deleted = 0;
  
  for (const key of keys) {
    const type = key.split(':')[1];
    if (type === 'events' || type === 'stats') continue;
    
    const cutoff = Math.floor(thirtyDaysAgo / 1000);
    const removed = await redis.zremrangebyscore(key, 0, cutoff);
    deleted += removed;
  }
  
  return deleted;
}

export async function purgeOldIpStats(): Promise<number> {
  const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
  const cutoffDate = new Date(sixtyDaysAgo).toISOString().split('T')[0];
  
  const keys = await redis.keys('ipstats:*');
  let deleted = 0;
  
  for (const key of keys) {
    const dateStr = key.split(':').pop();
    if (dateStr && dateStr < cutoffDate) {
      await redis.del(key);
      deleted++;
    }
  }
  
  return deleted;
}

export async function optimizeDatabase(): Promise<{
  vacuumed: string[];
  errors: string[];
}> {
  const vacuumed: string[] = [];
  const errors: string[] = [];
  
  try {
    await prisma.$queryRaw`VACUUM ANALYZE`;
    vacuumed.push('all_tables');
  } catch (error: any) {
    errors.push(`VACUUM: ${error.message}`);
  }
  
  try {
    await prisma.$queryRaw`ALTER DATABASE current_db SET default_statistics_target = 100`;
  } catch {
    // Ignore if not supported
  }
  
  return { vacuumed, errors };
}

export async function getStorageStats(): Promise<{
  tables: Record<string, { rows: number; size: string }>;
  redis: { keys: number; memory: string };
}> {
  const tableStats: Record<string, { rows: number; size: string }> = {};
  
  try {
    const tables = ['Contact', 'EmailCampaign', 'SeoAudit', 'AiAgentLog', 'AuditLog'];
    
    for (const table of tables) {
      const count = await (prisma as any)[table.toLowerCase()].count();
      tableStats[table] = { rows: count, size: 'N/A' };
    }
  } catch (error) {
    console.error('Failed to get table stats:', error);
  }
  
  const redisInfo = await redis.info('memory');
  const memoryMatch = redisInfo.match(/used_memory_human:(\S+)/);
  
  return {
    tables: tableStats,
    redis: {
      keys: await redis.dbsize(),
      memory: memoryMatch ? memoryMatch[1] : 'N/A'
    }
  };
}

export async function scheduleRetentionJob(): Promise<void> {
  const cron = require('node-cron');
  
  cron.schedule('0 2 * * *', async () => {
    console.log('Starting scheduled data retention purge...');
    
    const results = await purgeExpiredData();
    console.log('Retention purge results:', results);
    
    const trackingDeleted = await purgeOldTrackingData();
    console.log(`Purged ${trackingDeleted} tracking events`);
    
    const ipStatsDeleted = await purgeOldIpStats();
    console.log(`Purged ${ipStatsDeleted} old IP stats`);
    
    const { vacuumed, errors } = await optimizeDatabase();
    console.log('Database optimization:', { vacuumed, errors });
    
    await redis.set('lastRetentionRun', Date.now().toString());
  });
}

export async function getRetentionStatus(): Promise<{
  lastRun: number | null;
  config: RetentionConfig[];
}> {
  const lastRunStr = await redis.get('lastRetentionRun');
  
  return {
    lastRun: lastRunStr ? parseInt(lastRunStr) : null,
    config: DEFAULT_RETENTION_CONFIG
  };
}
