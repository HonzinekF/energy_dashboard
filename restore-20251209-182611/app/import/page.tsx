import { DashboardLayout } from "@/components/DashboardLayout";
import { MeasurementsImportForm } from "@/components/MeasurementsImportForm";
import { normalizeInterval, normalizeRange, normalizeSource, type DashboardFilterState } from "@/lib/dashboardFilters";

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

  return (
    <DashboardLayout
      title="Import dat"
      description="CSV/XLSX import do tabulky measurements s kontrolou hlaviček."
      filters={filters}
      showFilters={false}
    >
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Postup</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Vyberte soubor CSV nebo XLSX z exportu (Datetime_15min, Výroba FVE, Odběr + Dokup elektřiny z ČEZ).</li>
          <li>Soubor je ověřen na požadované sloupce; chyby se zobrazí jako čitelné hlášky.</li>
          <li>Import používá INSERT OR REPLACE – stejné timestampy se přepíší.</li>
        </ul>
      </div>

      <MeasurementsImportForm />
    </DashboardLayout>
  );
}
