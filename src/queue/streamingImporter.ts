import { Worker, Queue, JobsOptions } from 'bullmq';
import Redis from 'ioredis';
import { createReadStream, createWriteStream, statSync } from 'fs';
import { createInterface } from 'readline';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface ImportJob {
  tenantId: string;
  fileId: string;
  filePath: string;
  fileType: 'csv' | 'json' | 'vcf' | 'xml' | 'tsv' | 'ldif';
  options: {
    validate?: boolean;
    deduplicate?: boolean;
    tags?: string[];
  };
}

export interface ChunkJob {
  tenantId: string;
  fileId: string;
  chunkId: string;
  chunkPath: string;
  lineStart: number;
  lineEnd: number;
}

export interface ProcessResult {
  success: boolean;
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
  duration: number;
}

const importQueue = new Queue<ImportJob>('import-queue', { connection });
const chunkQueue = new Queue<ChunkJob>('chunk-queue', { connection });

export async function queueFileImport(job: ImportJob): Promise<string> {
  const added = await importQueue.add('import-file', job, {
    jobId: job.fileId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 100 }
  });
  
  return added.id || job.fileId;
}

export async function createChunks(filePath: string, chunkSize: number = 1000): Promise<ChunkJob[]> {
  const stats = statSync(filePath);
  const totalLines = await countLines(filePath);
  const chunks: ChunkJob[] = [];
  
  const fileId = randomBytes(8).toString('hex');
  
  for (let start = 0; start < totalLines; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalLines);
    const chunkPath = join(tmpdir(), `chunk_${fileId}_${start}.txt`);
    
    await extractLines(filePath, chunkPath, start, end);
    
    chunks.push({
      tenantId: '',
      fileId,
      chunkId: `chunk_${start}`,
      chunkPath,
      lineStart: start,
      lineEnd: end
    });
  }
  
  return chunks;
}

async function countLines(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 10) count++;
      }
    });
    stream.on('end', () => resolve(count));
    stream.on('error', reject);
  });
}

async function extractLines(inputPath: string, outputPath: string, start: number, end: number): Promise<void> {
  const readStream = createReadStream(inputPath);
  const writeStream = createWriteStream(outputPath);
  let lineNum = 0;
  
  await pipeline(
    readStream,
    createInterface(),
    (source: any) => {
      source.on('line', (line: string) => {
        if (lineNum >= start && lineNum < end) {
          writeStream.write(line + '\n');
        }
        lineNum++;
        if (lineNum >= end) {
          source.emit('close');
        }
      });
    }
  );
  
  writeStream.end();
}

export async function processChunkInSandbox(chunk: ChunkJob): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const worker = spawn('node', [
      '--input-type=module',
      `-e`,
      `
      import { readFileSync } from 'fs';
      import { parse } from 'path';
      
      const chunkPath = '${chunk.chunkPath.replace(/\\/g, '\\\\')}';
      const content = readFileSync(chunkPath, 'utf-8');
      const lines = content.split('\\n').filter(l => l.trim());
      
      console.log(JSON.stringify({ lines: lines.length, sample: lines[0] }));
      `
    ], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    worker.stdout.on('data', (data) => { stdout += data.toString(); });
    worker.stderr.on('data', (data) => { stderr += data.toString(); });
    
    worker.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim());
          resolve({
            success: true,
            processed: result.lines || 0,
            saved: 0,
            skipped: 0,
            errors: 0,
            duration: 0
          });
        } catch {
          resolve({
            success: true,
            processed: chunk.lineEnd - chunk.lineStart,
            saved: 0,
            skipped: 0,
            errors: 0,
            duration: 0
          });
        }
      } else {
        reject(new Error(stderr || 'Worker failed'));
      }
    });
  });
}

export async function getQueueStats() {
  const [importCounts, chunkCounts] = await Promise.all([
    importQueue.getJobCounts(),
    chunkQueue.getJobCounts()
  ]);
  
  return {
    import: importCounts,
    chunk: chunkCounts,
    waiting: importCounts.waiting + chunkCounts.waiting,
    active: importCounts.active + chunkCounts.active,
    completed: importCounts.completed + chunkCounts.completed,
    failed: importCounts.failed + chunkCounts.failed
  };
}

export async function clearOldJobs(olderThanHours: number = 24) {
  const before = Date.now() - (olderThanHours * 60 * 60 * 1000);
  
  await importQueue.clean(before, 100, 'completed');
  await importQueue.clean(before, 100, 'failed');
  await chunkQueue.clean(before, 100, 'completed');
  await chunkQueue.clean(before, 100, 'failed');
}

export { importQueue, chunkQueue, connection };
