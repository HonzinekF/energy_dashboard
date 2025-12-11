import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { applyMigrations } from "./schema";

const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");

let cached: any | null = null;

export function getDb() {
  if (cached) return cached;
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
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
