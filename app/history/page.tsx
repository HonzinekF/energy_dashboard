import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { EnergyChart } from "@/components/EnergyChart";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";
import { loadDashboardData } from "@/lib/pythonClient";
import { loadEnergySeries } from "@/lib/dashboardMetrics";
import { getDefaultAnalysisConfig } from "@/lib/analysis";

type HistoryProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HistoryPage({ searchParams }: HistoryProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolved?.range),
    source: normalizeSource(resolved?.source),
    interval: normalizeInterval(resolved?.interval),
  };

  const [data, energySeries] = await Promise.all([loadDashboardData(filters), loadEnergySeries(filters)]);
  const merged = mergeHistory(data.history, energySeries);
  const csvUrl = `/api/history?range=${filters.range}&interval=${filters.interval}&source=${filters.source}&format=csv`;
  const view = parseView(resolved?.view);
  const rows = buildTableRows(merged, filters, view);

  return (
    <DashboardLayout filters={filters}>
      <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Historie</h1>
          <p className="text-sm text-slate-600">Detailní průběh energie podle zvoleného období a intervalu.</p>
        </div>
        <Link
          href={csvUrl}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </Link>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-slate-600">Zobrazit:</span>
        <Link
          href={`/history?view=energy&range=${filters.range}&interval=${filters.interval}&source=${filters.source}`}
          className={`rounded-lg px-3 py-1 text-sm ${view === "energy" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"}`}
        >
          Energie
        </Link>
        <Link
          href={`/history?view=power&range=${filters.range}&interval=${filters.interval}&source=${filters.source}`}
          className={`rounded-lg px-3 py-1 text-sm ${view === "power" ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-700"}`}
        >
          Výkon
        </Link>
      </div>

      <EnergyChart data={view === "power" ? toPowerSeries(merged, filters) : merged} />

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Tabulka</p>
            <p className="text-xs text-slate-500">Souhrn za zvolené období.</p>
          </div>
        </div>
        <table className="w-full min-w-[720px] text-sm text-slate-700">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Datum</th>
              <th className="py-2">Výroba ({view === "power" ? "kW" : "kWh"})</th>
              <th className="py-2">Dokup ({view === "power" ? "kW" : "kWh"})</th>
              <th className="py-2">Prodej ({view === "power" ? "kW" : "kWh"})</th>
              <th className="py-2">Soběstačnost</th>
              <th className="py-2">Úspora (Kč)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.datetime} className="border-t border-slate-100">
                <td className="py-2">{row.dateLabel}</td>
                <td className="py-2">{formatValue(row.production)}</td>
                <td className="py-2">{formatValue(row.import)}</td>
                <td className="py-2">{formatValue(row.export)}</td>
                <td className="py-2">{row.selfSufficiency.toFixed(1)} %</td>
                <td className="py-2">{row.savings.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}

type HistoryPoint = {
  datetime: string;
  production: number;
  export: number;
  import: number;
  batteryCharge?: number;
  batteryDischarge?: number;
  tigoProduction?: number;
};

function mergeHistory(
  history: { datetime: string; production: number; export: number; import: number }[],
  series: ReturnType<typeof loadEnergySeries>,
): HistoryPoint[] {
  if (!series?.length) {
    return history;
  }
  const map = new Map<string, HistoryPoint>();
  history.forEach((item) => map.set(item.datetime, { ...item }));
  series.forEach((item) => {
    const current = map.get(item.datetime) ?? {
      datetime: item.datetime,
      production: 0,
      export: 0,
      import: 0,
    };
    map.set(item.datetime, { ...current, ...item });
  });
  return Array.from(map.values()).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
}

function toPowerSeries(data: HistoryPoint[], filters: DashboardFilterState): HistoryPoint[] {
  const intervalHours = filters.interval === "15m" ? 0.25 : filters.interval === "1d" ? 24 : 1;
  return data.map((row) => ({
    ...row,
    production: row.production / intervalHours,
    export: row.export / intervalHours,
    import: row.import / intervalHours,
  }));
}

function parseView(value?: string | string[]) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === "power" ? "power" : "energy";
}

type TableRow = {
  datetime: string;
  dateLabel: string;
  production: number;
  import: number;
  export: number;
  selfSufficiency: number;
  savings: number;
};

function buildTableRows(data: HistoryPoint[], filters: DashboardFilterState, view: "energy" | "power"): TableRow[] {
  const cfg = getDefaultAnalysisConfig();
  const intervalHours = filters.interval === "15m" ? 0.25 : filters.interval === "1d" ? 24 : 1;
  return data.map((row) => {
    const denom = row.production + row.import;
    const self = denom > 0 ? ((row.production - row.export) / denom) * 100 : 0;
    const prod = view === "power" ? row.production / intervalHours : row.production;
    const imp = view === "power" ? row.import / intervalHours : row.import;
    const exp = view === "power" ? row.export / intervalHours : row.export;
    const savings = row.export * cfg.feedinPriceKcPerKwh - row.import * cfg.importPriceKcPerKwh;
    return {
      datetime: row.datetime,
      dateLabel: new Date(row.datetime).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" }),
      production: prod,
      import: imp,
      export: exp,
      selfSufficiency: self,
      savings,
    };
  });
}

function formatValue(value: number) {
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
}
