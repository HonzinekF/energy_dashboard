#!/usr/bin/env ts-node
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

type HourEntry = { time: string; price: number };

const DB_PATH = process.env.ENERGY_DB_PATH ?? path.resolve(__dirname, "../data/energy.db");
const API_BASE_URL =
  process.env.SPOT_API_BASE_URL ?? "https://dayaheadmarket.eu/czechia/api/prices"; // nastav na reálný endpoint
const FROM_DATE = process.env.FROM_DATE ?? "2022-01-01";
const TO_DATE = process.env.TO_DATE ?? new Date().toISOString().slice(0, 10);
const PRICE_CURRENCY = (process.env.PRICE_CURRENCY ?? "CZK").toUpperCase(); // CZK | EUR
const EUR_CZK = Number(process.env.EUR_CZK ?? "25");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
ensureSchema(db);

async function fetchDay(date: string): Promise<HourEntry[]> {
  const url = `${API_BASE_URL}?date=${date}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Fetch failed for ${date}: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Neplatná odpověď (content-type ${contentType}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // Očekáváno: data.hours = [ { time: "YYYY-MM-DDTHH:00:00", price: number } ]
  if (!Array.isArray(data?.hours)) {
    throw new Error(`Neplatná odpověď pro ${date}`);
  }
  return data.hours as HourEntry[];
}

function ensureSchema(database: any) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  database.exec(`
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
  `);
}

function normalizePrice(price: number) {
  if (PRICE_CURRENCY === "EUR") {
    return {
      priceEURKWh: price,
      priceEURMWh: price * 1000,
      priceCZKKWh: Number.isFinite(EUR_CZK) ? price * EUR_CZK : null,
    };
  }
  return {
    priceEURKWh: null,
    priceEURMWh: null,
    priceCZKKWh: price,
  };
}

async function main() {
  const start = new Date(FROM_DATE);
  const end = new Date(TO_DATE);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Neplatné datum ve FROM_DATE / TO_DATE");
  }

  const upsert = db.prepare(`
    INSERT INTO spot_price_points (timestamp, resolution_minutes, price_eur_mwh, price_eur_kwh, price_czk_kwh, source)
    VALUES (@timestamp, @resolutionMinutes, @priceEURMWh, @priceEURKWh, @priceCZKKWh, @source)
    ON CONFLICT(timestamp, resolution_minutes) DO UPDATE SET
      price_eur_mwh=excluded.price_eur_mwh,
      price_eur_kwh=excluded.price_eur_kwh,
      price_czk_kwh=excluded.price_czk_kwh,
      source=excluded.source
  `);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    try {
      const hours = await fetchDay(dateStr);
      const tx = db.transaction((entries: HourEntry[]) => {
        entries.forEach((h) => {
          const price = normalizePrice(h.price);
          upsert.run({
            timestamp: h.time,
            resolutionMinutes: 60,
            priceEURMWh: price.priceEURMWh,
            priceEURKWh: price.priceEURKWh,
            priceCZKKWh: price.priceCZKKWh,
            source: API_BASE_URL,
          });
        });
      });
      tx(hours);
      console.log(`✔ Fetched and inserted ${hours.length} points for ${dateStr}`);
    } catch (error) {
      console.error(`✘ Error fetching ${dateStr}:`, (error as Error).message);
    }
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
