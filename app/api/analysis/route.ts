import { NextResponse } from "next/server";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";
import { runAnalysis } from "@/lib/analysis";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const filters: DashboardFilterState = {
    range: normalizeRange(params.range),
    source: normalizeSource(params.source),
    interval: normalizeInterval(params.interval),
  };

  const result = await runAnalysis(filters);
  if (!result) {
    return NextResponse.json({ error: "Data nejsou k dispozici" }, { status: 404 });
  }

  return NextResponse.json({ filters, analysis: result });
}
