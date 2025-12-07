import { NextResponse } from "next/server";
import { loadDashboardData } from "@/lib/pythonClient";
import { isAuthenticated } from "@/lib/auth";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters: DashboardFilterState = {
    range: normalizeRange(url.searchParams.get("range") ?? undefined),
    source: normalizeSource(url.searchParams.get("source") ?? undefined),
    interval: normalizeInterval(url.searchParams.get("interval") ?? undefined),
  };

  const payload = await loadDashboardData(filters);
  return NextResponse.json(payload);
}
