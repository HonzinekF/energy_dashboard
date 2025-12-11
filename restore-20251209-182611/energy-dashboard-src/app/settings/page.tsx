import { DashboardLayout } from "@/components/DashboardLayout";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";
import { getDefaultAnalysisConfig } from "@/lib/analysis";

type SettingsProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolved?.range),
    source: normalizeSource(resolved?.source),
    interval: normalizeInterval(resolved?.interval),
  };
  const defaults = getDefaultAnalysisConfig();

  return (
    <DashboardLayout filters={filters}>
      <div className="flex flex-col gap-3 pb-4">
        <h1 className="text-xl font-semibold text-slate-900">Nastavení analýzy</h1>
        <p className="text-sm text-slate-600">
          Zadej vlastní parametry (tarify, CAPEX, kapacita baterie). Formulář odesílá na stránku Analýza pomocí metody GET.
        </p>
      </div>
      <form
        action="/analysis"
        method="get"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <Input label="CAPEX FVE (Kč)" name="capexFveKc" defaultValue={defaults.capexFveKc} />
        <Input label="CAPEX baterie (Kč)" name="capexBatteryKc" defaultValue={defaults.capexBatteryKc} />
        <Input label="Cena importu (Kč/kWh)" name="importPriceKcPerKwh" defaultValue={defaults.importPriceKcPerKwh} step="0.1" />
        <Input label="Výkup (Kč/kWh)" name="feedinPriceKcPerKwh" defaultValue={defaults.feedinPriceKcPerKwh} step="0.1" />
        <Input label="Kapacita baterie (kWh)" name="batteryCapacityKwh" defaultValue={defaults.batteryCapacityKwh} step="0.5" />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Spočítat analýzu
          </button>
          <a
            href="/analysis"
            className="text-sm text-slate-600 hover:underline"
          >
            Reset
          </a>
        </div>
      </form>
    </DashboardLayout>
  );
}

function Input({ label, name, defaultValue, step = "1" }: { label: string; name: string; defaultValue: number; step?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span>{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        step={step}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
      />
    </label>
  );
}
