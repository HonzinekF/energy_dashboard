import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";
import { runAnalysis } from "@/lib/analysis";

type AnalysisProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalysisPage({ searchParams }: AnalysisProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolved?.range),
    source: normalizeSource(resolved?.source),
    interval: normalizeInterval(resolved?.interval),
  };

  const overrides = parseOverrides(resolved);
  const analysis = await runAnalysis(filters, overrides);

  return (
    <DashboardLayout filters={filters}>
      <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Analýza</h1>
          <p className="text-sm text-slate-600">
            Rychlá ROI a přehled soběstačnosti na základě aktuálních dat. Parametry lze upravit v Nastavení.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/history"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Historie
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Dashboard
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Nastavení
          </Link>
        </div>
      </div>

      {analysis ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Card label="Roční úspora" value={analysis.savingsKc} unit="Kč/rok" />
          <Card
            label="Návratnost"
            value={analysis.paybackYears ? analysis.paybackYears : 0}
            unit="roky"
            hint={analysis.paybackYears ? undefined : "Nedostatečná úspora pro ROI"}
          />
          <Card
            label="Soběstačnost"
            value={(analysis.selfConsumptionShare ?? 0) * 100}
            unit="%"
          />
          <Card label="Podíl importu" value={(analysis.importShare ?? 0) * 100} unit="%" />
          <Card label="Podíl exportu" value={(analysis.exportShare ?? 0) * 100} unit="%" />
          <Card label="Průtok baterie" value={analysis.batteryThroughput} unit="kWh" />
          <Card label="Potenciál snížení importu baterií" value={analysis.batteryPotentialImportReduction} unit="kWh" />
        </div>
      ) : (
        <p className="text-sm text-slate-600">Analytická data nejsou k dispozici pro zvolené filtry.</p>
      )}
    </DashboardLayout>
  );
}

function parseOverrides(params?: Record<string, string | string[] | undefined>) {
  if (!params) return {};
  const num = (key: string) => {
    const value = params[key];
    if (!value) return undefined;
    const parsed = parseFloat(Array.isArray(value) ? value[0] : value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    capexFveKc: num("capexFveKc"),
    capexBatteryKc: num("capexBatteryKc"),
    importPriceKcPerKwh: num("importPriceKcPerKwh"),
    feedinPriceKcPerKwh: num("feedinPriceKcPerKwh"),
    batteryCapacityKwh: num("batteryCapacityKwh"),
  };
}

function Card({ label, value, unit, hint }: { label: string; value: number; unit?: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold">
        {value.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        {unit && <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>}
      </p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
