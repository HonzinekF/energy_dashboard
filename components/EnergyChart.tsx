"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  type TooltipProps,
} from "recharts";
import { formatDateTime, formatEnergy, formatShortDate } from "@/lib/format";

interface Point {
  datetime: string;
  production: number;
  export: number;
  import: number;
  batteryCharge?: number;
  batteryDischarge?: number;
  tigoProduction?: number;
}

const SERIES = [
  {
    key: "production",
    label: "Výroba",
    stroke: "#10b981",
    gradientFrom: "#10b981",
    gradientTo: "#10b98110",
  },
  {
    key: "export",
    label: "Prodej",
    stroke: "#2563eb",
    gradientFrom: "#2563eb",
    gradientTo: "#bfdbfe40",
  },
  {
    key: "import",
    label: "Dokup",
    stroke: "#f97316",
    gradientFrom: "#f97316",
    gradientTo: "#fed7aa40",
  },
  {
    key: "tigoProduction",
    label: "Výroba Tigo",
    stroke: "#0ea5e9",
    gradientFrom: "#0ea5e9",
    gradientTo: "#0ea5e910",
  },
  {
    key: "batteryDischarge",
    label: "Vybíjení baterie",
    stroke: "#7c3aed",
    gradientFrom: "#7c3aed",
    gradientTo: "#c4b5fd40",
  },
  {
    key: "batteryCharge",
    label: "Nabíjení baterie",
    stroke: "#a855f7",
    gradientFrom: "#a855f7",
    gradientTo: "#f3e8ff40",
  },
] as const satisfies Array<{
  key: keyof Point;
  label: string;
  stroke: string;
  gradientFrom: string;
  gradientTo: string;
}>;

type SeriesKey = (typeof SERIES)[number]["key"];

export function EnergyChart({ data }: { data: Point[] }) {
  const chartId = useId();
  const [visibleSeries, setVisibleSeries] = useState<SeriesKey[]>(() => SERIES.map((series) => series.key));
  const cleanedData = useMemo(() => sanitizeData(data), [data]);
  const chartData = useMemo(() => cleanedData.map((point) => ({ ...point, ts: Date.parse(point.datetime) })), [cleanedData]);
  const seriesMap = useMemo(
    () => SERIES.reduce<Record<string, (typeof SERIES)[number]>>((acc, series) => ({ ...acc, [series.key]: series }), {}),
    [],
  );

  function toggleSeries(key: SeriesKey) {
    setVisibleSeries((current) => {
      if (current.length === 1 && current.includes(key)) {
        return current;
      }
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  }

  const activeSeries = SERIES.filter((series) => visibleSeries.includes(series.key));

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    }
    if (fullscreen) {
      window.addEventListener("keydown", handleKey);
    }
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [fullscreen]);

  if (!chartData.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 w-full">
        <header className="flex flex-col gap-2 pb-2">
          <p className="text-sm font-medium text-slate-700">Energetický tok</p>
          <p className="text-sm text-slate-500">Žádná data pro zvolené filtry.</p>
        </header>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 w-full">
        <header className="flex flex-col gap-3 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Energetický tok</p>
            <p className="text-sm text-slate-500">
              Porovnání výroby, prodeje a dokupu za zvolené období s možností filtrování.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SERIES.map((series) => {
              const isActive = visibleSeries.includes(series.key);
              return (
                <button
                  key={series.key}
                  type="button"
                  onClick={() => toggleSeries(series.key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                    isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                  aria-pressed={isActive}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: series.stroke }} />
                  {series.label}
                </button>
              );
            })}
          </div>
        </header>
        <div className="h-[28rem] min-h-[22rem] w-full" style={{ minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 16, right: 16, bottom: 16 }}>
              <defs>
                {SERIES.map((series) => (
                  <linearGradient key={series.key} id={`${chartId}-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={series.gradientFrom} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={series.gradientTo} stopOpacity={0.1} />
                  </linearGradient>
                ))}
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
                tickFormatter={(value) => value.toLocaleString("cs-CZ")}
                width={70}
                stroke="#94a3b8"
                label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "#94a3b8", offset: 10 }}
              />
              <Tooltip content={(props) => <CustomTooltip {...props} seriesMap={seriesMap} />} />
              {activeSeries.map((series) => (
                <Area
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.stroke}
                  fill={`url(#${chartId}-${series.key})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
              <Brush
                dataKey="ts"
                travellerWidth={12}
                height={32}
                stroke="#94a3b8"
                fill="#f8fafc"
                className="[&_.recharts-brush]:rounded-xl"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

    </>
  );
}

type CustomTooltipProps = TooltipProps<number, string> & {
  seriesMap: Record<string, (typeof SERIES)[number]>;
};

function CustomTooltip({ active, label, payload, seriesMap }: CustomTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const labelIso =
    typeof label === "number"
      ? new Date(label).toISOString()
      : typeof label === "string"
        ? label
        : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-md">
      <p className="text-xs font-medium text-slate-500">
        {labelIso ? formatDateTime(labelIso) : label ?? ""}
      </p>
      <ul className="mt-2 space-y-1">
        {payload.map((entry) => {
          if (!entry.dataKey || entry.value === undefined || entry.value === null) {
            return null;
          }
          const meta = seriesMap[entry.dataKey as string];
          if (!meta) {
            return null;
          }
          return (
            <li key={entry.dataKey as string} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 text-slate-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.stroke }} />
                {meta.label}
              </span>
              <span className="font-semibold text-slate-900">{typeof entry.value === "number" ? formatEnergy(entry.value) : entry.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function sanitizeData(data: Point[]) {
  const now = Date.now();
  const maxFuture = now + 1000 * 60 * 60 * 24 * 365; // 1 rok dopředu
  const maxPast = now - 1000 * 60 * 60 * 24 * 365 * 10; // 10 let zpět

  // deduplikace podle timestampu (ponecháme poslední výskyt)
  const map = new Map<number, Point>();
  data.forEach((point) => {
    const ts = Date.parse(point.datetime);
    if (!Number.isFinite(ts)) return;
    if (ts > maxFuture || ts < maxPast) return;
    const base = [point.production, point.export, point.import];
    const extra = [point.tigoProduction, point.batteryCharge, point.batteryDischarge].filter(
      (v) => v !== undefined && v !== null,
    );
    if (!base.every((v) => typeof v === "number" && Number.isFinite(v))) return;
    if (!extra.every((v) => typeof v === "number" && Number.isFinite(v))) return;
    map.set(ts, { ...point, datetime: new Date(ts).toISOString() });
  });

  const sanitized = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);

  const MAX_POINTS = 600;
  if (sanitized.length <= MAX_POINTS) {
    return sanitized;
  }
  const step = Math.ceil(sanitized.length / MAX_POINTS);
  const downsampled = sanitized.filter((_, idx) => idx % step === 0 || idx === sanitized.length - 1);
  return downsampled;
}
