import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

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
  return cached;
}
