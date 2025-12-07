import { DashboardLayout } from "@/components/DashboardLayout";
import { ImportPreview } from "@/components/ImportPreview";
import { DashboardStatus } from "@/components/DashboardStatus";
import { DashboardFilterState, normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";
import { loadDashboardData } from "@/lib/pythonClient";
import Link from "next/link";

type ImportPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const filters: DashboardFilterState = {
    range: normalizeRange(resolved?.range),
    source: normalizeSource(resolved?.source),
    interval: normalizeInterval(resolved?.interval),
  };
  const data = await loadDashboardData(filters);

  return (
    <DashboardLayout filters={filters}>
      <div className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Import dat</h1>
          <p className="text-sm text-slate-600">Nahrajte CSV/XLS, ověřte hlavičky a importujte do systému.</p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Zpět na dashboard
        </Link>
      </div>

      <DashboardStatus
        dashboardSource={data.sourceUsed}
        dashboardUpdatedAt={data.refreshedAt}
        spotPayload={null}
      />

      <ImportPreview />
    </DashboardLayout>
  );
}
