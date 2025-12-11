import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type Range = "day" | "week" | "month" | "year";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rangeParam = (url.searchParams.get("range") as Range | null) ?? "day";
  const range = ["day", "week", "month", "year"].includes(rangeParam) ? rangeParam : "day";

  const db = getDb();
  const { since, groupFormat } = rangeToSql(range);

  const series = db
    .prepare(
      `
      SELECT strftime(?, timestamp) AS bucket,
             SUM(production_kwh) AS production,
             SUM(consumption_kwh) AS consumption
      FROM measurements
      WHERE datetime(timestamp) >= datetime(?)
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
    )
    .all(groupFormat, since) as Array<{ bucket: string; production: number | null; consumption: number | null }>;

  let history = series.map((row) => ({
    datetime: row.bucket,
    production: row.production ?? 0,
    consumption: row.consumption ?? 0,
  }));

  // Fallback: pokud measurements jsou prázdné, agreguj ze solax_readings
  if (!history.length) {
    const fallback = db
      .prepare(
        `
        SELECT
          strftime(?, timestamp) AS bucket,
          SUM(pv_output) AS production,
          SUM(grid_feed_in) AS export,
          SUM(grid_import) AS gridImport
        FROM solax_readings
        WHERE datetime(timestamp) >= datetime(?)
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      )
      .all(groupFormat, since) as Array<{ bucket: string; production: number | null; export: number | null; gridImport: number | null }>;

    history = fallback.map((row) => {
      const prod = row.production ?? 0;
      const exp = row.export ?? 0;
      const imp = row.gridImport ?? 0;
      return {
        datetime: row.bucket,
        production: prod,
        consumption: Math.max(0, prod - exp + imp),
      };
    });
  }

  const totalProd = history.reduce((sum, row) => sum + row.production, 0);
  const totalCons = history.reduce((sum, row) => sum + row.consumption, 0);

  return NextResponse.json({
    range,
    series: history,
    totals: {
      production: totalProd,
      consumption: totalCons,
    },
  });
}

function rangeToSql(range: Range) {
  const now = new Date();
  let since: string;
  let format = "%Y-%m-%dT%H:00:00";
  if (range === "day") {
    since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    format = "%Y-%m-%dT%H:00:00";
  } else if (range === "week") {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    format = "%Y-%m-%d";
  } else if (range === "month") {
    since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    format = "%Y-%m-%d";
  } else {
    const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    since = lastYear.toISOString();
    format = "%Y-%m";
  }
  return { since, groupFormat: format };
}
