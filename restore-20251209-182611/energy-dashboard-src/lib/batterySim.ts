import type { DashboardFilterState } from "./dashboardFilters";
import { loadEnergyTotals } from "./dashboardMetrics";

type Scenario = {
  capacityKwh: number;
  selfSufficiency: number;
  savingsKc: number;
  importReduction: number;
  throughput: number;
  paybackYears: number | null;
};

type BatterySimOptions = {
  capacityKwh?: number;
  pricePerKwh?: number;
};

const MAX_CAPACITY = 20;
const PRICE_DEFAULT = Number(process.env.BATTERY_PRICE_PER_KWH ?? 10000);
const IMPORT_PRICE = Number(process.env.CZK_GRID_IMPORT_PRICE ?? 6.5);
const FEED_PRICE = Number(process.env.CZK_FEEDIN_TARIFF ?? 1.5);

export async function runBatteryScenarios(filters: DashboardFilterState, options: BatterySimOptions = {}): Promise<Scenario[]> {
  const totals = loadEnergyTotals(filters);
  if (!totals) return [];

  const pricePerKwh = options.pricePerKwh ?? PRICE_DEFAULT;
  const production = totals.solaxProduction ?? 0 + (totals.tigoProduction ?? 0);
  const exportKwh = totals.solaxFeedIn ?? 0;
  const importKwh = totals.solaxImport ?? 0;

  const scenarios: Scenario[] = [];
  for (let cap = 0; cap <= MAX_CAPACITY; cap += 1) {
    const usable = cap;
    const captured = Math.min(exportKwh, usable);
    const newImport = Math.max(0, importKwh - captured);
    const selfSufficiency = (production - exportKwh + captured) / (production + newImport || 1);
    const savingsKc = captured * (IMPORT_PRICE + FEED_PRICE);
    const throughput = captured * 2; // jednoduchý odhad cyklů
    const paybackYears = savingsKc > 0 ? (cap * pricePerKwh) / savingsKc : null;

    scenarios.push({
      capacityKwh: cap,
      selfSufficiency,
      savingsKc,
      importReduction: captured,
      throughput,
      paybackYears,
    });
  }
  return scenarios;
}
