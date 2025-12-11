import { loadEnergyTotals } from "./dashboardMetrics";
import type { DashboardFilterState } from "./dashboardFilters";

type AnalysisConfig = {
  capexFveKc: number;
  capexBatteryKc: number;
  importPriceKcPerKwh: number;
  feedinPriceKcPerKwh: number;
  batteryCapacityKwh: number;
};

const DEFAULTS: AnalysisConfig = {
  capexFveKc: Number(process.env.CAPEX_FVE_KC ?? 350000),
  capexBatteryKc: Number(process.env.CAPEX_BATTERY_KC ?? 150000),
  importPriceKcPerKwh: Number(process.env.CZK_GRID_IMPORT_PRICE ?? 6.5),
  feedinPriceKcPerKwh: Number(process.env.CZK_FEEDIN_TARIFF ?? 1.5),
  batteryCapacityKwh: Number(process.env.BATTERY_CAPACITY_KWH ?? 10),
};

export function getDefaultAnalysisConfig(): AnalysisConfig {
  return { ...DEFAULTS };
}

export type AnalysisResult = {
  savingsKc: number;
  paybackYears: number | null;
  selfConsumptionShare: number | null;
  importShare: number | null;
  exportShare: number | null;
  annualProduction: number;
  annualImport: number;
  annualExport: number;
  batteryThroughput: number;
  batteryPotentialImportReduction: number;
};

export async function runAnalysis(filters: DashboardFilterState, config: Partial<AnalysisConfig> = {}): Promise<AnalysisResult | null> {
  const totals = loadEnergyTotals(filters);
  if (!totals) return null;

  const cfg = { ...DEFAULTS, ...config };
  const production = (totals.solaxProduction ?? 0) + (totals.tigoProduction ?? 0);
  const exportKwh = totals.solaxFeedIn ?? 0;
  const importKwh = totals.solaxImport ?? 0;
  const batteryOut = totals.batteryDischarge ?? 0;
  const batteryIn = totals.batteryCharge ?? 0;

  const savingsKc = exportKwh * cfg.feedinPriceKcPerKwh - importKwh * cfg.importPriceKcPerKwh;
  const capex = cfg.capexFveKc + cfg.capexBatteryKc;

  const paybackYears = savingsKc !== 0 ? Math.abs(capex / savingsKc) : null;

  const totalEnergy = production + importKwh;
  const selfConsumptionShare = totalEnergy > 0 ? (production - exportKwh) / totalEnergy : null;
  const importShare = totalEnergy > 0 ? importKwh / totalEnergy : null;
  const exportShare = production > 0 ? exportKwh / production : null;
  const batteryPotentialImportReduction = Math.min(exportKwh, cfg.batteryCapacityKwh);

  return {
    savingsKc,
    paybackYears,
    selfConsumptionShare,
    importShare,
    exportShare,
    annualProduction: production,
    annualImport: importKwh,
    annualExport: exportKwh,
    batteryThroughput: Math.max(batteryOut, batteryIn),
    batteryPotentialImportReduction,
  };
}
