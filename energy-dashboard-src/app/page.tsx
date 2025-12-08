import { DashboardLayout } from "@/components/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import { EnergyChart } from "@/components/EnergyChart";
import { UploadForm } from "@/components/UploadForm";
import { ImportHistory } from "@/components/ImportHistory";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";
import { listImportJobs } from "@/lib/importQueue";
import { fetchSpotPrices } from "@/lib/spotPriceClient";
import { SpotPricePanel } from "@/components/SpotPricePanel";
import { fetchSpotPricesHistory } from "@/lib/spotPriceHistory";
import { SpotHistoryChart } from "@/components/SpotHistoryChart";
import { loadDashboardData } from "@/lib/pythonClient";
import { DashboardStatus } from "@/components/DashboardStatus";
import { loadEnergyTotals, loadEnergySeries } from "@/lib/dashboardMetrics";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolvedSearchParams?.range),
    source: normalizeSource(resolvedSearchParams?.source),
    interval: normalizeInterval(resolvedSearchParams?.interval),
  };

  const spotHistoryLimit = determineSpotHistoryLimit(filters.range);

  const [data, spotPrices, spotHistory, importJobs, energyTotals, energySeries] = await Promise.all([
    loadDashboardData(filters),
    fetchSpotPrices(),
    fetchSpotPricesHistory(spotHistoryLimit, filters.range),
    listImportJobs(5),
    loadEnergyTotals(filters),
    loadEnergySeries(filters),
  ]);
  const spotUpdatedAt = spotPrices?.updatedAt ?? spotPrices?.hourly?.[0]?.from;
  const summary = buildSummaryCards(data.summary, energyTotals);
  const mergedHistory = mergeHistory(data.history, energySeries, spotHistory);
  return (
    <DashboardLayout filters={filters}>
      <DashboardStatus
        dashboardSource={data.sourceUsed}
        dashboardUpdatedAt={data.refreshedAt}
        spotPayload={spotPrices}
        spotUpdatedAt={spotUpdatedAt}
      />
      <section className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
        {summary.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
        </div>
      </section>

      <EnergyChart data={mergedHistory} />

      <SpotPricePanel payload={spotPrices} />

      <SpotHistoryChart history={spotHistory} />

      <section className="grid gap-6 md:grid-cols-2">
        <UploadForm />
        <ImportHistory jobs={importJobs} />
      </section>
    </DashboardLayout>
  );
}

function determineSpotHistoryLimit(range: DashboardFilterState["range"]) {
  if (range === "24h") {
    return 7;
  }
  if (range === "7d") {
    return 14;
  }
  if (range === "30d") {
    return 60;
  }
  if (range === "90d") {
    return 120;
  }
  if (range === "thisYear" || range === "lastYear") {
    return 400;
  }
  return 60;
}

function buildSummaryCards(
  base: { label: string; value: number; unit?: string }[],
  totals?: ReturnType<typeof loadEnergyTotals>,
) {
  const normalize = (value: string) => value.toLowerCase().trim();
  const map = new Map<string, { label: string; value: number; unit?: string }>();
  base.forEach((item) => {
    const key = normalize(item.label);
    map.set(key, item);
  });

  // Rename základní výroby z backendu
  const solaxBase = map.get("výroba fve") ?? map.get("výroba");
  if (solaxBase) {
    map.set("výroba solax", { ...solaxBase, label: "Výroba SolaX" });
    map.delete("výroba fve");
    map.delete("výroba");
  }

  if (totals?.batteryDischarge) {
    map.set("vybíjení baterie", {
      label: "Vybíjení baterie",
      value: totals.batteryDischarge,
      unit: "kWh",
    });
  }
  if (totals?.batteryCharge) {
    map.set("nabíjení baterie", {
      label: "Nabíjení baterie",
      value: totals.batteryCharge,
      unit: "kWh",
    });
  }
  if (totals?.tigoProduction) {
    map.set("výroba tigo", { label: "Výroba Tigo", value: totals.tigoProduction, unit: "kWh" });
  }

  const order = [
    "výroba tigo",
    "výroba solax",
    "vybíjení baterie",
    "nabíjení baterie",
    "prodej do čez",
    "dokup z distribuce",
    "odhadovaná úspora",
  ];

  const ordered = order
    .map((key) => map.get(key))
    .filter(Boolean) as { label: string; value: number; unit?: string }[];

  // Append any remaining metrics not listed explicitly
  const usedKeys = new Set(order);
  base.forEach((item) => {
    const key = normalize(item.label);
    if (!usedKeys.has(key) && !ordered.find((entry) => normalize(entry.label) === key)) {
      ordered.push(item);
    }
  });

  return ordered;
}

type HistoryPoint = {
  datetime: string;
  production: number;
  export: number;
  import: number;
  batteryCharge?: number;
  batteryDischarge?: number;
  tigoProduction?: number;
  spotPriceCzk?: number;
};

function mergeHistory(
  history: { datetime: string; production: number; export: number; import: number }[],
  series: ReturnType<typeof loadEnergySeries>,
  spotHistory: ReturnType<typeof fetchSpotPricesHistory>,
): HistoryPoint[] {
  const spotMap = new Map<string, number>();
  spotHistory?.forEach((point) => {
    spotMap.set(point.date, point.average);
  });

  if (!series?.length) {
    return history.map((item) => ({ ...item, spotPriceCzk: spotMap.get(item.datetime.slice(0, 10)) }));
  }
  const map = new Map<string, HistoryPoint>();
  history.forEach((item) => map.set(item.datetime, { ...item, spotPriceCzk: spotMap.get(item.datetime.slice(0, 10)) }));
  series.forEach((item) => {
    const current = map.get(item.datetime) ?? {
      datetime: item.datetime,
      production: 0,
      export: 0,
      import: 0,
    };
    map.set(item.datetime, { ...current, ...item, spotPriceCzk: current.spotPriceCzk ?? spotMap.get(item.datetime.slice(0, 10)) });
  });
  return Array.from(map.values()).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
}
