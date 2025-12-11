import { headers } from "next/headers";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import { SpotChart } from "@/components/SpotChart";
import { formatDateTime } from "@/lib/format";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";

type SpotPoint = {
  timestamp: string;
  price_czk_kwh: number;
  price_eur_kwh: number | null;
};

type SpotStats = {
  average_czk_kwh: number;
  average_eur_kwh: number | null;
  min_czk_kwh: number;
  max_czk_kwh: number;
  min_at: string | null;
  max_at: string | null;
};

type SpotApiResponse = {
  points: SpotPoint[];
  stats: SpotStats | null;
  unit: string;
  message?: string;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SpotPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolved?.range),
    source: normalizeSource(resolved?.source),
    interval: normalizeInterval(resolved?.interval),
  };

  const headerList = await headers();
  const cookieHeader = headerList.get("cookie") ?? undefined;
  const payload = await fetchSpot(filters.range, filters.interval, cookieHeader);
  const chartData = payload.points.map((point) => ({
    timestamp: point.timestamp,
    price: point.price_czk_kwh ?? 0,
  }));
  const statCards = buildStatsCards(payload.stats);
  const extremes = formatExtremes(payload.stats);

  return (
    <DashboardLayout title="Vizualizace SPOT" description="Historie spotových cen a statistiky." filters={filters}>
      <SpotChart data={chartData} unit={payload.unit ?? "CZK/kWh"} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>

      <div className="space-y-2">
        {extremes ? <p className="text-sm text-slate-600">{extremes}</p> : null}
        {payload.message ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{payload.message}</p>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function buildStatsCards(stats: SpotStats | null): Array<{ label: string; value: number; unit?: string }> {
  if (!stats) return [];
  return [
    { label: "Průměrná cena", value: stats.average_czk_kwh, unit: "Kč/kWh" },
    { label: "Nejnižší cena", value: stats.min_czk_kwh, unit: "Kč/kWh" },
    { label: "Nejvyšší cena", value: stats.max_czk_kwh, unit: "Kč/kWh" },
  ];
}

function formatExtremes(stats: SpotStats | null) {
  if (!stats) return null;
  const parts = [];
  if (stats.min_at) {
    parts.push(`Minimum ${stats.min_czk_kwh.toFixed(3)} Kč/kWh v ${formatDateTime(stats.min_at)}`);
  }
  if (stats.max_at) {
    parts.push(`Maximum ${stats.max_czk_kwh.toFixed(3)} Kč/kWh v ${formatDateTime(stats.max_at)}`);
  }
  return parts.join(" • ");
}

async function fetchSpot(
  range: DashboardFilterState["range"],
  interval: DashboardFilterState["interval"],
  cookieHeader?: string,
): Promise<SpotApiResponse> {
  try {
    const url = new URL("/api/spot/history", getBaseUrl());
    url.searchParams.set("range", range);
    url.searchParams.set("interval", interval);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });
    if (!res.ok) {
      return { points: [], stats: null, unit: "CZK/kWh", message: "API vrátilo chybu." };
    }
    const json = (await res.json()) as SpotApiResponse;
    return {
      points: json.points ?? [],
      stats: json.stats ?? null,
      unit: json.unit ?? "CZK/kWh",
      message: json.message,
    };
  } catch (error) {
    console.error("fetchSpot selhalo", error);
    return { points: [], stats: null, unit: "CZK/kWh", message: "Nepodařilo se načíst spotové ceny." };
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
