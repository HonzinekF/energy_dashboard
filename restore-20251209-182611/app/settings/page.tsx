import { DashboardLayout } from "@/components/DashboardLayout";
import { SectionTitle } from "@/components/SectionTitle";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { normalizeInterval, normalizeRange, normalizeSource } from "@/lib/dashboardFilters";

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

  return (
    <DashboardLayout filters={filters}>
      <SectionTitle title="Nastavení systému" subtitle="FVE, baterie, tarif, integrace (mock formy)" />

      <form className="space-y-6">
        <Section blockTitle="Parametry FVE" description="Instalovaný výkon, orientace, sklon.">
          <Input label="Instalovaný výkon (kWp)" name="fve_power" placeholder="8" />
          <Input label="Orientace" name="orientation" placeholder="jih" />
          <Input label="Sklon (°)" name="tilt" placeholder="35" />
        </Section>

        <Section blockTitle="Baterie" description="Základní parametry baterie.">
          <Input label="Baterie existuje?" name="battery_exists" placeholder="ano/ne" />
          <Input label="Kapacita (kWh)" name="battery_capacity" placeholder="10" />
          <Input label="Účinnost (%)" name="battery_efficiency" placeholder="90" />
          <Input label="Max. počet cyklů" name="battery_cycles" placeholder="6000" />
        </Section>

        <Section blockTitle="Tarif" description="Fixní cena / NT/VT / spotový.">
          <Select label="Typ tarifu" name="tariff_type" options={["Fixní", "Dvojtarif NT/VT", "Spotový"]} />
          <Input label="Cena (Kč/kWh)" name="tariff_price" placeholder="6.5" />
          <Input label="Cena NT (Kč/kWh)" name="tariff_nt" placeholder="4.0" />
          <Input label="Cena VT (Kč/kWh)" name="tariff_vt" placeholder="7.5" />
        </Section>

        <Section blockTitle="Integrace" description="API klíče, URL backendu, případně střídače.">
          <Input label="Backend URL" name="backend_url" placeholder="http://localhost:8787" />
          <Input label="API klíč Solax/Fronius" name="inverter_api_key" placeholder="..." />
          <Input label="Spotové ceny API" name="spot_api" placeholder="https://..." />
        </Section>

        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Uložit (mock)
        </button>
      </form>
    </DashboardLayout>
  );
}

function Section({ blockTitle, description, children }: { blockTitle: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">{blockTitle}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

function Input({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span>{label}</span>
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
      />
    </label>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span>{label}</span>
      <select
        name={name}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
