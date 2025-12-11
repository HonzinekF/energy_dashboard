import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import os from "os";
import { applyMigrations } from "./schema";
import type { SpotPricePayload, SpotPricePoint } from "./spotPriceClient";

const DB_PATH = resolveDbPath();

let db: any | null = null;

export type SolaxRow = {
  timestamp: string;
  intervalMinutes?: number;
  pvOutput?: number;
  batterySoc?: number;
  batteryPower?: number;
  gridFeedIn?: number;
  gridImport?: number;
  source?: string;
};

export type TigoRow = {
  timestamp: string;
  intervalMinutes?: number;
  stringA?: number;
  stringB?: number;
  stringC?: number;
  stringD?: number;
  total?: number;
};

export type MeasurementRow = {
  timestamp: string;
  productionKwh?: number;
  consumptionKwh?: number;
  gridImportKwh?: number;
  gridExportKwh?: number;
};

type SpotDayStats = {
  day: string;
  min: number;
  max: number;
  average: number;
};

function getDb() {
  if (!db) {
    ensureDir(path.dirname(DB_PATH));
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    applyMigrations(db);
  }
  return db;
}

export function insertMeasurements(rows: MeasurementRow[]) {
  if (!rows.length) return;
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO measurements (timestamp, production_kwh, consumption_kwh, grid_import_kwh, grid_export_kwh)
    VALUES (@timestamp, @productionKwh, @consumptionKwh, @gridImportKwh, @gridExportKwh)
    ON CONFLICT(timestamp) DO UPDATE SET
      production_kwh = COALESCE(excluded.production_kwh, production_kwh),
      consumption_kwh = COALESCE(excluded.consumption_kwh, consumption_kwh),
      grid_import_kwh = COALESCE(excluded.grid_import_kwh, grid_import_kwh),
      grid_export_kwh = COALESCE(excluded.grid_export_kwh, grid_export_kwh)
  `);
  const tx = database.transaction((batch: MeasurementRow[]) => batch.forEach((row) => stmt.run(row)));
  tx(rows);
}

export function storeSpotPricePayload(payload: SpotPricePayload) {
  const database = getDb();
  const upsertPayload = database.prepare(
    `INSERT INTO spot_price_payloads (date, payload) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET payload=excluded.payload`,
  );
  const upsertPoint = database.prepare(`
    INSERT INTO spot_price_points (timestamp, resolution_minutes, price_eur_mwh, price_eur_kwh, price_czk_kwh, source, system_id, user_id)
    VALUES (@timestamp, @resolutionMinutes, @priceEURMWh, @priceEURKWh, @priceCZKKWh, @source, 'default', 'default')
    ON CONFLICT(system_id, timestamp, resolution_minutes) DO UPDATE SET
      price_eur_mwh=excluded.price_eur_mwh,
      price_eur_kwh=excluded.price_eur_kwh,
      price_czk_kwh=excluded.price_czk_kwh,
      source=excluded.source
  `);

  const tx = database.transaction(() => {
    upsertPayload.run(payload.date, JSON.stringify(payload));
    const allPoints = [...payload.hourly, ...(payload.quarterHourly ?? [])];
    allPoints.map((point) => normalizeSpotPoint(point, payload.source)).forEach((row) => upsertPoint.run(row));
  });
  tx();
}

export function listSpotPriceHistory(limit = 30) {
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

export function buildSpotPricePayloadFromPoints(date: string, source = "spotovaelektrina.cz/scrape"): SpotPricePayload | null {
  const database = getDb();
  const rows = database
    .prepare(
      `
      SELECT timestamp, price_czk_kwh as priceCZK, resolution_minutes as resolutionMinutes
      FROM spot_price_points
      WHERE date(timestamp) = ? AND source = ?
      ORDER BY timestamp
    `,
    )
    .all(date, source) as Array<{ timestamp: string; priceCZK: number | null; resolutionMinutes: number }>;

  if (!rows.length) return null;

  const quarterHourly: SpotPricePoint[] = [];
  const hourlyMap = new Map<string, { sum: number; count: number }>();
  const hourlyFromDb: SpotPricePoint[] = [];

  rows.forEach((row) => {
    const from = new Date(row.timestamp);
    const to = new Date(from.getTime() + row.resolutionMinutes * 60 * 1000);
    const priceCZK = row.priceCZK ?? 0;
    const point: SpotPricePoint = {
      from: from.toISOString(),
      to: to.toISOString(),
      priceCZK,
      priceEUR: 0,
      resolution: row.resolutionMinutes === 15 ? "15m" : "1h",
    };

    if (point.resolution === "15m") {
      quarterHourly.push(point);
      const hourStart = new Date(from);
      hourStart.setUTCMinutes(0, 0, 0);
      const key = hourStart.toISOString();
      const agg = hourlyMap.get(key) ?? { sum: 0, count: 0 };
      agg.sum += priceCZK;
      agg.count += 1;
      hourlyMap.set(key, agg);
    } else {
      hourlyFromDb.push(point);
    }
  });

  const aggregatedHourly: SpotPricePoint[] = hourlyFromDb.length
    ? hourlyFromDb
    : Array.from(hourlyMap.entries())
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .map(([fromIso, agg]) => {
          const from = new Date(fromIso);
          const to = new Date(from.getTime() + 60 * 60 * 1000);
          return {
            from: from.toISOString(),
            to: to.toISOString(),
            priceCZK: agg.sum / Math.max(agg.count, 1),
            priceEUR: 0,
            resolution: "1h" as const,
          };
        });

  return {
    date,
    source,
    hourly: aggregatedHourly,
    quarterHourly,
  };
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
