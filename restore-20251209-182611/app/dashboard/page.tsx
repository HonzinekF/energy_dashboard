import { headers } from "next/headers";
import { DashboardLayout } from "@/components/DashboardLayout";
import { EnergyChart } from "@/components/EnergyChart";
import { MetricCard } from "@/components/MetricCard";
import {
  normalizeInterval,
  normalizeRange,
  normalizeSource,
  normalizeDate,
  type DashboardFilterState,
} from "@/lib/dashboardFilters";

type DashboardPoint = {
  timestamp: string;
  production_kwh: number;
  consumption_kwh: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  tigo_kwh?: number;
};

type DashboardApiResponse = {
  points: DashboardPoint[];
  totals: {
    production_kwh: number;
    consumption_kwh: number;
    grid_import_kwh: number;
    grid_export_kwh: number;
    tigo_kwh?: number;
    balance_kwh: number;
  } | null;
  source?: string;
  message?: string;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  };

export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolvedSearchParams?.range),
    source: normalizeSource(resolvedSearchParams?.source),
    interval: normalizeInterval(resolvedSearchParams?.interval),
    from: normalizeDate(resolvedSearchParams?.from),
    to: normalizeDate(resolvedSearchParams?.to),
  };

  const headerList = await headers();
  const cookieHeader = headerList.get("cookie") ?? undefined;
  const payload = await fetchDashboard(filters, cookieHeader);
  const chartData = payload.points.map((point) => ({
    datetime: point.timestamp,
    production: point.production_kwh ?? 0,
    consumption: point.consumption_kwh ?? 0,
    export: point.grid_export_kwh ?? 0,
    import: point.grid_import_kwh ?? 0,
    tigoProduction: point.tigo_kwh ?? 0,
  }));
  const summary = buildSummary(payload.totals);
  const hasData = chartData.length > 0;

  return (
    <DashboardLayout
      title="Vizualizace energie"
      description="Výroba, spotřeba a tok do/ze sítě z lokální DB."
      filters={filters}
    >
      <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              Zdroj dat: {payload.source === "solax_readings" ? "SolaX fallback" : "Tabulka measurements"}
            </span>
            {payload.message ? <span className="text-slate-500">{payload.message}</span> : null}
          </div>
          <p className="text-xs text-slate-500">
            Pokud data v čase chybí, import přepíše záznam se stejným časem (INSERT OR REPLACE).
          </p>
        </div>
      </section>

      <EnergyChart data={chartData} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {summary.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>

      {!hasData ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Žádná data pro vybrané období. Nahrajte CSV přes Import nebo změňte filtr.
        </p>
      ) : null}
    </DashboardLayout>
  );
}

function buildSummary(
  totals: DashboardApiResponse["totals"],
): Array<{ label: string; value: number; unit?: string }> {
  if (!totals) return [];
  return [
    { label: "Celková výroba", value: totals.production_kwh, unit: "kWh" },
    totals.tigo_kwh ? { label: "Výroba Tigo", value: totals.tigo_kwh, unit: "kWh" } : null,
    { label: "Celková spotřeba", value: totals.consumption_kwh, unit: "kWh" },
    { label: "Nákup ze sítě", value: totals.grid_import_kwh, unit: "kWh" },
    { label: "Dodávka do sítě", value: totals.grid_export_kwh, unit: "kWh" },
    { label: "Energetická bilance", value: totals.balance_kwh, unit: "kWh" },
  ].filter(Boolean) as Array<{ label: string; value: number; unit?: string }>;
}

async function fetchDashboard(filters: DashboardFilterState, cookieHeader?: string) {
  try {
    const url = new URL("/api/dashboard", getBaseUrl());
    url.searchParams.set("range", filters.range);
    url.searchParams.set("interval", filters.interval);
    if (filters.range === "custom") {
      if (filters.from) url.searchParams.set("from", filters.from);
      if (filters.to) url.searchParams.set("to", filters.to);
    }
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!res.ok) {
      return { points: [], totals: null, message: "API vrátilo chybu." };
    }
    const json = (await res.json()) as DashboardApiResponse;
    return { points: json.points ?? [], totals: json.totals ?? null, source: json.source, message: json.message };
  } catch (error) {
    console.error("fetchDashboard selhalo", error);
    return { points: [], totals: null, message: "Nepodařilo se načíst data." };
  }
}

function getBaseUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_ORIGIN;
  if (env) {
    return env.startsWith("http") ? env : `https://${env}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
