import type { DashboardFilterState } from "./dashboardFilters";
import { getDb } from "./db";

export type Scenario = {
  capacityKwh: number;
  selfSufficiency: number;
  savingsKc: number;
  importReduction: number;
  throughput: number;
  paybackYears: number | null;
};

type BatterySimOptions = {
  pricePerKwh?: number;
  capacityKwh?: number;
};

const MAX_CAPACITY = 20;
const PRICE_DEFAULT = Number(process.env.BATTERY_PRICE_PER_KWH ?? 10000);
const IMPORT_PRICE = Number(process.env.CZK_GRID_IMPORT_PRICE ?? 6.5);
const FEED_PRICE = Number(process.env.CZK_FEEDIN_TARIFF ?? 1.5);

export async function runBatteryScenarios(filters: DashboardFilterState, options: BatterySimOptions = {}): Promise<Scenario[]> {
  const samples = loadSeries(filters);
  if (!samples.length) return [];

  const pricePerKwh = options.pricePerKwh ?? PRICE_DEFAULT;
  const maxCapacity = Math.max(0, Math.min(options.capacityKwh ?? MAX_CAPACITY, MAX_CAPACITY));
  const scenarios: Scenario[] = [];

  for (let cap = 0; cap <= maxCapacity; cap += 1) {
    const { self, savings, importReduction, throughput } = simulate(samples, cap);
    const paybackYears = savings > 0 ? (cap * pricePerKwh) / savings : null;
    scenarios.push({
      capacityKwh: cap,
      selfSufficiency: self,
      savingsKc: savings,
      importReduction,
      throughput,
      paybackYears,
    });
  }

  return scenarios;
}

type Sample = { prod: number; cons: number };

function loadSeries(filters: DashboardFilterState): Sample[] {
  try {
    const db = getDb();
    const since = getSince(filters.range);
    const rows = db
      .prepare(
        `
        SELECT production_kwh as prod, consumption_kwh as cons
        FROM measurements
        WHERE datetime(timestamp) >= datetime(?)
        ORDER BY timestamp ASC
      `,
      )
      .all(since) as Array<{ prod: number | null; cons: number | null }>;
    return rows.map((r) => ({ prod: r.prod ?? 0, cons: r.cons ?? 0 })).filter((r) => r.prod > 0 || r.cons > 0);
  } catch (error) {
    console.warn("BatterySim: nedostupná tabulka measurements nebo DB.", error);
    return [];
  }
}

function getSince(range: DashboardFilterState["range"]) {
  const now = new Date();
  if (range === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function simulate(samples: Sample[], capacityKwh: number) {
  let soc = 0;
  let importKwh = 0;
  let exportKwh = 0;
  let throughput = 0;

  samples.forEach(({ prod, cons }) => {
    const surplus = prod - cons;
    if (surplus >= 0) {
      const charge = Math.min(surplus, capacityKwh - soc);
      soc += charge;
      exportKwh += surplus - charge;
    } else {
      const needed = -surplus;
      const discharge = Math.min(needed, soc);
      soc -= discharge;
      importKwh += needed - discharge;
    }
    throughput += Math.abs(surplus);
  });

  const totalProd = samples.reduce((sum, s) => sum + s.prod, 0);
  const totalCons = samples.reduce((sum, s) => sum + s.cons, 0);
  const self = totalProd + totalCons > 0 ? 1 - importKwh / (totalProd + totalCons) : 0;
  const savings = importKwh * IMPORT_PRICE + exportKwh * FEED_PRICE;

  return { self, savings, importReduction: importKwh, throughput };
}
