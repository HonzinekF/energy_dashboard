import { readFile, writeFile } from "fs/promises";
import type { ImportJob } from "./importTypes";

type RedisCommand = string[];

const MAX_ENTRIES = 100;
const LOG_PATH = process.env.IMPORT_LOG_PATH ?? "/tmp/import-jobs.json";
const REDIS_REST_URL = process.env.IMPORT_REDIS_REST_URL;
const REDIS_REST_TOKEN = process.env.IMPORT_REDIS_REST_TOKEN;
const REDIS_INDEX_KEY = process.env.IMPORT_REDIS_INDEX_KEY ?? "imports:index";
const REDIS_DATA_PREFIX = process.env.IMPORT_REDIS_DATA_PREFIX ?? "imports:job:";

export async function saveJob(job: ImportJob) {
  if (isRedisEnabled()) {
    try {
      return await saveJobRedis(job);
    } catch (error) {
      console.error("Redis uložení importu selhalo, používám souborové úložiště", error);
    }
  }
  return saveJobFile(job);
}

export async function fetchJobs(limit: number) {
  if (isRedisEnabled()) {
    try {
      return await fetchJobsRedis(limit);
    } catch (error) {
      console.error("Redis načtení importů selhalo, používám souborové úložiště", error);
    }
  }
  return fetchJobsFile(limit);
}

export async function modifyJob(id: string, data: Partial<Pick<ImportJob, "status" | "message">>) {
  if (isRedisEnabled()) {
    try {
      return await updateJobRedis(id, data);
    } catch (error) {
      console.error("Redis aktualizace importu selhala, používám souborové úložiště", error);
    }
  }
  return updateJobFile(id, data);
}

function isRedisEnabled() {
  return Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);
}

async function saveJobFile(job: ImportJob) {
  const jobs = await readJobsFromFile();
  const nextJobs = [job, ...jobs].slice(0, MAX_ENTRIES);
  await writeJobsToFile(nextJobs);
  return job;
}

async function fetchJobsFile(limit: number) {
  const jobs = await readJobsFromFile();
  return jobs.slice(0, limit);
}

async function updateJobFile(id: string, data: Partial<Pick<ImportJob, "status" | "message">>) {
  const jobs = await readJobsFromFile();
  const idx = jobs.findIndex((job) => job.id === id);
  if (idx === -1) {
    return null;
  }
  const nextJob = { ...jobs[idx], ...data };
  const nextJobs = [...jobs];
  nextJobs[idx] = nextJob;
  await writeJobsToFile(nextJobs);
  return nextJob;
}

async function readJobsFromFile(): Promise<ImportJob[]> {
  try {
    const file = await readFile(LOG_PATH, "utf-8");
    const parsed = JSON.parse(file);
    return Array.isArray(parsed) ? (parsed as ImportJob[]) : [];
  } catch {
    return [];
  }
}

async function writeJobsToFile(jobs: ImportJob[]) {
  await writeFile(LOG_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

async function saveJobRedis(job: ImportJob) {
  await redisPipeline([
    ["SET", redisDataKey(job.id), JSON.stringify(job)],
    ["ZADD", REDIS_INDEX_KEY, String(Date.parse(job.createdAt) || Date.now()), job.id],
  ]);
  await trimRedisIndex();
  return job;
}

async function fetchJobsRedis(limit: number) {
  const jobIds = (await redisCommand(["ZREVRANGE", REDIS_INDEX_KEY, "0", String(Math.max(limit - 1, 0))])) as
    | string[]
    | null;
  if (!jobIds || jobIds.length === 0) {
    return [];
  }
  const payload = (await redisCommand(["MGET", ...jobIds.map(redisDataKey)])) as Array<string | null>;
  return payload
    .map((item) => {
      if (!item) return null;
      try {
        return JSON.parse(item) as ImportJob;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ImportJob[];
}

async function updateJobRedis(id: string, data: Partial<Pick<ImportJob, "status" | "message">>) {
  const current = (await redisCommand(["GET", redisDataKey(id)])) as string | null;
  if (!current) {
    return null;
  }
  const parsed = JSON.parse(current) as ImportJob;
  const updated = { ...parsed, ...data };
  await redisCommand(["SET", redisDataKey(id), JSON.stringify(updated)]);
  return updated;
}

async function trimRedisIndex() {
  const count = (await redisCommand(["ZCARD", REDIS_INDEX_KEY])) as number;
  const excess = count - MAX_ENTRIES;
  if (excess > 0) {
    await redisCommand(["ZREMRANGEBYRANK", REDIS_INDEX_KEY, "0", String(excess - 1)]);
  }
}

async function redisCommand(command: RedisCommand) {
  const [result] = await redisPipeline([command]);
  return result;
}

async function redisPipeline(commands: RedisCommand[]) {
  if (!REDIS_REST_URL || !REDIS_REST_TOKEN) {
    throw new Error("Redis REST není nakonfigurován");
  }
  const url = `${REDIS_REST_URL.replace(/\/$/, "")}/pipeline`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ commands }),
  });
  if (!res.ok) {
    throw new Error(`Redis REST chyba: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return json.map((entry) => {
    if (entry.error) {
      throw new Error(entry.error);
    }
    return entry.result;
  });
}

function redisDataKey(id: string) {
  return `${REDIS_DATA_PREFIX}${id}`;
}
