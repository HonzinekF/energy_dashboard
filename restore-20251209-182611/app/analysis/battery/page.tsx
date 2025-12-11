import { DashboardLayout } from "@/components/DashboardLayout";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";
import { runBatteryScenarios } from "@/lib/batterySim";
import { BatteryChart } from "@/components/BatteryChart";
import Link from "next/link";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BatteryAnalysisPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolved?.range),
    source: normalizeSource(resolved?.source),
    interval: normalizeInterval(resolved?.interval),
  };

  const capacity = parseNumberParam(resolved, "capacity") ?? 10;
  const pricePerKwh = parseNumberParam(resolved, "batteryPrice") ?? 10000;
  const scenarios = await runBatteryScenarios(filters, { capacityKwh: capacity, pricePerKwh });
  const selected = scenarios.find((s) => s.capacityKwh === capacity) ?? scenarios[0];

  return (
    <DashboardLayout filters={filters}>
      <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kapacita baterie</h1>
          <p className="text-sm text-slate-600">Vyzkoušej různé kapacity (0–20 kWh) a podívej se na úspory a soběstačnost.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/analysis"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Analýza
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Nastavení
          </Link>
        </div>
      </div>

      <form method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span>Kapacita baterie (kWh)</span>
          <input
            type="range"
            name="capacity"
            min="0"
            max="20"
            step="1"
            defaultValue={capacity}
            className="accent-amber-500"
          />
          <span className="text-xs text-slate-500">Aktuální: {capacity} kWh</span>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          <span>Cena baterie (Kč/kWh)</span>
          <input
            type="number"
            name="batteryPrice"
            min="0"
            step="500"
            defaultValue={pricePerKwh}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Spočítat
          </button>
        </div>
      </form>

      {selected ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Card label="Soběstačnost" value={selected.selfSufficiency * 100} unit="%" />
          <Card label="Roční úspora" value={selected.savingsKc} unit="Kč/rok" />
          <Card
            label="Návratnost"
            value={selected.paybackYears ?? 0}
            unit="roky"
            hint={selected.paybackYears ? undefined : "Nedostatečná úspora pro ROI"}
          />
          <Card label="Posun importu" value={selected.importReduction} unit="kWh/rok" />
          <Card label="Vybití baterie" value={selected.throughput} unit="kWh/rok" />
        </div>
      ) : (
        <p className="text-sm text-slate-600">Pro zadané parametry nejsou data.</p>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Scénáře (0–20 kWh)</h2>
        <BatteryChart scenarios={scenarios} />
      </div>
    </DashboardLayout>
  );
}

function parseNumberParam(params?: Record<string, string | string[] | undefined>, key?: string) {
  if (!key || !params) return undefined;
  const raw = params[key];
  if (!raw) return undefined;
  const value = parseFloat(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) ? value : undefined;
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
