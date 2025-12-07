import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dayIso = todayStart.toISOString();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const dayAgg = db
    .prepare(
      `
      SELECT
        SUM(production_kwh) as production,
        SUM(consumption_kwh) as consumption
      FROM measurements
      WHERE datetime(timestamp) >= datetime(?)
    `,
    )
    .get(dayIso) as { production: number | null; consumption: number | null };

  const series = db
    .prepare(
      `
      SELECT timestamp, production_kwh, consumption_kwh
      FROM measurements
      WHERE datetime(timestamp) >= datetime(?)
      ORDER BY timestamp ASC
    `,
    )
    .all(last24h) as Array<{ timestamp: string; production_kwh: number | null; consumption_kwh: number | null }>;

  const prod = dayAgg.production ?? 0;
  const cons = dayAgg.consumption ?? 0;
  const self = prod + cons > 0 ? Math.max(0, (prod - Math.max(0, prod - cons)) / (prod + cons)) : 0;

  return NextResponse.json({
    today: {
      productionKwh: prod,
      consumptionKwh: cons,
      selfSufficiency: self,
    },
    last24h: series.map((row) => ({
      datetime: row.timestamp,
      production: row.production_kwh ?? 0,
      consumption: row.consumption_kwh ?? 0,
    })),
  });
}
