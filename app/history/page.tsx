import { ChartCard } from "@/components/ChartCard";
import { SectionTitle } from "@/components/SectionTitle";

const mockRows = [
  { date: "2025-11-20", production: 24.5, consumption: 18.2, self: 62.1, savings: 185.0 },
  { date: "2025-11-19", production: 22.1, consumption: 19.4, self: 57.8, savings: 172.4 },
  { date: "2025-11-18", production: 20.3, consumption: 21.0, self: 51.3, savings: 150.2 },
];

export default function HistoryPage() {
  const csv = buildCsv(mockRows);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle title="Historie výroby a spotřeby" subtitle="Mock data, pouze layout." />
        <div className="flex gap-2">
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800" type="button">
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Období
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option>Den</option>
            <option>Týden</option>
            <option>Month</option>
            <option>Rok</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Datum
          <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Zobrazit
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option>Energie</option>
            <option>Výkon</option>
          </select>
        </label>
      </div>

      <ChartCard title="Graf 1" description="Mock line/bar chart">
        <div className="flex h-64 items-center justify-center text-slate-500">Graf placeholder</div>
      </ChartCard>
      <ChartCard title="Graf 2" description="Import vs. export">
        <div className="flex h-64 items-center justify-center text-slate-500">Graf placeholder</div>
      </ChartCard>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <table className="w-full min-w-[720px] text-sm text-slate-700">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Datum</th>
              <th className="py-2">Výroba (kWh)</th>
              <th className="py-2">Spotřeba (kWh)</th>
              <th className="py-2">Soběstačnost</th>
              <th className="py-2">Úspora (Kč)</th>
            </tr>
          </thead>
          <tbody>
            {mockRows.map((row) => (
              <tr key={row.date} className="border-t border-slate-100">
                <td className="py-2">{row.date}</td>
                <td className="py-2">{row.production.toFixed(1)}</td>
                <td className="py-2">{row.consumption.toFixed(1)}</td>
                <td className="py-2">{row.self.toFixed(1)} %</td>
                <td className="py-2">{row.savings.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
        download="history_mock.csv"
        className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Stáhnout CSV (mock)
      </a>
    </div>
  );
}

function buildCsv(rows: typeof mockRows) {
  const header = "date,production_kwh,consumption_kwh,self_percent,savings_kc";
  const body = rows
    .map((r) => [r.date, r.production, r.consumption, r.self, r.savings].join(","))
    .join("\n");
  return [header, body].join("\n");
}
