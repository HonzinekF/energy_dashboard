import { XMLParser } from "fast-xml-parser";
import { storeSpotPricePayload } from "./spotPriceDb";

type ElectricityPriceResponse = {
  date: string;
  prices_1h?: Array<{
    hour: string;
    czk_mwh?: number;
    eur_mwh?: number;
    czk_kwh?: number;
    eur_kwh?: number;
  }>;
  prices_15m?: Array<{
    from: string;
    to: string;
    czk_kwh?: number;
    eur_kwh?: number;
  }>;
  updated_at?: string;
};

type SpotovaResponse = {
  hoursToday?: Array<{ hour: number; priceEur: number; priceCZK: number }>;
  hoursTomorrow?: Array<{ hour: number; priceEur: number; priceCZK: number }>;
};

type EntsoeDocument = {
  Publication_MarketDocument?: {
    TimeSeries?: EntsoeSeries | EntsoeSeries[];
  };
};

type EntsoeSeries = {
  Period?: EntsoePeriod;
};

type EntsoePeriod = {
  Point?: EntsoePoint | EntsoePoint[];
};

type EntsoePoint = {
  ["price.amount"]?: string;
};

export type SpotPricePoint = {
  from: string;
  to: string;
  priceCZK: number;
  priceEUR: number;
  resolution: "1h" | "15m";
};

export type SpotPricePayload = {
  date: string;
  source: string;
  hourly: SpotPricePoint[];
  quarterHourly: SpotPricePoint[];
  updatedAt?: string;
  cached?: boolean;
};

const ELECTRICITY_PRICE_API = process.env.ELECTRICITY_PRICE_API_URL ?? "https://api.electricitypriceapi.com/v1/prices";
const SPOTOVA_API = process.env.SPOTOVA_API_URL ?? "https://spotovaelektrina.cz/api/v1/price/get-prices-json";
const ENTSOE_API = "https://web-api.tp.entsoe.eu/api";
const ENTSOE_TOKEN = process.env.ENTSOE_API_TOKEN;
const ENTSOE_DOMAIN = process.env.ENTSOE_BIDDING_ZONE ?? "10Y1001A1001A47J";
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

let lastSuccessfulPayload: SpotPricePayload | null = null;

export async function fetchSpotPrices(date?: string): Promise<SpotPricePayload | null> {
  const fromElectricity = await fetchFromElectricityPriceApi(date);
  if (fromElectricity) {
    return handleSuccess(fromElectricity);
  }

  const fromSpotova = await fetchFromSpotovaApi();
  if (fromSpotova) {
    return handleSuccess(fromSpotova);
  }

  const fromEntsoe = await fetchFromEntsoeApi(date);
  if (fromEntsoe) {
    return handleSuccess(fromEntsoe);
  }

  if (lastSuccessfulPayload) {
    return { ...lastSuccessfulPayload, cached: true };
  }
  return null;
}

export function resetSpotPriceCache() {
  lastSuccessfulPayload = null;
}

function handleSuccess(payload: SpotPricePayload) {
  lastSuccessfulPayload = payload;
  try {
    storeSpotPricePayload(payload);
  } catch (error) {
    console.warn("Uložení spotových cen do DB selhalo", error);
  }
  return payload;
}

async function fetchFromElectricityPriceApi(date?: string): Promise<SpotPricePayload | null> {
  try {
    const url = date ? `${ELECTRICITY_PRICE_API}?date=${date}` : ELECTRICITY_PRICE_API;
    const res = await fetchWithRetry(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`ElectricityPriceAPI responded with ${res.status}`);
    }
    const json = (await res.json()) as ElectricityPriceResponse;
    if (!json?.prices_1h?.length) {
      return null;
    }

    const hourly = json.prices_1h.map<SpotPricePoint>((entry) => {
      const [startHour] = entry.hour.split("-");
      const from = `${json.date}T${normalizeHour(startHour)}:00:00.000Z`;
      const toDate = new Date(from);
      toDate.setUTCHours(toDate.getUTCHours() + 1);
      return {
        from,
        to: toDate.toISOString(),
        priceCZK: entry.czk_kwh ?? (entry.czk_mwh ?? 0) / 1000,
        priceEUR: entry.eur_kwh ?? (entry.eur_mwh ?? 0) / 1000,
        resolution: "1h",
      };
    });

    const quarterHourly =
      json.prices_15m?.map<SpotPricePoint>((entry) => ({
        from: toIso(json.date, entry.from),
        to: toIso(json.date, entry.to),
        priceCZK: entry.czk_kwh ?? 0,
        priceEUR: entry.eur_kwh ?? 0,
        resolution: "15m",
      })) ?? [];

    return {
      date: json.date,
      source: "electricitypriceapi.com",
      hourly,
      quarterHourly,
      updatedAt: json.updated_at,
    };
  } catch (error) {
    console.warn("fetchFromElectricityPriceApi fallback", (error as Error).message);
    return null;
  }
}

