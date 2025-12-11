const RANGE_OPTIONS = [
  { value: "24h", label: "Posledních 24 h" },
  { value: "7d", label: "Posledních 7 dnů" },
  { value: "30d", label: "Posledních 30 dnů" },
  { value: "90d", label: "Posledních 90 dnů" },
  { value: "thisYear", label: "Tento rok" },
  { value: "lastYear", label: "Minulý rok" },
  { value: "custom", label: "Vlastní období" },
] as const;

const SOURCE_OPTIONS = [
  { value: "db", label: "Lokální DB" },
  { value: "import", label: "CSV / XLS import", disabled: true },
] as const;

const INTERVAL_OPTIONS = [
  { value: "15m", label: "15 min" },
  { value: "1h", label: "Hodiny" },
  { value: "1d", label: "Dny" },
] as const;

export type DashboardRange = (typeof RANGE_OPTIONS)[number]["value"];
export type DashboardSource = "db" | "import" | "live" | "python" | "excel";
export type DashboardInterval = (typeof INTERVAL_OPTIONS)[number]["value"];

export type DashboardFilterState = {
  range: DashboardRange;
  source: DashboardSource;
  interval: DashboardInterval;
  from?: string | null;
  to?: string | null;
};

export const DEFAULT_FILTERS: DashboardFilterState = {
  range: "24h",
  source: "db",
  interval: "1h",
  from: null,
  to: null,
};

export function availableRanges() {
  return RANGE_OPTIONS;
}

export function availableSources() {
  return SOURCE_OPTIONS;
}

export function availableIntervals() {
  return INTERVAL_OPTIONS;
}

export function normalizeRange(value: string | string[] | undefined): DashboardRange {
  if (!value) {
    return DEFAULT_FILTERS.range;
  }
  const maybeValue = Array.isArray(value) ? value[0] : value;
  return RANGE_OPTIONS.some((option) => option.value === maybeValue) ? (maybeValue as DashboardRange) : DEFAULT_FILTERS.range;
}

export function normalizeSource(value: string | string[] | undefined): DashboardSource {
  if (!value) {
    return DEFAULT_FILTERS.source;
  }
  const maybeValue = Array.isArray(value) ? value[0] : value;
  return SOURCE_OPTIONS.some((option) => option.value === maybeValue) ? (maybeValue as DashboardSource) : DEFAULT_FILTERS.source;
}

export function normalizeInterval(value: string | string[] | undefined): DashboardInterval {
  if (!value) {
    return DEFAULT_FILTERS.interval;
  }
  const maybeValue = Array.isArray(value) ? value[0] : value;
  return INTERVAL_OPTIONS.some((option) => option.value === maybeValue) ? (maybeValue as DashboardInterval) : DEFAULT_FILTERS.interval;
}

export function normalizeDate(value: string | string[] | undefined) {
  if (!value) return null;
  const maybe = Array.isArray(value) ? value[0] : value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(maybe)) {
    return maybe;
  }
  return null;
}

export function resolveRangeBounds(range: DashboardRange, from?: string | null, to?: string | null): { from: string; to: string } {
  if (range === "custom" && from && to) {
    return {
      from: `${from}T00:00:00`,
      to: `${to}T23:59:59`,
    };
  }

  const now = new Date();
  const toIso = now.toISOString();

  if (range === "24h") {
    return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to: toIso };
  }
  if (range === "7d") {
    return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), to: toIso };
  }
  if (range === "30d") {
    return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), to: toIso };
  }
  if (range === "90d") {
    return { from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(), to: toIso };
  }
  if (range === "thisYear") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start.toISOString(), to: toIso };
  }
  if (range === "lastYear") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear(), 0, 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  // Fallback default
  return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), to: toIso };
}

export function intervalToBucketFormat(interval: DashboardInterval) {
  if (interval === "15m") return "%Y-%m-%dT%H:%M:00";
  if (interval === "1d") return "%Y-%m-%dT00:00:00";
  return "%Y-%m-%dT%H:00:00";
}
