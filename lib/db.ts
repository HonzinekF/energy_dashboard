import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import { applyMigrations } from "./schema";

const DB_PATH = resolveDbPath();

let cached: any | null = null;

export function getDb() {
  if (cached) return cached;
  ensureDir(path.dirname(DB_PATH));
  cached = new Database(DB_PATH);
  cached.pragma("journal_mode = WAL");
  cached.pragma("busy_timeout = 5000");
  applyMigrations(cached);
  return cached;
}

export function listSystems(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT system_id FROM measurements WHERE system_id IS NOT NULL
      UNION
      SELECT system_id FROM solax_readings WHERE system_id IS NOT NULL
      UNION
      SELECT system_id FROM tigo_readings WHERE system_id IS NOT NULL
      ORDER BY system_id
    `,
    )
    .all() as Array<{ system_id: string }>;

  const systems = rows
    .map((row) => row.system_id || "default")
    .filter((val, idx, arr) => arr.indexOf(val) === idx);

  return systems.length ? systems : ["default"];
}

function resolveDbPath() {
  const defaultPath = path.join(process.cwd(), "data", "energy.db");
  const fallbackPath = path.join(os.tmpdir(), "energy.db");
  const candidate = process.env.ENERGY_DB_PATH ?? defaultPath;

  if (ensureDir(path.dirname(candidate))) {
    return candidate;
  }

  console.warn(
    `ENERGY_DB_PATH '${candidate}' nelze vytvořit, používám fallback '${fallbackPath}'. Pro produkci nastav dostupnou cestu nebo externí DB.`,
  );
  ensureDir(path.dirname(fallbackPath));
  return fallbackPath;
}

function ensureDir(dir: string) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.warn("Nelze vytvořit složku pro DB", dir, error);
    return false;
  }
}
