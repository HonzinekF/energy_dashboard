import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  intervalToBucketFormat,
  normalizeInterval,
  normalizeRange,
  resolveRangeBounds,
  normalizeDate,
  normalizeSystem,
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
    const system = normalizeSystem(url.searchParams.get("system") ?? undefined);

    const bounds = resolveRangeBounds(range, from, to);
    const db = getDb();

    // Vyžadujeme pouze lokální measurements; fallback na SolaX vypnutý
    let dashboardSource: "db" | "solax" = "db";
    const payload = loadFromMeasurements(db, bounds, interval, system ?? null);

    if (!payload) {
      return NextResponse.json({
        range,
        interval,
        dashboardSource,
        source: "measurements",
        points: [],
        totals: null,
        message: "Žádná data pro vybrané období.",
      });
    }

    return NextResponse.json({ range, interval, dashboardSource, ...payload });
  } catch (error) {
    console.error("API /api/dashboard selhalo", error);
    return NextResponse.json({ error: "Nepodařilo se načíst data pro dashboard." }, { status: 500 });
  }
}

function loadFromMeasurements(
  db: any,
  bounds: { from: string; to: string },
  interval: DashboardInterval,
  systemId?: string | null,
): DashboardPayload | null {
  try {
    const bucket = intervalToBucketFormat(interval);
    const flags = measurementColumnFlags(db);
    const rows = db
      .prepare(
        `
        SELECT
          strftime(?, timestamp) || 'Z' AS bucket,
          SUM(production_kwh) AS production_kwh,
          ${flags.hasGridImport ? "SUM(grid_import_kwh)" : "0"} AS grid_import_kwh,
          ${flags.hasGridExport ? "SUM(grid_export_kwh)" : "0"} AS grid_export_kwh,
          ${flags.hasConsumption ? "SUM(consumption_kwh)" : "0"} AS consumption_kwh
        FROM measurements
        WHERE (? IS NULL OR system_id = ?) AND datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      )
      .all(bucket, systemId ?? null, systemId ?? null, bounds.from, bounds.to) as Array<{
      bucket: string;
      production_kwh: number | null;
      consumption_kwh: number | null;
      grid_import_kwh: number | null;
      grid_export_kwh: number | null;
    }>;

    const tigoBuckets = loadTigoBuckets(db, bounds, bucket, systemId);

    if (!rows.length) {
      return null;
    }

    const map = new Map<string, DashboardPoint>();
    rows.forEach((row) => {
      const production = row.production_kwh ?? 0;
      const gridImport = row.grid_import_kwh ?? 0;
      const gridExport = row.grid_export_kwh ?? 0;
      const consumption =
        row.consumption_kwh ?? (flags.hasGridImport || flags.hasGridExport ? Math.max(0, production - gridExport + gridImport) : production);
      map.set(row.bucket, {
        timestamp: row.bucket,
        production_kwh: production,
        consumption_kwh: consumption,
        grid_import_kwh: gridImport,
        grid_export_kwh: gridExport,
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

    const totalsAgg = points.reduce(
      (acc, cur) => {
        acc.production_kwh += cur.production_kwh;
        acc.consumption_kwh += cur.consumption_kwh;
        acc.grid_import_kwh += cur.grid_import_kwh;
        acc.grid_export_kwh += cur.grid_export_kwh;
        return acc;
      },
      { production_kwh: 0, consumption_kwh: 0, grid_import_kwh: 0, grid_export_kwh: 0 },
    );

    const tigoTotal = Array.from(tigoBuckets.values()).reduce((sum, cur) => sum + cur, 0);
    return {
      source: "measurements",
      points,
      totals: {
        production_kwh: totalsAgg.production_kwh,
        consumption_kwh: totalsAgg.consumption_kwh,
        grid_import_kwh: totalsAgg.grid_import_kwh,
        grid_export_kwh: totalsAgg.grid_export_kwh,
        tigo_kwh: tigoTotal || undefined,
        balance_kwh: totalsAgg.production_kwh - totalsAgg.consumption_kwh,
      },
    };
  } catch (error) {
    console.warn("Dashboard measurements fallback", error);
    return null;
  }
}

function measurementColumnFlags(db: any) {
  if (measurementColumnCache) return measurementColumnCache;
  try {
    const cols = db.prepare("PRAGMA table_info(measurements)").all() as Array<{ name: string }>;
    measurementColumnCache = {
      hasGridImport: cols.some((c) => c.name === "grid_import_kwh"),
      hasGridExport: cols.some((c) => c.name === "grid_export_kwh"),
      hasConsumption: cols.some((c) => c.name === "consumption_kwh"),
    };
  } catch {
    measurementColumnCache = { hasGridImport: false, hasGridExport: false, hasConsumption: false };
  }
  return measurementColumnCache;
}

let measurementColumnCache: { hasGridImport: boolean; hasGridExport: boolean; hasConsumption: boolean } | null = null;

function loadFromSolax(
  db: any,
  bounds: { from: string; to: string },
  interval: DashboardInterval,
  systemId?: string | null,
): DashboardPayload | null {
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
    WHERE (? IS NULL OR system_id = ?) AND datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      )
      .all(bucket, systemId ?? null, systemId ?? null, bounds.from, bounds.to) as Array<{
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
        WHERE (? IS NULL OR system_id = ?) AND datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
      `,
      )
      .get(systemId ?? null, systemId ?? null, bounds.from, bounds.to) as {
      production_kwh: number | null;
      grid_export_kwh: number | null;
      grid_import_kwh: number | null;
    } | null;

    const tigoBuckets = loadTigoBuckets(db, bounds, bucket, systemId);

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

function loadTigoBuckets(db: any, bounds: { from: string; to: string }, bucket: string, systemId?: string | null) {
  try {
    const rows = db
      .prepare(
        `
        SELECT strftime(?, timestamp) || 'Z' AS bucket, SUM(total) AS total
        FROM tigo_readings
        WHERE system_id = COALESCE(?, system_id) AND datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
        GROUP BY bucket
      `,
      )
      .all(bucket, systemId ?? null, bounds.from, bounds.to) as Array<{ bucket: string; total: number | null }>;
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
