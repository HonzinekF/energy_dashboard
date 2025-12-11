import { NextResponse } from "next/server";
import { runBatteryScenarios } from "@/lib/batterySim";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const getParam = (key: string) => url.searchParams.get(key) ?? undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(getParam("range")),
    source: normalizeSource(getParam("source")),
    interval: normalizeInterval(getParam("interval")),
  };
const pricePerKwh = parseNumber(getParam("pricePerKwh"));

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

function parseNumber(value: string | undefined) {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}
