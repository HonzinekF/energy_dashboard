import { NextResponse } from "next/server";
import {
  normalizeInterval,
  normalizeRange,
  resolveRangeBounds,
  type DashboardInterval,
  type DashboardRange,
} from "@/lib/dashboardFilters";
import { loadSpotSeries, type SpotSeriesPoint } from "@/lib/spotPriceStore";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = normalizeRange(url.searchParams.get("range") ?? undefined);
    const interval = normalizeInterval(url.searchParams.get("interval") ?? undefined);

    const bounds = resolveRangeBounds(range);
    const history = await loadSpotSeries(determineDaysBack(bounds));
    const filtered = filterByRange(history, bounds);
    const points = bucketSpotPrices(filtered, interval);
    const stats = buildStats(points);

    return NextResponse.json({
      range,
      interval,
      unit: "CZK/kWh",
      points,
      stats,
      message: points.length ? undefined : "Žádná data pro vybrané období.",
    });
  } catch (error) {
    console.error("API /api/spot/history selhalo", error);
    return NextResponse.json({ error: "Nepodařilo se načíst historii spot cen." }, { status: 500 });
  }
}

type SpotPoint = {
  timestamp: string;
  price_czk_kwh: number;
  price_eur_kwh: number | null;
};

type SpotStats = {
  average_czk_kwh: number;
  average_eur_kwh: number | null;
  min_czk_kwh: number;
  max_czk_kwh: number;
  min_at: string | null;
  max_at: string | null;
};

function bucketSpotPrices(points: SpotSeriesPoint[], interval: DashboardInterval): SpotPoint[] {
  const buckets = new Map<
    string,
    { sumCzk: number; sumEur: number; count: number; eurCount: number }
  >();

  points.forEach((point) => {
    const bucket = toBucket(point.timestamp, interval);
    const current = buckets.get(bucket) ?? { sumCzk: 0, sumEur: 0, count: 0, eurCount: 0 };
    current.sumCzk += point.priceCZK;
    current.count += 1;
    if (point.priceEUR !== undefined && point.priceEUR !== null) {
      current.sumEur += point.priceEUR;
      current.eurCount += 1;
    }
    buckets.set(bucket, current);
  });

  return Array.from(buckets.entries())
    .map(([bucket, agg]) => ({
      timestamp: bucket,
      price_czk_kwh: agg.sumCzk / Math.max(agg.count, 1),
      price_eur_kwh: agg.eurCount ? agg.sumEur / agg.eurCount : null,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function buildStats(points: SpotPoint[]): SpotStats | null {
  if (!points.length) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let minAt: string | null = null;
  let maxAt: string | null = null;
  let sum = 0;
  let sumEur = 0;
  let eurCount = 0;

  points.forEach((point) => {
    sum += point.price_czk_kwh;
    if (point.price_czk_kwh < min) {
      min = point.price_czk_kwh;
      minAt = point.timestamp;
    }
    if (point.price_czk_kwh > max) {
      max = point.price_czk_kwh;
      maxAt = point.timestamp;
    }
    if (point.price_eur_kwh !== null && point.price_eur_kwh !== undefined) {
      sumEur += point.price_eur_kwh;
      eurCount += 1;
    }
  });

  return {
    average_czk_kwh: sum / points.length,
    average_eur_kwh: eurCount ? sumEur / eurCount : null,
    min_czk_kwh: min,
    max_czk_kwh: max,
    min_at: minAt,
    max_at: maxAt,
  };
}

function toBucket(timestamp: string, interval: DashboardInterval) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  const bucket = new Date(date);
  if (interval === "1d") {
    bucket.setUTCHours(0, 0, 0, 0);
  } else if (interval === "1h") {
    bucket.setUTCMinutes(0, 0, 0);
  } else {
    const minutes = bucket.getUTCMinutes();
    bucket.setUTCMinutes(minutes - (minutes % 15), 0, 0);
  }
  return bucket.toISOString();
}

function filterByRange(points: SpotSeriesPoint[], bounds: { from: string; to: string }) {
  const from = Date.parse(bounds.from);
  const to = Date.parse(bounds.to);
  return points.filter((point) => {
    const ts = Date.parse(point.timestamp);
    return Number.isFinite(ts) && ts >= from && ts <= to;
  });
}

function determineDaysBack(bounds: { from: string; to: string }) {
  const from = Date.parse(bounds.from);
  const to = Date.parse(bounds.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 30;
  }
  const diffDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
  return Math.max(diffDays + 2, 7);
}
