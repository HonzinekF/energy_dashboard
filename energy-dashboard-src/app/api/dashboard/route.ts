import { NextResponse } from "next/server";
import { loadDashboardData } from "@/lib/pythonClient";
import { isAuthenticated } from "@/lib/auth";
import { normalizeRange, normalizeSource } from "@/lib/dashboardFilters";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = {
    range: normalizeRange(url.searchParams.get("range") ?? undefined),
    source: normalizeSource(url.searchParams.get("source") ?? undefined),
  };

  const payload = await loadDashboardData(filters);
  return NextResponse.json(payload);
}
