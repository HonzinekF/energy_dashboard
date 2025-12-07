import { NextResponse } from "next/server";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";
import { loadDashboardData } from "@/lib/pythonClient";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné parametry" }, { status: 400 });
  }

  const filters: DashboardFilterState = {
    range: normalizeRange(parsed.data.range),
    source: normalizeSource(parsed.data.source),
    interval: normalizeInterval(parsed.data.interval),
  };

  const data = await loadDashboardData(filters);
  const format = parsed.data.format;
  if (format === "csv") {
    const header = "datetime,production_kwh,export_kwh,import_kwh";
    const rows = data.history.map((row) =>
      [row.datetime, row.production ?? 0, row.export ?? 0, row.import ?? 0]
        .map((value) => (typeof value === "string" ? `"${value}"` : value))
        .join(","),
    );
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"history_${filters.range}_${filters.interval}.csv\"`,
      },
    });
  }

  return NextResponse.json({ filters, data });
}

const schema = z.object({
  range: z.string().optional(),
  source: z.string().optional(),
  interval: z.string().optional(),
  format: z.string().optional(),
});
