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
    .get(dayIso) as { production: number | null; consumption: number | null } | undefined;

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

  // Fallback: pokud measurements nemají data, zkusíme agregovat ze solax_readings
  let production = dayAgg?.production ?? 0;
  let consumption = dayAgg?.consumption ?? 0;
  let last24hSeries = series.map((row) => ({
    datetime: row.timestamp,
    production: row.production_kwh ?? 0,
    consumption: row.consumption_kwh ?? 0,
  }));

  // Pokud measurements nemají data v posledních 24h, zkusíme vybrat poslední dostupné okno 24h
  if (!last24hSeries.length) {
    const latest = db.prepare(`SELECT MAX(timestamp) as ts FROM measurements`).get() as { ts?: string };
    if (latest?.ts) {
      const anchor = new Date(latest.ts);
      const windowStart = new Date(anchor.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const agg = db
        .prepare(
          `
          SELECT
            SUM(production_kwh) as production,
            SUM(consumption_kwh) as consumption
          FROM measurements
          WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        `,
        )
        .get(windowStart, latest.ts) as { production: number | null; consumption: number | null } | undefined;

      const windowSeries = db
        .prepare(
          `
          SELECT timestamp, production_kwh, consumption_kwh
          FROM measurements
          WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
          ORDER BY timestamp ASC
        `,
        )
        .all(windowStart, latest.ts) as Array<{ timestamp: string; production_kwh: number | null; consumption_kwh: number | null }>;

      if (windowSeries.length) {
        production = agg?.production ?? 0;
        consumption = agg?.consumption ?? 0;
        last24hSeries = windowSeries.map((row) => ({
          datetime: row.timestamp,
          production: row.production_kwh ?? 0,
          consumption: row.consumption_kwh ?? 0,
        }));
      }
    }
  }

  if (!last24hSeries.length) {
    const solaxAgg = db
      .prepare(
        `
        SELECT
          SUM(pv_output) AS production,
          SUM(grid_feed_in) AS export,
          SUM(grid_import) AS gridImport
        FROM solax_readings
        WHERE datetime(timestamp) >= datetime(?)
      `,
      )
      .get(dayIso) as { production: number | null; export: number | null; gridImport: number | null } | undefined;

    const fallbackSeries = db
      .prepare(
        `
        SELECT timestamp, pv_output, grid_feed_in, grid_import
        FROM solax_readings
        WHERE datetime(timestamp) >= datetime(?)
        ORDER BY timestamp ASC
      `,
      )
      .all(last24h) as Array<{ timestamp: string; pv_output: number | null; grid_feed_in: number | null; grid_import: number | null }>;

    production = solaxAgg?.production ?? 0;
    const exportKwh = solaxAgg?.export ?? 0;
    const importKwh = solaxAgg?.gridImport ?? 0;
    consumption = Math.max(0, production - exportKwh + importKwh);

    last24hSeries = fallbackSeries.map((row) => {
      const prod = row.pv_output ?? 0;
      const exp = row.grid_feed_in ?? 0;
      const imp = row.grid_import ?? 0;
      return {
        datetime: row.timestamp,
        production: prod,
        consumption: Math.max(0, prod - exp + imp),
      };
    });
  }

  const self = production + consumption > 0 ? Math.max(0, (production - Math.max(0, production - consumption)) / (production + consumption)) : 0;

  return NextResponse.json({
    today: {
      productionKwh: production,
      consumptionKwh: consumption,
      selfSufficiency: self,
    },
    last24h: last24hSeries,
  });
}
