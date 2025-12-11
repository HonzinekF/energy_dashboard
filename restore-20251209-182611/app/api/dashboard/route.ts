import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  intervalToBucketFormat,
  normalizeInterval,
  normalizeRange,
  resolveRangeBounds,
  normalizeDate,
  type DashboardInterval,
  type DashboardRange,
} from "@/lib/dashboardFilters";

export const runtime = "nodejs";

type DashboardPoint = {
  timestamp: string;
  production_kwh: number;
  consumption_kwh: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  tigo_kwh?: number;
};

type DashboardPayload = {
  source: "measurements" | "solax_readings";
  points: DashboardPoint[];
  totals: {
    production_kwh: number;
    consumption_kwh: number;
    grid_import_kwh: number;
    grid_export_kwh: number;
    tigo_kwh?: number;
    balance_kwh: number;
  };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = normalizeRange(url.searchParams.get("range") ?? undefined);
    const from = normalizeDate(url.searchParams.get("from") ?? undefined);
    const to = normalizeDate(url.searchParams.get("to") ?? undefined);
    const interval = normalizeInterval(url.searchParams.get("interval") ?? undefined);

    const bounds = resolveRangeBounds(range, from, to);
    const db = getDb();

    const payload = loadFromMeasurements(db, bounds, interval) ?? loadFromSolax(db, bounds, interval);

    if (!payload) {
      return NextResponse.json({
        range,
        interval,
        source: "measurements",
        points: [],
        totals: null,
        message: "Žádná data pro vybrané období.",
      });
    }

    return NextResponse.json({ range, interval, ...payload });
  } catch (error) {
    console.error("API /api/dashboard selhalo", error);
    return NextResponse.json({ error: "Nepodařilo se načíst data pro dashboard." }, { status: 500 });
  }
}