async function fetchFromSpotovaApi(): Promise<SpotPricePayload | null> {
  try {
    const res = await fetchWithRetry(SPOTOVA_API, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`SpotovaElektrina API responded with ${res.status}`);
    }
    const json = (await res.json()) as SpotovaResponse;
    const hours = [...(json.hoursToday ?? []), ...(json.hoursTomorrow ?? [])];
    if (!hours.length) {
      return null;
    }
    const today = new Date().toISOString().slice(0, 10);
    const hourly = hours.map<SpotPricePoint>((entry, idx) => {
      const base = new Date();
      base.setUTCHours(entry.hour, 0, 0, 0);
      base.setUTCDate(base.getUTCDate() + (idx >= 24 ? 1 : 0));
      const from = base.toISOString();
      const to = new Date(base.getTime() + 60 * 60 * 1000).toISOString();
      return {
        from,
        to,
        priceCZK: entry.priceCZK / 1000,
        priceEUR: entry.priceEur / 1000,
        resolution: "1h",
      };
    });
    return {
      date: today,
      source: "spotovaelektrina.cz",
      hourly,
      quarterHourly: [],
    };
  } catch (error) {
    console.warn("fetchFromSpotovaApi fallback", (error as Error).message);
    return null;
  }
}

async function fetchFromEntsoeApi(date?: string): Promise<SpotPricePayload | null> {
  if (!ENTSOE_TOKEN) {
    return null;
  }

  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const periodStart = `${targetDate.replace(/-/g, "")}0000`;
  const periodEnd = `${targetDate.replace(/-/g, "")}2300`;

  try {
    const url = `${ENTSOE_API}?documentType=A44&in_Domain=${ENTSOE_DOMAIN}&out_Domain=${ENTSOE_DOMAIN}&periodStart=${periodStart}&periodEnd=${periodEnd}&securityToken=${ENTSOE_TOKEN}`;
    const res = await fetchWithRetry(url, { cache: "no-store" });
    if (!res.ok) {
      console.error("ENTSOE API error", res.status);
      return null;
    }
    const text = await res.text();
    const parser = new XMLParser();
    const parsed = parser.parse(text) as EntsoeDocument;
    const timeseries = parsed?.Publication_MarketDocument?.TimeSeries;
    if (!timeseries) return null;
    const seriesArray = Array.isArray(timeseries) ? timeseries : [timeseries];
    const pointsSource = seriesArray[0]?.Period?.Point;
    if (!pointsSource) return null;
    const points = Array.isArray(pointsSource) ? pointsSource : [pointsSource];

    const hourly = points.map<SpotPricePoint>((point, idx) => {
      const priceEur = parseFloat(point["price.amount"] ?? "0");
      const from = new Date(`${targetDate}T00:00:00Z`);
      from.setUTCHours(from.getUTCHours() + idx);
      const to = new Date(from.getTime() + 60 * 60 * 1000);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        priceCZK: priceEur / 1000,
        priceEUR: priceEur / 1000,
        resolution: "1h",
      };
    });

    return {
      date: targetDate,
      source: "entsoe.eu",
      hourly,
      quarterHourly: [],
    };
  } catch (error) {
    console.warn("fetchFromEntsoeApi fallback", (error as Error).message);
    return null;
  }
}

async function fetchWithRetry(url: string, init?: RequestInit, attempts = 2, timeoutMs = 2500) {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && !RETRYABLE_STATUS.has(res.status)) {
        return res;
      }
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        await waitBackoff(i);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      await waitBackoff(i);
    }
  }
  console.warn("fetchWithRetry failed", url, lastError instanceof Error ? lastError.message : String(lastError));
  throw lastError ?? new Error("fetch failed");
}

function waitBackoff(attempt: number) {
  const ms = 200 * Math.pow(2, attempt);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHour(hour: string) {
  return hour.padStart(2, "0");
}

function toIso(date: string, time: string) {
  const [hours, minutes] = time.split(":").map((part) => parseInt(part, 10));
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCHours(hours, minutes, 0, 0);
  return base.toISOString();
}
