import { loadSpotPrices } from "./spotPriceStore";
import type { DashboardRange } from "./dashboardFilters";
import { listSpotPriceStats } from "./spotPriceDb";

export type SpotHistoryPoint = {
  date: string;
  min: number;
  max: number;
  average: number;
};

export async function fetchSpotPricesHistory(limit = 14, range: DashboardRange = "24h"): Promise<SpotHistoryPoint[]> {
  const stats = listSpotPriceStats(limit);
  if (stats.length) {
    const normalized = stats
      .map<SpotHistoryPoint>((row) => ({
        date: row.day,
        min: row.min,
        max: row.max,
        average: row.average,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sliceByRange(normalized, range);
  }

  const data = await loadSpotPrices();
  const fallback = data
    .slice(0, limit)
    .map((payload) => ({
      date: payload.date,
      min: payload.hourly.reduce((prev, current) => Math.min(prev, current.priceCZK), Infinity),
      max: payload.hourly.reduce((prev, current) => Math.max(prev, current.priceCZK), -Infinity),
      average: payload.hourly.reduce((sum, current) => sum + current.priceCZK, 0) / payload.hourly.length,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return sliceByRange(fallback, range);
}

function sliceByRange(points: SpotHistoryPoint[], range: DashboardRange) {
  if (range === "24h") {
    return takeLast(points, 1);
  }
  if (range === "7d") {
    return takeLast(points, 7);
  }
  if (range === "30d") {
    return takeLast(points, 30);
  }
  if (range === "90d") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    return points.filter((point) => new Date(point.date) >= cutoff);
  }
  if (range === "thisYear" || range === "lastYear") {
    const targetYear = range === "thisYear" ? new Date().getFullYear() : new Date().getFullYear() - 1;
    return points.filter((point) => new Date(point.date).getFullYear() === targetYear);
  }
  return points;
}

function takeLast(points: SpotHistoryPoint[], count: number) {
  return points.slice(Math.max(points.length - count, 0));
}
