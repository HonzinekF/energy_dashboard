import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { DashboardFilterState } from "./dashboardFilters";

type EnergyTotals = {
  solaxProduction?: number;
  solaxFeedIn?: number;
  solaxImport?: number;
  batteryCharge?: number;
  batteryDischarge?: number;
  tigoProduction?: number;
};

const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");

export function loadEnergyTotals(filters: DashboardFilterState): EnergyTotals | null {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  const db = new Database(DB_PATH, { fileMustExist: true, readonly: true });
  const rangeStart = getRangeStart(filters.range);
  const solaxStmt = db.prepare(`
    SELECT
      SUM(pv_output) AS solaxProduction,
      SUM(grid_feed_in) AS solaxFeedIn,
      SUM(grid_import) AS solaxImport,
      SUM(CASE WHEN battery_power < 0 THEN -battery_power ELSE 0 END) AS batteryCharge,
      SUM(CASE WHEN battery_power > 0 THEN battery_power ELSE 0 END) AS batteryDischarge
    FROM solax_readings
    WHERE datetime(timestamp) >= datetime(?)
  `);
  const tigoStmt = db.prepare(`
    SELECT SUM(total) AS tigoProduction
    FROM tigo_readings
    WHERE datetime(timestamp) >= datetime(?)
  `);

  const solax = solaxStmt.get(rangeStart) as EnergyTotals;
  const tigo = tigoStmt.get(rangeStart) as EnergyTotals;
  db.close();

  return {
    ...solax,
    ...tigo,
  };
}

function getRangeStart(range: DashboardFilterState["range"]) {
  const now = new Date();
  if (range === "24h") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "90d") {
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === "thisYear") {
    return new Date(now.getFullYear(), 0, 1).toISOString();
  }
  if (range === "lastYear") {
    return new Date(now.getFullYear() - 1, 0, 1).toISOString();
  }
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

type EnergySeriesPoint = {
  datetime: string;
  batteryCharge?: number;
  batteryDischarge?: number;
  tigoProduction?: number;
};

export function loadEnergySeries(filters: DashboardFilterState): EnergySeriesPoint[] {
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }

  const db = new Database(DB_PATH, { fileMustExist: true, readonly: true });
  const rangeStart = getRangeStart(filters.range);
  const bucketFormat = bucketFormatForInterval(filters.interval);

  const solaxStmt = db.prepare(
    `
    SELECT
      strftime(?, timestamp) || 'Z' AS bucket,
      SUM(CASE WHEN battery_power < 0 THEN -battery_power ELSE 0 END) AS batteryCharge,
      SUM(CASE WHEN battery_power > 0 THEN battery_power ELSE 0 END) AS batteryDischarge
    FROM solax_readings
    WHERE datetime(timestamp) >= datetime(?)
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
  );

  const tigoStmt = db.prepare(
    `
    SELECT
      strftime(?, timestamp) || 'Z' AS bucket,
      SUM(total) AS tigoProduction
    FROM tigo_readings
    WHERE datetime(timestamp) >= datetime(?)
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
  );

  const solaxRows = solaxStmt.all(bucketFormat, rangeStart) as EnergySeriesPoint[];
  const tigoRows = tigoStmt.all(bucketFormat, rangeStart) as EnergySeriesPoint[];
  db.close();

  const map = new Map<string, EnergySeriesPoint>();
  const upsert = (row: EnergySeriesPoint) => {
    if (!row.datetime) {
      return;
    }
    const current = map.get(row.datetime) ?? { datetime: row.datetime };
    map.set(row.datetime, { ...current, ...row });
  };

  solaxRows.forEach((row) => upsert({ ...row, datetime: row.bucket }));
  tigoRows.forEach((row) => upsert({ ...row, datetime: row.bucket }));

  return Array.from(map.values()).sort((a, b) => a.datetime.localeCompare(b.datetime));
}

function bucketFormatForInterval(interval: DashboardFilterState["interval"]) {
  if (interval === "1d") {
    return "%Y-%m-%dT00:00:00";
  }
  if (interval === "15m") {
    return "%Y-%m-%dT%H:%M:00";
  }
  return "%Y-%m-%dT%H:00:00";
}

export function loadDashboardHistoryFromDb(filters: DashboardFilterState) {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  const db = new Database(DB_PATH, { fileMustExist: true, readonly: true });
  const rangeStart = getRangeStart(filters.range);
  const bucketFormat = bucketFormatForInterval(filters.interval);

  const historyStmt = db.prepare(
    `
    SELECT
      strftime(?, timestamp) || 'Z' AS bucket,
      SUM(pv_output) AS production,
      SUM(grid_feed_in) AS export,
      SUM(grid_import) AS import
    FROM solax_readings
    WHERE datetime(timestamp) >= datetime(?)
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
  );

  const rows = historyStmt.all(bucketFormat, rangeStart) as Array<{
    bucket: string;
    production: number | null;
    export: number | null;
    import: number | null;
  }>;

  const history = rows.map((row) => ({
    datetime: row.bucket,
    production: row.production ?? 0,
    export: row.export ?? 0,
    import: row.import ?? 0,
  }));

  const summary = history.reduce(
    (acc, cur) => {
      acc.production += cur.production;
      acc.export += cur.export;
      acc.import += cur.import;
      return acc;
    },
    { production: 0, export: 0, import: 0 },
  );

  db.close();
  if (!history.length) {
    return null;
  }

  return {
    summary: [
      { label: "Výroba FVE", value: summary.production, unit: "kWh" },
      { label: "Prodej do ČEZ", value: summary.export, unit: "kWh" },
      { label: "Dokup z ČEZ", value: summary.import, unit: "kWh" },
    ],
    history,
    refreshedAt: new Date().toISOString(),
    sourceUsed: "db" as const,
  };
}
