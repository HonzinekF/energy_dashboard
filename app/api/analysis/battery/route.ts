import { NextResponse } from "next/server";
import { runBatteryScenarios } from "@/lib/batterySim";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters: DashboardFilterState = {
    range: normalizeRange(url.searchParams.get("range")),
    source: normalizeSource(url.searchParams.get("source")),
    interval: normalizeInterval(url.searchParams.get("interval")),
  };
  const pricePerKwh = parseNumber(url.searchParams.get("pricePerKwh"));

  const scenarios = await runBatteryScenarios(filters, { pricePerKwh });
  if (!scenarios.length) {
    return NextResponse.json({ error: "Data nejsou k dispozici pro simulaci" }, { status: 404 });
  }

  const best = scenarios.reduce((max, scenario) => {
    if (max === null) return scenario;
    return scenario.savingsKc > max.savingsKc ? scenario : max;
  }, scenarios[0]);

  return NextResponse.json({
    filters,
    scenarios,
    recommendation: {
      capacityKwh: best.capacityKwh,
      savingsKc: best.savingsKc,
      selfSufficiency: best.selfSufficiency,
      paybackYears: best.paybackYears,
    },
  });
}

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
