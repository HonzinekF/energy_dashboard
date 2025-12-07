import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { SpotPricePayload, SpotPricePoint } from "./spotPriceClient";

const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");
let db: any | null = null;

type SolaxRow = {
  timestamp: string;
  intervalMinutes?: number;
  pvOutput?: number;
  batterySoc?: number;
  batteryPower?: number;
  gridFeedIn?: number;
  gridImport?: number;
  source?: string;
};

type TigoRow = {
  timestamp: string;
  intervalMinutes?: number;
  stringA?: number;
  stringB?: number;
  stringC?: number;
  stringD?: number;
  total?: number;
};
type SpotDayStats = {
  day: string;
  min: number;
  max: number;
  average: number;
};

function getDb() {
  if (!db) {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    runMigrations(db);
  }
  return db;
}

function runMigrations(database: any) {
  const version = database.pragma("user_version", { simple: true }) as number;
  if (version < 1) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS spot_price_payloads (
        date TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS spot_price_points (
        timestamp TEXT NOT NULL,
        resolution_minutes INTEGER NOT NULL,
        price_eur_mwh REAL,
        price_eur_kwh REAL,
        price_czk_kwh REAL,
        source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timestamp, resolution_minutes)
      );

      CREATE TABLE IF NOT EXISTS solax_readings (
        timestamp TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL,
        pv_output REAL,
        battery_soc REAL,
        battery_power REAL,
        grid_feed_in REAL,
        grid_import REAL,
        source TEXT DEFAULT 'solax',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timestamp, interval_minutes, source)
      );

      CREATE TABLE IF NOT EXISTS tigo_readings (
        timestamp TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL,
        string_a REAL,
        string_b REAL,
        string_c REAL,
        string_d REAL,
        total REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timestamp, interval_minutes)
      );
    `);
    database.pragma("user_version = 1");
  }
}

export function storeSpotPricePayload(payload: SpotPricePayload) {
  const database = getDb();
  const upsertPayload = database.prepare(
    `INSERT INTO spot_price_payloads (date, payload) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET payload=excluded.payload`,
  );
  const upsertPoint = database.prepare(`
    INSERT INTO spot_price_points (timestamp, resolution_minutes, price_eur_mwh, price_eur_kwh, price_czk_kwh, source)
    VALUES (@timestamp, @resolutionMinutes, @priceEURMWh, @priceEURKWh, @priceCZKKWh, @source)
    ON CONFLICT(timestamp, resolution_minutes) DO UPDATE SET
      price_eur_mwh=excluded.price_eur_mwh,
      price_eur_kwh=excluded.price_eur_kwh,
      price_czk_kwh=excluded.price_czk_kwh,
      source=excluded.source
  `);
  const tx = database.transaction(() => {
    upsertPayload.run(payload.date, JSON.stringify(payload));
    const allPoints = [...payload.hourly, ...(payload.quarterHourly ?? [])];
    const mapped = allPoints.map((point) => normalizeSpotPoint(point, payload.source));
    mapped.forEach((row) => {
      upsertPoint.run(row);
    });
  });
  tx();
}

export function listSpotPriceHistory(limit = 30): SpotPricePayload[] {
  const database = getDb();
  const stmt = database.prepare(`SELECT payload FROM spot_price_payloads ORDER BY date DESC LIMIT ?`);
  return stmt
    .all(limit)
    .map((row: { payload: unknown }) => JSON.parse(String(row.payload)) as SpotPricePayload);
}

export function listSpotPriceStats(limit = 30): SpotDayStats[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT date(timestamp) AS day,
           MIN(price_czk_kwh) AS min,
           MAX(price_czk_kwh) AS max,
           AVG(price_czk_kwh) AS average
    FROM spot_price_points
    WHERE price_czk_kwh IS NOT NULL
    GROUP BY day
    ORDER BY day DESC
    LIMIT ?
  `);
  return stmt.all(limit) as SpotDayStats[];
}

export function insertSolaxRows(rows: SolaxRow[]) {
  if (!rows.length) return;
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO solax_readings
      (timestamp, interval_minutes, pv_output, battery_soc, battery_power, grid_feed_in, grid_import, source)
    VALUES (@timestamp, @intervalMinutes, @pvOutput, @batterySoc, @batteryPower, @gridFeedIn, @gridImport, @source)
    ON CONFLICT(timestamp, interval_minutes, source) DO UPDATE SET
      pv_output=excluded.pv_output,
      battery_soc=excluded.battery_soc,
      battery_power=excluded.battery_power,
      grid_feed_in=excluded.grid_feed_in,
      grid_import=excluded.grid_import,
      source=excluded.source
  `);
  const tx = database.transaction((batch: SolaxRow[]) =>
    batch.forEach((row) =>
      stmt.run({
        intervalMinutes: row.intervalMinutes ?? 60,
        source: row.source ?? "solax",
        ...row,
      }),
    ),
  );
  tx(rows);
}

export function insertTigoRows(rows: TigoRow[]) {
  if (!rows.length) return;
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO tigo_readings (timestamp, interval_minutes, string_a, string_b, string_c, string_d, total)
    VALUES (@timestamp, @intervalMinutes, @stringA, @stringB, @stringC, @stringD, @total)
    ON CONFLICT(timestamp, interval_minutes) DO UPDATE SET
      string_a=excluded.string_a,
      string_b=excluded.string_b,
      string_c=excluded.string_c,
      string_d=excluded.string_d,
      total=excluded.total
  `);
  const tx = database.transaction((batch: TigoRow[]) =>
    batch.forEach((row) =>
      stmt.run({
        intervalMinutes: row.intervalMinutes ?? 15,
        ...row,
      }),
    ),
  );
  tx(rows);
}

function normalizeSpotPoint(point: SpotPricePoint, source?: string) {
  const timestamp = point.from ?? point.to;
  return {
    timestamp: timestamp ?? new Date().toISOString(),
    resolutionMinutes: point.resolution === "15m" ? 15 : 60,
    priceEURMWh: point.priceEUR ? point.priceEUR * 1000 : null,
    priceEURKWh: point.priceEUR ?? null,
    priceCZKKWh: point.priceCZK ?? null,
    source,
  };
}

export type { SolaxRow, TigoRow };
