#!/usr/bin/env ts-node
/**
 * Scrape historické spotové ceny z https://spotovaelektrina.cz/denni-ceny/YYYY-MM-DD
 * a uloží je do SQLite tabulky spot_price_points.
 *
 * Env:
 *   FROM_DATE (YYYY-MM-DD, default 2022-01-01)
 *   TO_DATE   (YYYY-MM-DD, default dnešek)
 *   ENERGY_DB_PATH (cesta k SQLite, default ./data/energy.db)
 *   SPOTOVA_USER_AGENT (volitelné UA pro requesty)
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { buildSpotPricePayloadFromPoints, storeSpotPricePayload } from "../lib/spotPriceDb";

type ParsedDay = { points: SpotPoint[]; intervalMinutes: number };
type SpotPoint = { timestamp: string; priceCZKKWh: number };

const DB_PATH = process.env.ENERGY_DB_PATH ?? path.resolve(__dirname, "../data/energy.db");
const FROM_DATE = process.env.FROM_DATE ?? "2022-01-01";
const TO_DATE = process.env.TO_DATE ?? new Date().toISOString().slice(0, 10);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS ?? "400");
const USER_AGENT =
  process.env.SPOTOVA_USER_AGENT ?? "energy-dashboard-scraper (+https://spotovaelektrina.cz/)";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
ensureSchema(db);

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

async function main() {
  const start = new Date(FROM_DATE);
  const end = new Date(TO_DATE);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Neplatné datum ve FROM_DATE / TO_DATE");
  }

  const upsert = db.prepare(`
    INSERT INTO spot_price_points (timestamp, resolution_minutes, price_czk_kwh, source)
    VALUES (@timestamp, @resolutionMinutes, @priceCZKKWh, @source)
    ON CONFLICT(timestamp, resolution_minutes) DO UPDATE SET
      price_czk_kwh=excluded.price_czk_kwh,
      source=excluded.source
  `);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const parsed = await fetchDay(dateStr);
      db.transaction(() => {
        parsed.points.forEach((p) =>
          upsert.run({
            timestamp: p.timestamp,
            resolutionMinutes: parsed.intervalMinutes,
            priceCZKKWh: p.priceCZKKWh,
            source: "spotovaelektrina.cz/scrape",
          }),
        );
      })();
      console.log(`✔ ${dateStr}: ${parsed.points.length} bodů (interval ${parsed.intervalMinutes} min)`);
      const payload = buildSpotPricePayloadFromPoints(dateStr);
      if (payload) {
        storeSpotPricePayload(payload);
        console.log(`Payload uložen pro ${dateStr}`);
      } else {
        console.warn(`⚠ Payload nelze sestavit pro ${dateStr} (žádná data)`);
      }
    } catch (error) {
      console.error(`✘ ${dateStr}:`, (error as Error).message);
    }
    if (REQUEST_DELAY_MS > 0) {
      await sleep(REQUEST_DELAY_MS);
    }
  }
  console.log("Hotovo.");
}

async function fetchDay(dateStr: string): Promise<ParsedDay> {
  const url = `https://spotovaelektrina.cz/denni-ceny/${dateStr}`;
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const parsed = parseDayHtml(html, dateStr);
  if (!parsed.points.length) {
    throw new Error("Nenalezena data v HTML");
  }
  return parsed;
}

function parseDayHtml(html: string, dateStr: string): ParsedDay {
  const cleaned = html.replace(/&nbsp;/gi, " ");

  // 1) Zkus strukturovaný <tr><td>HH:MM</td><td>1 234 Kč</td>
  const tableRows: Array<{ time: string; price: number }> = [];
  const tableRegex =
    /<tr[^>]*>\s*<td[^>]*>\s*(\d{2}:\d{2})\s*<\/td>[\s\S]*?<td[^>]*>\s*([\d\s.,]+)\s*(?:Kč|CZK)/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRegex.exec(cleaned)) !== null) {
    const time = match[1];
    const price = parseNumber(match[2]);
    if (price !== null) {
      tableRows.push({ time, price });
    }
  }
  if (!tableRows.length) {
    // 2) fallback: prostý text
    const text = cleaned
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n");
    const rows: Array<{ time: string; price: number }> = [];
    const lineRegex = /^(\d{2}:\d{2})\s+([\d\s.,]+)\s*(?:Kč|CZK)/;
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const m = line.match(lineRegex);
        if (m) {
          const price = parseNumber(m[2]);
          if (price !== null) rows.push({ time: m[1], price });
        }
      });
    tableRows.push(...rows);
  }

  if (!tableRows.length) {
    return { points: [], intervalMinutes: 15 };
  }

  const intervalMinutes = inferInterval(tableRows.map((r) => r.time));
  const points: SpotPoint[] = tableRows.map((row) => ({
    timestamp: toIso(dateStr, row.time),
    priceCZKKWh: row.price / 1000, // Kč/MWh -> Kč/kWh
  }));
  return { points, intervalMinutes };
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function inferInterval(times: string[]): number {
  if (times.length < 2) return 60;
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const diff = diffMinutes(times[i - 1], times[i]);
    if (diff > 0 && diff <= 60) deltas.push(diff);
  }
  if (!deltas.length) return 60;
  const min = Math.min(...deltas);
  return min || 60;
}

function diffMinutes(a: string, b: string): number {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

function toIso(date: string, time: string) {
  const iso = new Date(`${date}T${time}:00Z`);
  return iso.toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
