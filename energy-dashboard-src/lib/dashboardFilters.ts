const RANGE_OPTIONS = [
  { value: "24h", label: "Posledních 24 h" },
  { value: "7d", label: "Posledních 7 dní" },
  { value: "30d", label: "Posledních 30 dní" },
  { value: "90d", label: "Posledních 90 dní" },
  { value: "thisYear", label: "Tento rok" },
  { value: "lastYear", label: "Minulý rok" },
] as const;

const SOURCE_OPTIONS = [
  { value: "live", label: "Live data" },
  { value: "python", label: "Python backend" },
  { value: "excel", label: "Excel import" },
] as const;

const INTERVAL_OPTIONS = [
  { value: "15m", label: "15 minut" },
  { value: "1h", label: "Hodiny" },
  { value: "1d", label: "Dny" },
] as const;

export type DashboardRange = (typeof RANGE_OPTIONS)[number]["value"];
export type DashboardSource = (typeof SOURCE_OPTIONS)[number]["value"];
export type DashboardInterval = (typeof INTERVAL_OPTIONS)[number]["value"];

export type DashboardFilterState = {
  range: DashboardRange;
  source: DashboardSource;
  interval: DashboardInterval;
};

export const DEFAULT_FILTERS: DashboardFilterState = {
  range: "24h",
  source: "live",
  interval: "1h",
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
  return SOURCE_OPTIONS.some((option) => option.value === maybeValue)
    ? (maybeValue as DashboardSource)
    : DEFAULT_FILTERS.source;
}

export function normalizeInterval(value: string | string[] | undefined): DashboardInterval {
  if (!value) {
    return DEFAULT_FILTERS.interval;
  }
  const maybeValue = Array.isArray(value) ? value[0] : value;
  return INTERVAL_OPTIONS.some((option) => option.value === maybeValue)
    ? (maybeValue as DashboardInterval)
    : DEFAULT_FILTERS.interval;
}
