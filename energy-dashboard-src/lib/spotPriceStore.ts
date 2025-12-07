import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import type { SpotPricePayload } from "./spotPriceClient";
import { listSpotPriceHistory, storeSpotPricePayload } from "./spotPriceDb";

const STORE_PATH = process.env.SPOT_PRICE_STORE_PATH ?? path.join(process.cwd(), "data", "spot-prices.json");

export async function saveSpotPrices(payload: SpotPricePayload) {
  const dir = path.dirname(STORE_PATH);
  await mkdir(dir, { recursive: true });
  const existing = await loadSpotPrices();
  const filtered = existing.filter((entry) => entry.date !== payload.date);
  const updated = [payload, ...filtered].slice(0, 30);
  await writeFile(STORE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  storeSpotPricePayload(payload);
}

export async function loadSpotPrices() {
  const dbData = listSpotPriceHistory(30);
  if (dbData.length) {
    return dbData;
  }
  try {
    const file = await readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(file);
    return Array.isArray(parsed) ? (parsed as SpotPricePayload[]) : [];
  } catch {
    return [];
  }
}
