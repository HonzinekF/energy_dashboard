"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { SpotHistoryPoint } from "@/lib/spotPriceHistory";

export function SpotHistoryChart({ history }: { history: SpotHistoryPoint[] }) {
  if (!history.length) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-h-[200px] flex items-center justify-center text-sm text-slate-500">
        Spotová historie zatím není k dispozici.
      </section>
    );
  }

  const data = sampleHistory(history, 20);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-700">Spotové ceny – historie</p>
        <p className="text-xs text-slate-500">Posledních {history.length} dní (min/průměr/max v Kč/kWh).</p>
      </header>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 0 }}>
            <defs>
              <linearGradient id="avg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatHistoryAxis} minTickGap={32} />
            <YAxis tickFormatter={(value) => value.toFixed(2)} unit=" Kč" width={60} />
            <Tooltip
              formatter={(value: number) => `${value.toFixed(3)} Kč/kWh`}
              labelFormatter={(value) => new Date(`${value}T00:00:00Z`).toLocaleDateString("cs-CZ")}
            />
            <Area type="monotone" dataKey="average" name="Průměr" stroke="#0ea5e9" fill="url(#avg)" />
            <Area type="monotone" dataKey="min" name="Min" stroke="#22c55e" fillOpacity={0} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="max" name="Max" stroke="#f97316" fillOpacity={0} strokeDasharray="4 4" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function sampleHistory(history: SpotHistoryPoint[], maxPoints: number) {
  if (history.length <= maxPoints) {
    return history;
  }
  const bucketSize = Math.ceil(history.length / maxPoints);
  const buckets: SpotHistoryPoint[] = [];
  for (let i = 0; i < history.length; i += bucketSize) {
    const slice = history.slice(i, i + bucketSize);
    const min = slice.reduce((prev, curr) => Math.min(prev, curr.min), slice[0].min);
    const max = slice.reduce((prev, curr) => Math.max(prev, curr.max), slice[0].max);
    const average = slice.reduce((sum, curr) => sum + curr.average, 0) / slice.length;
    buckets.push({
      date: slice[Math.floor(slice.length / 2)].date,
      min,
      max,
      average,
    });
  }
  return buckets;
}

function formatHistoryAxis(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
