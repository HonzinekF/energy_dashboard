import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import type { ImportJob } from "./importTypes";

type RedisCommand = string[];
type StoredImportJob = ImportJob & { updatedAt?: string };

const MAX_ENTRIES = 100;
const LOG_PATH = process.env.IMPORT_LOG_PATH ?? "/tmp/import-jobs.json";
const REDIS_REST_URL = process.env.IMPORT_REDIS_REST_URL;
const REDIS_REST_TOKEN = process.env.IMPORT_REDIS_REST_TOKEN;
const REDIS_INDEX_KEY = process.env.IMPORT_REDIS_INDEX_KEY ?? "imports:index";
const REDIS_DATA_PREFIX = process.env.IMPORT_REDIS_DATA_PREFIX ?? "imports:job:";

export async function saveJob(job: ImportJob): Promise<StoredImportJob> {
  const payload = withTimestamps(job);
  if (isRedisEnabled()) {
    try {
      return await saveJobRedis(payload);
    } catch (error) {
      console.error("Redis uložení importu selhalo, používám souborové úložiště", error);
    }
  }
  return saveJobFile(payload);
}

export async function fetchJobs(limit: number): Promise<StoredImportJob[]> {
  if (isRedisEnabled()) {
    try {
      return await fetchJobsRedis(limit);
    } catch (error) {
      console.error("Redis načtení importů selhalo, používám souborové úložiště", error);
    }
  }
  return fetchJobsFile(limit);
}

export async function modifyJob(
  id: string,
  data: Partial<Pick<ImportJob, "status" | "message">>,
): Promise<StoredImportJob | null> {
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

function withTimestamps(job: ImportJob): StoredImportJob {
  const now = new Date().toISOString();
  return {
    ...job,
    createdAt: job.createdAt ?? now,
    updatedAt: job.createdAt ?? now,
  };
}

async function saveJobFile(job: StoredImportJob): Promise<StoredImportJob> {
  const jobs = await readJobsFromFile();
  const filtered = jobs.filter((existing) => existing.id !== job.id);
  const next = [job, ...filtered].sort(sortByUpdatedAt).slice(0, MAX_ENTRIES);
  await writeJobsToFile(next);
  return job;
}

async function fetchJobsFile(limit: number): Promise<StoredImportJob[]> {
  const jobs = await readJobsFromFile();
  return jobs.sort(sortByUpdatedAt).slice(0, limit);
}

async function updateJobFile(
  id: string,
  data: Partial<Pick<ImportJob, "status" | "message">>,
): Promise<StoredImportJob | null> {
  const jobs = await readJobsFromFile();
  const idx = jobs.findIndex((job) => job.id === id);
  if (idx === -1) {
    return null;
  }
  const updated: StoredImportJob = {
    ...jobs[idx],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  const next = [...jobs];
  next[idx] = updated;
  const ordered = next.sort(sortByUpdatedAt).slice(0, MAX_ENTRIES);
  await writeJobsToFile(ordered);
  return updated;
}

async function readJobsFromFile(): Promise<StoredImportJob[]> {
  try {
    const file = await readFile(LOG_PATH, "utf-8");
    const parsed = JSON.parse(file);
    return Array.isArray(parsed) ? (parsed as StoredImportJob[]) : [];
  } catch {
    return [];
  }
}

async function writeJobsToFile(jobs: StoredImportJob[]) {
  const dir = path.dirname(LOG_PATH);
  await mkdir(dir, { recursive: true });
  await writeFile(LOG_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

async function saveJobRedis(job: StoredImportJob): Promise<StoredImportJob> {
  const score = Date.parse(job.updatedAt ?? job.createdAt) || Date.now();
  await redisPipeline([
    ["SET", redisDataKey(job.id), JSON.stringify(job)],
    ["ZADD", REDIS_INDEX_KEY, String(score), job.id],
  ]);
  await trimRedisIndex();
  return job;
}

async function fetchJobsRedis(limit: number): Promise<StoredImportJob[]> {
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
        return JSON.parse(item) as StoredImportJob;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as StoredImportJob[];
}

async function updateJobRedis(
  id: string,
  data: Partial<Pick<ImportJob, "status" | "message">>,
): Promise<StoredImportJob | null> {
  const current = (await redisCommand(["GET", redisDataKey(id)])) as string | null;
  if (!current) {
    return null;
  }
  const parsed = JSON.parse(current) as StoredImportJob;
  const updated: StoredImportJob = { ...parsed, ...data, updatedAt: new Date().toISOString() };
  const score = Date.parse(updated.updatedAt ?? updated.createdAt) || Date.now();
  await redisPipeline([
    ["SET", redisDataKey(id), JSON.stringify(updated)],
    ["ZADD", REDIS_INDEX_KEY, String(score), id],
  ]);
  await trimRedisIndex();
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

function sortByUpdatedAt(a: StoredImportJob, b: StoredImportJob) {
  const first =
    Date.parse(a.updatedAt ?? a.createdAt ?? "") || Date.parse(a.createdAt ?? "") || 0;
  const second =
    Date.parse(b.updatedAt ?? b.createdAt ?? "") || Date.parse(b.createdAt ?? "") || 0;
  return second - first;
}
