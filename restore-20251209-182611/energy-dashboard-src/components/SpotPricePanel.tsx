import type { SpotPricePayload } from "@/lib/spotPriceClient";
import { SpotPriceRefreshButton } from "./SpotPriceRefreshButton";

export function SpotPricePanel({ payload }: { payload: SpotPricePayload | null }) {
  if (!payload) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
        <p className="text-sm font-semibold">Nepodařilo se načíst spotové ceny.</p>
        <p className="text-sm">Zkontrolujte prosím připojení k internetu nebo dostupnost externí služby.</p>
      </div>
    );
  }

  const hourly = payload.hourly.slice(0, 24);
  if (!hourly.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-700">Spotové ceny</p>
        <p className="text-sm text-slate-500">Žádná data nejsou k dispozici.</p>
      </div>
    );
  }
  const timestampReference =
    payload.updatedAt ?? payload.hourly[0]?.from ?? new Date().toISOString();
  const now = Date.parse(timestampReference);
  const current = hourly.find((point) => {
    const from = new Date(point.from).getTime();
    const to = new Date(point.to).getTime();
    return now >= from && now < to;
  });
  const min = hourly.reduce((prev, currentPoint) => (currentPoint.priceCZK < prev.priceCZK ? currentPoint : prev), hourly[0]);
  const max = hourly.reduce((prev, currentPoint) => (currentPoint.priceCZK > prev.priceCZK ? currentPoint : prev), hourly[0]);
  const average = hourly.reduce((sum, point) => sum + point.priceCZK, 0) / hourly.length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Spotové ceny (Day-Ahead)</p>
          <p className="text-xs text-slate-500">
            Zdroj: {payload.source} • Aktualizováno: {payload.updatedAt ? new Date(payload.updatedAt).toLocaleString("cs-CZ") : "neznámé"}
          </p>
        </div>
        <SpotPriceRefreshButton />
        {current && (
          <div className="text-right">
            <p className="text-xs text-slate-500">Aktuální hodina</p>
            <p className="text-xl font-semibold">
              {current.priceCZK.toFixed(3)} Kč/kWh <span className="text-sm text-slate-500">({current.priceEUR.toFixed(3)} €)</span>
            </p>
          </div>
        )}
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <StatCard title="Průměr dne" value={`${average.toFixed(3)} Kč/kWh`} subValue={`${(average / 25).toFixed(3)} €`} />
        <StatCard
          title="Nejnižší cena"
          value={`${min.priceCZK.toFixed(3)} Kč/kWh`}
          subValue={formatTimeRange(min.from, min.to)}
        />
        <StatCard
          title="Nejvyšší cena"
          value={`${max.priceCZK.toFixed(3)} Kč/kWh`}
          subValue={formatTimeRange(max.from, max.to)}
        />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Čas</th>
              <th className="py-2">Cena (Kč/kWh)</th>
              <th className="py-2">Cena (€ /kWh)</th>
            </tr>
          </thead>
          <tbody>
            {hourly.slice(0, 12).map((point) => (
              <tr key={point.from} className="border-t border-slate-100">
                <td className="py-2 text-slate-600">{formatTimeRange(point.from, point.to)}</td>
                <td className="py-2 font-semibold text-slate-900">{point.priceCZK.toFixed(3)}</td>
                <td className="py-2 text-slate-600">{point.priceEUR.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatCard({ title, value, subValue }: { title: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
    </div>
  );
}

function formatTimeRange(from: string, to: string) {
  const locale = "cs-CZ";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const fromTime = fromDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const toTime = toDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${fromTime}–${toTime}`;
}
