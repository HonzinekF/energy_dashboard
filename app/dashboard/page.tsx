import { ChartCard } from "@/components/ChartCard";
import { SectionTitle } from "@/components/SectionTitle";
import { MetricCard } from "@/components/MetricCard";

export default function DashboardPlaceholder() {
  const kpis = [
    { label: "Aktuální výroba", value: 4.2, unit: "kW" },
    { label: "Aktuální spotřeba", value: 3.1, unit: "kW" },
    { label: "Stav baterie", value: 62, unit: "%" },
    { label: "Dnešní úspora", value: 185, unit: "Kč" },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title="Přehled systému" subtitle="Mock data: výroba, spotřeba, baterie, úspory." />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>

      <ChartCard title="Denní průběh" description="Výroba vs. spotřeba (mock graf)">
        <div className="flex h-64 items-center justify-center text-slate-500">Graf placeholder</div>
      </ChartCard>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Vlastní spotřeba vs. síť" description="Donut placeholder">
          <div className="flex h-56 items-center justify-center text-slate-500">Donut placeholder</div>
        </ChartCard>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Doporučení dnes</p>
          <p className="text-sm text-slate-600">
            Mock: Mezi 13–15 hod bude přebytek – vhodné prát / ohřívat vodu. Přesuňte spotřebu do odpoledních hodin.
          </p>
        </div>
      </div>
    </div>
  );
}
