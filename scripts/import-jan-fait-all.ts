#!/usr/bin/env ts-node
/**
 * Jednorázový import agregovaných dat z JAN_FAIT_ALL.csv do SQLite.
 *
 * - Čte CSV se separátorem ';' (15min + hodinová data, dataset All_15min / All_hodiny).
 * - Vloží energie do solax_readings (15 min) a tigo_readings (hodiny).
 * - Vloží spot ceny do spot_price_points (použije CZK/MWh, fallback EUR/kWh * 24.3).
 *
 * Spuštění:
 *   npx tsx scripts/import-jan-fait-all.ts [path_to_csv]
 *
 * Použije ENV ENERGY_DB_PATH, jinak ./data/energy.db.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

const CSV_PATH = process.argv[2] ?? path.join(process.cwd(), "JAN_FAIT_ALL.csv");
const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");
const MIN_YEAR = 2000;
const MAX_YEAR = 2030;
const FX_EUR_CZK = 24.3;

type Row = Record<string, string | number | null>;

function main() {
  console.log(`Načítám CSV: ${CSV_PATH}`);
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(content, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
  }) as Row[];

  const solaxRows: Array<{
    timestamp: string;
    interval_minutes: number;
    pv_output?: number | null;
    grid_feed_in?: number | null;
    grid_import?: number | null;
    battery_power?: number | null;
    source: string;
  }> = [];

  const tigoRows: Array<{
    timestamp: string;
    interval_minutes: number;
    total?: number | null;
  }> = [];

  const spotRows: Array<{
    timestamp: string;
    resolution_minutes: number;
    price_czk_kwh?: number | null;
    price_eur_kwh?: number | null;
    price_eur_mwh?: number | null;
    source: string;
  }> = [];

  for (const rec of records) {
    const dataset = String(rec["dataset"] ?? "").toLowerCase();
    const ts15 = toIso(rec["Datetime_15min"]);
    const tsH = toIso(rec["Datetime_hour"]);

    if (ts15) {
      // Energie v kWh
      const pv = num(rec["Výroba FVE (kWh)"]);
      const feed = num(rec["Prodej elektřiny do ČEZ (kWh)"]);
      const imp = num(rec["Dokup elektřiny z ČEZ (kWh)"]);
      const charge = num(rec["Nabití baterie (kWh)"]);
      const discharge = num(rec["Vybití baterie (kWh)"]);
      const batteryPower = toNull(discharge - charge);

      solaxRows.push({
        timestamp: ts15,
        interval_minutes: 15,
        pv_output: toNull(pv),
        grid_feed_in: toNull(feed),
        grid_import: toNull(imp),
        battery_power: batteryPower,
        source: dataset || "jan_fait_csv",
      });

      const priceCZKMwh = num(rec["SPOT cena (CZK/MWh)"]);
      const priceEURKwh = num(rec["SPOT cena (EUR/kWh)"]);
      const priceEURMwh = num(rec["SPOT cena (EUR/MWh)"]);
      if (priceCZKMwh !== null || priceEURKwh !== null || priceEURMwh !== null) {
        const priceCZK = priceCZKMwh !== null ? priceCZKMwh / 1000 : priceEURKwh !== null ? priceEURKwh * FX_EUR_CZK : null;
        const priceEUR = priceEURKwh !== null ? priceEURKwh : priceEURMwh !== null ? priceEURMwh / 1000 : null;
        spotRows.push({
          timestamp: ts15,
          resolution_minutes: 15,
          price_czk_kwh: priceCZK,
          price_eur_kwh: priceEUR,
          price_eur_mwh: priceEURMwh,
          source: "jan_fait_csv",
        });
      }
    }

    if (tsH && dataset.includes("hodiny")) {
      const tigo = num(rec["Výroba Tigo DC (kWh)"]);
      if (tigo !== null) {
        tigoRows.push({
          timestamp: tsH,
          interval_minutes: 60,
          total: tigo,
        });
      }
    }
  }

  console.log(`Připraveno: ${solaxRows.length} záznamů SolaX, ${tigoRows.length} Tigo, ${spotRows.length} spot cen`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);

  const insertSolax = db.prepare(`
    INSERT INTO solax_readings (timestamp, interval_minutes, pv_output, battery_soc, battery_power, grid_feed_in, grid_import, source)
    VALUES (@timestamp, @interval_minutes, @pv_output, NULL, @battery_power, @grid_feed_in, @grid_import, @source)
    ON CONFLICT(timestamp, interval_minutes, source) DO UPDATE SET
      pv_output=excluded.pv_output,
      battery_power=excluded.battery_power,
      grid_feed_in=excluded.grid_feed_in,
      grid_import=excluded.grid_import,
      source=excluded.source
  `);

  const insertTigo = db.prepare(`
    INSERT INTO tigo_readings (timestamp, interval_minutes, total, string_a, string_b, string_c, string_d)
    VALUES (@timestamp, @interval_minutes, @total, NULL, NULL, NULL, NULL)
    ON CONFLICT(timestamp, interval_minutes) DO UPDATE SET
      total=excluded.total
  `);

  const insertSpot = db.prepare(`
    INSERT INTO spot_price_points (timestamp, resolution_minutes, price_eur_mwh, price_eur_kwh, price_czk_kwh, source)
    VALUES (@timestamp, @resolution_minutes, @price_eur_mwh, @price_eur_kwh, @price_czk_kwh, @source)
    ON CONFLICT(timestamp, resolution_minutes) DO UPDATE SET
      price_eur_mwh=excluded.price_eur_mwh,
      price_eur_kwh=excluded.price_eur_kwh,
      price_czk_kwh=excluded.price_czk_kwh,
      source=excluded.source
  `);

  const tx = db.transaction(() => {
    solaxRows.forEach((row) => insertSolax.run(row));
    tigoRows.forEach((row) => insertTigo.run(row));
    spotRows.forEach((row) => insertSpot.run(row));
  });
  tx();

  console.log("Import dokončen.");
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  return date.toISOString();
}

function runMigrations(db: Database.Database) {
  const version = db.pragma("user_version", { simple: true }) as number;

  if (version < 1) {
    db.exec(`
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
    db.pragma("user_version = 1");
  }

  if (version < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        system_id TEXT,
        timestamp TEXT NOT NULL,
        production_kwh REAL,
        consumption_kwh REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_measurements_unique ON measurements (system_id, timestamp);

      CREATE TABLE IF NOT EXISTS spot_prices (
        timestamp TEXT PRIMARY KEY,
        price_czk_kwh REAL,
        source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        fve_power_kw REAL,
        orientation TEXT,
        tilt_deg REAL,
        battery_capacity_kwh REAL,
        battery_efficiency REAL,
        tariff_type TEXT,
        tariff_price REAL,
        tariff_nt REAL,
        tariff_vt REAL,
        backend_url TEXT,
        inverter_api_key TEXT,
        spot_api TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        system_id TEXT,
        name TEXT,
        payload TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.pragma("user_version = 2");
  }
}

main();
