import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import type { SpotPricePayload, SpotPricePoint } from "./spotPriceClient";
import { listSpotPriceHistory, storeSpotPricePayload } from "./spotPriceDb";

const STORE_PATH = process.env.SPOT_PRICE_STORE_PATH ?? path.join(process.cwd(), "data", "spot-prices.json");

export type SpotSeriesPoint = {
  timestamp: string;
  priceCZK: number;
  priceEUR: number;
  resolution: SpotPricePoint["resolution"];
  source?: string;
};

export async function saveSpotPrices(payload: SpotPricePayload) {
  const dir = path.dirname(STORE_PATH);
  await mkdir(dir, { recursive: true });
  const existing = await loadSpotPrices();
  const filtered = existing.filter((entry) => entry.date !== payload.date);
  const updated = sortByDateDesc([payload, ...filtered]).slice(0, 30);
  await writeFile(STORE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  storeSpotPricePayload(payload);
}

export async function loadSpotPrices(limit = 30): Promise<SpotPricePayload[]> {
  const dbData = listSpotPriceHistory(limit);
  if (dbData.length) {
    return sortByDateDesc(dbData).slice(0, limit);
  }
  try {
    const file = await readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(file);
    const arr = Array.isArray(parsed) ? (parsed as SpotPricePayload[]) : [];
    return sortByDateDesc(arr).slice(0, limit);
  } catch {
    return [];
  }
}

export async function loadLatestSpotPrices(): Promise<SpotPricePayload | null> {
  const all = await loadSpotPrices(1);
  return all[0] ?? null;
}

export async function loadSpotSeries(daysBack = 2): Promise<SpotSeriesPoint[]> {
  const payloads = await loadSpotPrices(daysBack);
  const series: SpotSeriesPoint[] = [];
  payloads.forEach((payload) => {
    const source = payload.source;
    const points = [...payload.hourly, ...(payload.quarterHourly ?? [])];
    points.forEach((point) => {
      series.push({
        timestamp: point.from,
        priceCZK: point.priceCZK,
        priceEUR: point.priceEUR,
        resolution: point.resolution,
        source,
      });
    });
  });
  return series.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function sortByDateDesc(payloads: SpotPricePayload[]) {
  return [...payloads].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
