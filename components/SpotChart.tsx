"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateTime, formatShortDate } from "@/lib/format";

type SpotPoint = {
  timestamp: string;
  price: number;
};

export function SpotChart({ data, unit }: { data: SpotPoint[]; unit: string }) {
  const chartData = sanitizeData(data);

  if (!chartData.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-700">Spotové ceny</p>
        <p className="text-sm text-slate-500">Pro vybrané období nejsou k dispozici žádné záznamy.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
      <header className="flex flex-col gap-1 pb-2">
        <p className="text-sm font-medium text-slate-800">Spotové ceny</p>
        <p className="text-xs text-slate-500">Časové rozlišení dle vybraného intervalu.</p>
      </header>
      <div className="h-[26rem] min-h-[18rem]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: 8, right: 8, bottom: 16 }}>
            <defs>
              <linearGradient id="spot-price" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              allowDuplicatedCategory={false}
              tickFormatter={(value) => formatShortDate(new Date(value as number).toISOString())}
              minTickGap={32}
              stroke="#94a3b8"
            />
            <YAxis
              tickFormatter={(value) => value.toFixed(2)}
              width={80}
              stroke="#94a3b8"
              label={{ value: unit, angle: -90, position: "insideLeft", fill: "#94a3b8", offset: 10 }}
            />
            <Tooltip content={<SpotTooltip unit={unit} />} />
            <Area
              type="monotone"
              dataKey="price"
              name={`Cena (${unit})`}
              stroke="#0ea5e9"
              fill="url(#spot-price)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function sanitizeData(points: SpotPoint[]) {
  const now = Date.now();
  const maxFuture = now + 1000 * 60 * 60 * 24 * 365;
  const maxPast = now - 1000 * 60 * 60 * 24 * 365 * 5;
  return points
    .map((point) => {
      const ts = Date.parse(point.timestamp);
      if (!Number.isFinite(ts)) return null;
      if (ts > maxFuture || ts < maxPast) return null;
      const price = typeof point.price === "number" && Number.isFinite(point.price) ? point.price : null;
      if (price === null) return null;
      return { ...point, ts };
    })
    .filter(Boolean)
    .sort((a, b) => (a as { ts: number }).ts - (b as { ts: number }).ts) as Array<SpotPoint & { ts: number }>;
}

function SpotTooltip({ unit, active, payload, label }: { unit: string; active?: boolean; payload?: any[]; label?: number | string }) {
  if (!active || !payload?.length) return null;
  const ts =
    typeof label === "number"
      ? new Date(label).toISOString()
      : typeof label === "string"
        ? label
        : null;
  const value = payload[0]?.value as number | undefined;
  if (value === undefined) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-md">
      <p className="text-xs font-medium text-slate-500">{ts ? formatDateTime(ts) : label ?? ""}</p>
      <p className="text-base font-semibold text-slate-900">
        {value.toFixed(3)} <span className="text-sm font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );
}
