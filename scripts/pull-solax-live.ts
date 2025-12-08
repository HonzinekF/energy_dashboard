import Database from "better-sqlite3";
import path from "path";
import { fetchSolaxRealtime } from "../lib/solaxClient";

const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");
const INTERVAL_MIN = Number(process.env.SOLAX_INTERVAL_MIN ?? 5);

type Realtime = NonNullable<Awaited<ReturnType<typeof fetchSolaxRealtime>>>;

async function main() {
  const payload = await fetchSolaxRealtime();
  if (!payload) {
    console.error("SolaX: žádná data (pravděpodobně chyba API nebo chybějící tokeny)");
    process.exit(1);
  }

  const ts = parseTimestamp(payload);
  const pv_kw = toNumber(payload.acpower) / 1000; // W -> kW
  const feed_kw = toNumber(payload.feedinpower) / 1000;
  const import_kw = Math.max(0, pv_kw - feed_kw);
  const battery_soc = payload.soc ?? null;
  const battery_power_kw = payload.batPower !== undefined ? toNumber(payload.batPower) / 1000 : null;

  // Přepočet na kWh za daný interval (default 5 min)
  const interval_hours = INTERVAL_MIN / 60;
  const production_kwh = pv_kw * interval_hours;
  const consumption_kwh = import_kw * interval_hours;

  const db = new Database(DB_PATH);
  createTables(db);

  const insertSolax = db.prepare(`
    INSERT OR REPLACE INTO solax_readings (timestamp, interval_minutes, pv_output, battery_soc, battery_power, grid_feed_in, grid_import, source)
    VALUES (@timestamp, @interval_minutes, @pv_output, @battery_soc, @battery_power, @grid_feed_in, @grid_import, @source)
  `);

  insertSolax.run({
    timestamp: ts,
    interval_minutes: INTERVAL_MIN,
    pv_output: production_kwh, // kWh za interval
    battery_soc,
    battery_power: battery_power_kw,
    grid_feed_in: feed_kw * interval_hours, // kWh za interval
    grid_import: import_kw * interval_hours, // kWh za interval
    source: "solax",
  });

  const insertMeas = db.prepare(`
    INSERT OR REPLACE INTO measurements (timestamp, production_kwh, consumption_kwh)
    VALUES (@timestamp, @production_kwh, @consumption_kwh)
  `);

  insertMeas.run({
    timestamp: ts,
    production_kwh: production_kwh,
    consumption_kwh: consumption_kwh,
  });

  console.log(
    `OK ${ts} | výroba ${production_kwh.toFixed(3)} kWh, spotřeba ${consumption_kwh.toFixed(3)} kWh (interval ${INTERVAL_MIN} min)`,
  );
  db.close();
}

function parseTimestamp(payload: Realtime) {
  const raw = payload.uploadTime;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

function toNumber(value: number | string | undefined | null) {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function createTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS solax_readings (
      timestamp TEXT PRIMARY KEY,
      interval_minutes INTEGER NOT NULL,
      pv_output REAL,
      battery_soc REAL,
      battery_power REAL,
      grid_feed_in REAL,
      grid_import REAL,
      source TEXT DEFAULT 'solax'
    );
    CREATE TABLE IF NOT EXISTS measurements (
      timestamp TEXT PRIMARY KEY,
      production_kwh REAL,
      consumption_kwh REAL
    );
  `);
}

main().catch((err) => {
  console.error("SolaX cron selhal:", err);
  process.exit(1);
});