function loadFromMeasurements(
  db: any,
  bounds: { from: string; to: string },
  interval: DashboardInterval,
): DashboardPayload | null {
  try {
    const bucket = intervalToBucketFormat(interval);
    const rows = db
      .prepare(
        `
        SELECT
          strftime(?, timestamp) || 'Z' AS bucket,
          SUM(production_kwh) AS production_kwh,
          SUM(consumption_kwh) AS consumption_kwh,
          SUM(grid_import_kwh) AS grid_import_kwh,
          SUM(grid_export_kwh) AS grid_export_kwh
        FROM measurements
        WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      )
      .all(bucket, bounds.from, bounds.to) as Array<{
      bucket: string;
      production_kwh: number | null;
      consumption_kwh: number | null;
      grid_import_kwh: number | null;
      grid_export_kwh: number | null;
    }>;

    const tigoBuckets = loadTigoBuckets(db, bounds, bucket);

    if (!rows.length) {
      return null;
    }

    const totals = db
      .prepare(
        `
        SELECT
          SUM(production_kwh) AS production_kwh,
          SUM(consumption_kwh) AS consumption_kwh,
          SUM(grid_import_kwh) AS grid_import_kwh,
          SUM(grid_export_kwh) AS grid_export_kwh
        FROM measurements
        WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
      `,
      )
      .get(bounds.from, bounds.to) as {
      production_kwh: number | null;
      consumption_kwh: number | null;
      grid_import_kwh: number | null;
      grid_export_kwh: number | null;
    } | null;

    const map = new Map<string, DashboardPoint>();
    rows.forEach((row) => {
      map.set(row.bucket, {
        timestamp: row.bucket,
        production_kwh: row.production_kwh ?? 0,
        consumption_kwh: row.consumption_kwh ?? 0,
        grid_import_kwh: row.grid_import_kwh ?? 0,
        grid_export_kwh: row.grid_export_kwh ?? 0,
      });
    });
    tigoBuckets.forEach((value, bucketTs) => {
      const existing = map.get(bucketTs) ?? {
        timestamp: bucketTs,
        production_kwh: 0,
        consumption_kwh: 0,
        grid_import_kwh: 0,
        grid_export_kwh: 0,
      };
      map.set(bucketTs, { ...existing, tigo_kwh: value });
    });

    const points = Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const tigoTotal = Array.from(tigoBuckets.values()).reduce((sum, cur) => sum + cur, 0);
    return {
      source: "measurements",
      points,
      totals: {
        production_kwh: totals?.production_kwh ?? 0,
        consumption_kwh: totals?.consumption_kwh ?? 0,
        grid_import_kwh: totals?.grid_import_kwh ?? 0,
        grid_export_kwh: totals?.grid_export_kwh ?? 0,
        tigo_kwh: tigoTotal || undefined,
        balance_kwh: (totals?.production_kwh ?? 0) - (totals?.consumption_kwh ?? 0),
      },
    };
  } catch (error) {
    console.warn("Dashboard measurements fallback", error);
    return null;
  }
}

function loadFromSolax(db: any, bounds: { from: string; to: string }, interval: DashboardInterval): DashboardPayload | null {
  try {
    const bucket = intervalToBucketFormat(interval);
    const rows = db
      .prepare(
        `
        SELECT
          strftime(?, timestamp) || 'Z' AS bucket,
      SUM(pv_output) AS production_kwh,
      SUM(grid_feed_in) AS grid_export_kwh,
      SUM(grid_import) AS grid_import_kwh
    FROM solax_readings
    WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      )
      .all(bucket, bounds.from, bounds.to) as Array<{
      bucket: string;
      production_kwh: number | null;
      grid_export_kwh: number | null;
      grid_import_kwh: number | null;
    }>;

    if (!rows.length) {
      return null;
    }

    const totals = db
      .prepare(
        `
        SELECT
          SUM(pv_output) AS production_kwh,
          SUM(grid_feed_in) AS grid_export_kwh,
          SUM(grid_import) AS grid_import_kwh
        FROM solax_readings
        WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
      `,
      )
      .get(bounds.from, bounds.to) as {
      production_kwh: number | null;
      grid_export_kwh: number | null;
      grid_import_kwh: number | null;
    } | null;

    const tigoBuckets = loadTigoBuckets(db, bounds, bucket);

    const points = rows.map((row) => {
      const production = row.production_kwh ?? 0;
      const gridExport = row.grid_export_kwh ?? 0;
      const gridImport = row.grid_import_kwh ?? 0;
      const base = {
        timestamp: row.bucket,
        production_kwh: production,
        grid_export_kwh: gridExport,
        grid_import_kwh: gridImport,
        consumption_kwh: Math.max(0, production - gridExport + gridImport),
      };
      const tigoVal = tigoBuckets.get(row.bucket);
      return tigoVal ? { ...base, tigo_kwh: tigoVal } : base;
    });

    // doplníme příp. tigo buckety, které nejsou v solax datech
    tigoBuckets.forEach((value, bucketTs) => {
      if (!points.find((p) => p.timestamp === bucketTs)) {
        points.push({
          timestamp: bucketTs,
          production_kwh: 0,
          consumption_kwh: 0,
          grid_export_kwh: 0,
          grid_import_kwh: 0,
          tigo_kwh: value,
        });
      }
    });

    points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const productionTotal = totals?.production_kwh ?? 0;
    const gridExportTotal = totals?.grid_export_kwh ?? 0;
    const gridImportTotal = totals?.grid_import_kwh ?? 0;
    const consumptionTotal = Math.max(0, productionTotal - gridExportTotal + gridImportTotal);
    const tigoTotal = Array.from(tigoBuckets.values()).reduce((sum, cur) => sum + cur, 0);

    return {
      source: "solax_readings",
      points,
      totals: {
        production_kwh: productionTotal,
        consumption_kwh: consumptionTotal,
        grid_import_kwh: gridImportTotal,
        grid_export_kwh: gridExportTotal,
        tigo_kwh: tigoTotal || undefined,
        balance_kwh: productionTotal - consumptionTotal,
      },
    };
  } catch (error) {
    console.warn("Dashboard solax fallback", error);
    return null;
  }
}

function loadTigoBuckets(db: any, bounds: { from: string; to: string }, bucket: string) {
  try {
    const rows = db
      .prepare(
        `
        SELECT strftime(?, timestamp) || 'Z' AS bucket, SUM(total) AS total
        FROM tigo_readings
        WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        GROUP BY bucket
      `,
      )
      .all(bucket, bounds.from, bounds.to) as Array<{ bucket: string; total: number | null }>;
    const map = new Map<string, number>();
    rows.forEach((row) => {
      map.set(row.bucket, row.total ?? 0);
    });
    return map;
  } catch (error) {
    console.warn("Tigo bucket load failed", error);
    return new Map<string, number>();
  }
}
