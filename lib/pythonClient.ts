import { execFile } from "child_process";
import { promisify } from "util";
import {
  DEFAULT_FILTERS,
  type DashboardFilterState,
} from "./dashboardFilters";
import { fetchSolaxRealtime } from "./solaxClient";
import { loadDashboardHistoryFromDb } from "./dashboardMetrics";

const execFileAsync = promisify(execFile);

type SummaryItem = {
  label: string;
  value: number;
  unit?: string;
};

type HistoryPoint = {
  datetime: string;
  production: number;
  export: number;
  import: number;
};

type DashboardPayload = {
  summary: SummaryItem[];
  history: HistoryPoint[];
  refreshedAt?: string;
};

export type DashboardData = DashboardPayload & {
  sourceUsed:
    | "solax-live"
    | "python-backend"
    | "python-script"
    | "db"
    | "solax"
    | "demo";
};

type DashboardResponse = DashboardPayload;

const HTTP_ENDPOINT = process.env.PY_BACKEND_URL;
const HTTP_TIMEOUT = Number(process.env.PY_BACKEND_TIMEOUT ?? 30_000);

let backendFailureNotified = false;

export async function loadDashboardData(
  filters: DashboardFilterState = DEFAULT_FILTERS,
): Promise<DashboardData> {
  const effectiveFilters: DashboardFilterState = {
    ...DEFAULT_FILTERS,
    ...filters,
  };

  // 1) Explicitní režim "db" – jen lokální databáze
  if (effectiveFilters.source === "db") {
    const dbPayload = loadDashboardHistoryFromDb(effectiveFilters);
    if (dbPayload) {
      return sortHistory(dbPayload);
    }

    // Pokud není v DB nic, vrať prázdná data se zdrojem "db"
    return {
      summary: [],
      history: [],
      refreshedAt: new Date().toISOString(),
      sourceUsed: "db",
    };
  }

  // 2) Režim "solax" – nejdřív DB v SolaX režimu, pak live SolaX
  if (effectiveFilters.source === "solax") {
    const dbPayload = loadDashboardHistoryFromDb(effectiveFilters);
    if (dbPayload) {
      return sortHistory({ ...dbPayload, sourceUsed: "solax" });
    }

    const solaxLive = await loadFromSolax(effectiveFilters);
    if (solaxLive) {
      return sortHistory({ ...solaxLive, sourceUsed: "solax" });
    }

    return {
      summary: [],
      history: [],
      refreshedAt: new Date().toISOString(),
      sourceUsed: "solax",
    };
  }

  // 3) Režim "live" – čistě live data z měniče
  if (effectiveFilters.source === "live") {
    const livePayload = await loadFromSolax(effectiveFilters);
    if (livePayload) {
      return sortHistory(livePayload);
    }
  }

  // 4) HTTP Python backend (PY_BACKEND_URL)
  try {
    const httpPayload = await loadFromHttpBackend(effectiveFilters);
    if (httpPayload) {
      return sortHistory(httpPayload);
    }
  } catch {
    // detaily se logují uvnitř loadFromHttpBackend
  }

  // 5) Lokální Python script (PY_DASHBOARD_SCRIPT)
  const scriptPayload = await loadFromPythonScript(effectiveFilters);
  if (scriptPayload) {
    return sortHistory(scriptPayload);
  }

  // 6) DB (auto výběr measurements vs solax_readings)
  const dbPayload = loadDashboardHistoryFromDb(effectiveFilters);
  if (dbPayload) {
    return sortHistory(dbPayload);
  }

  // 7) Poslední pokus – live SolaX, pokud nejsme v explicitním "live" režimu
  if (effectiveFilters.source !== "live") {
    const fallbackLive = await loadFromSolax(effectiveFilters);
    if (fallbackLive) {
      return sortHistory(fallbackLive);
    }
  }

  // 8) Demo fallback
  return sortHistory(buildFallback(effectiveFilters));
}

async function loadFromHttpBackend(
  filters: DashboardFilterState,
): Promise<DashboardData | null> {
  if (!HTTP_ENDPOINT) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);

  try {
    const res = await fetch(HTTP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filters }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(
        "Python backend responded with non-OK status",
        res.status,
        await safeText(res),
      );
      return null;
    }

    const json = (await res.json()) as DashboardResponse;

    if (!isValidPayload(json)) {
      console.warn("Python backend returned invalid payload", json);
      return null;
    }

    return { ...json, sourceUsed: "python-backend" };
  } catch (error) {
    const err = error as Error & { code?: string };

    if (err.name === "AbortError") {
      if (!backendFailureNotified) {
        console.error("Python backend request timed out");
        backendFailureNotified = true;
      }
      return null;
    }

    if (!backendFailureNotified) {
      console.error("Python backend request failed", error);
      backendFailureNotified = true;
    } else {
      console.warn("Python backend still unreachable");
    }

    // Ve Vercelu ignoruj lokální backend (127.0.0.1)
    if (err.code === "ECONNREFUSED" || process.env.VERCEL) {
      return null;
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function loadFromPythonScript(
  filters: DashboardFilterState,
): Promise<DashboardData | null> {
  const script = process.env.PY_DASHBOARD_SCRIPT;
  if (!script) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("python3", [script], {
      cwd: process.env.PY_WORKDIR ?? process.cwd(),
      env: {
        ...process.env,
        DASHBOARD_RANGE: filters.range,
        DASHBOARD_SOURCE: filters.source,
      },
    });

    const json = JSON.parse(stdout.toString()) as DashboardResponse;

    if (!isValidPayload(json)) {
      console.warn("Python script returned invalid payload", json);
      return null;
    }

    return { ...json, sourceUsed: "python-script" };
  } catch (error) {
    console.error("Python dashboard script failed", error);
    return null;
  }
}

async function loadFromSolax(
  filters: DashboardFilterState,
): Promise<DashboardData | null> {
  const result = await fetchSolaxRealtime();
  if (!result) {
    return null;
  }

  const power = result.acpower ?? 0;
  const feed = result.feedinpower ?? 0;
  const importPower = Math.max(0, power - feed);

  const historyPoints = buildHistoryFromRealtime(
    result,
    filters.range,
    filters.interval,
  );

  return {
    summary: [
      { label: "Aktuální výroba", value: power, unit: "W" },
      { label: "Dodávka do sítě", value: feed, unit: "W" },
      { label: "Spotřeba z distribuce", value: importPower, unit: "W" },
      {
        label: "Výroba dnes",
        value: Math.round((result.yieldtoday ?? 0) * 1000) / 1000,
        unit: "kWh",
      },
    ],
    history: historyPoints,
    refreshedAt: result.uploadTime ?? new Date().toISOString(),
    sourceUsed: "solax-live",
  };
}

function buildFallback(filters: DashboardFilterState): DashboardData {
  const pointCount = determinePointCount(filters.range, filters.interval);
  const multiplier =
    filters.source === "excel" ? 1.2 : filters.source === "python" ? 0.9 : 1;
  const intervalMinutes = intervalToMinutes(filters.interval);

  const history: HistoryPoint[] = Array.from({ length: pointCount }).map(
    (_, idx) => {
      const datetime = new Date(
        Date.now() - idx * intervalMinutes * 60 * 1000,
      ).toISOString();

      const production =
        Math.max(
          0,
          40 + Math.sin(idx / 5) * 20 + (idx % 7) * 2,
        ) * multiplier;

      const exported =
        Math.max(0, 15 + Math.cos(idx / 6) * 10) * multiplier;
      const imported =
        Math.max(0, 10 + Math.sin(idx / 4) * 15) / multiplier;

      return {
        datetime,
        production,
        export: exported,
        import: imported,
      };
    },
  );

  return {
    summary: [
      { label: "Výroba FVE", value: Math.round(3456 * multiplier), unit: "kWh" },
      { label: "Prodej do ČEZ", value: Math.round(1240 * multiplier), unit: "kWh" },
      { label: "Dokup z ČEZ", value: Math.round(890 / multiplier), unit: "kWh" },
      {
        label: "Úspora celkem",
        value: Math.round(122_000 * multiplier),
        unit: "Kč",
      },
    ],
    history: history.reverse(),
    refreshedAt: new Date().toISOString(),
    sourceUsed: "demo",
  };
}

function determinePointCount(
  range: DashboardFilterState["range"],
  interval: DashboardFilterState["interval"],
): number {
  const totalMinutes = rangeToMinutes(range);
  const intervalMinutes = intervalToMinutes(interval);
  return Math.max(1, Math.round(totalMinutes / intervalMinutes));
}

function intervalToMinutes(
  interval: DashboardFilterState["interval"],
): number {
  if (interval === "15m") return 15;
  if (interval === "1d") return 24 * 60;
  return 60;
}

function rangeToMinutes(range: DashboardFilterState["range"]): number {
  const now = new Date();

  if (range === "24h") return 24 * 60;
  if (range === "7d") return 7 * 24 * 60;
  if (range === "30d") return 30 * 24 * 60;
  if (range === "90d") return 90 * 24 * 60;

  if (range === "thisYear") {
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.max(
      60,
      Math.round((now.getTime() - start.getTime()) / (60 * 1000)),
    );
  }

  if (range === "lastYear") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear(), 0, 1);
    return Math.round((end.getTime() - start.getTime()) / (60 * 1000));
  }

  // default – 30 dní
  return 30 * 24 * 60;
}

function isValidPayload(
  payload: Partial<DashboardResponse>,
): payload is DashboardPayload {
  return Array.isArray(payload.summary) && Array.isArray(payload.history);
}

function sortHistory<T extends { history: HistoryPoint[] }>(payload: T): T {
  return {
    ...payload,
    history: [...payload.history].sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
    ),
  };
}

type SolaxRealtime = NonNullable<
  Awaited<ReturnType<typeof fetchSolaxRealtime>>
>;

function buildHistoryFromRealtime(
  result: SolaxRealtime,
  range: DashboardFilterState["range"],
  interval: DashboardFilterState["interval"],
): HistoryPoint[] {
  const points = determinePointCount(range, interval);
  const intervalMinutes = intervalToMinutes(interval);
  const aligned = alignTimestamp(new Date(), intervalMinutes);
  const intervalMs = intervalMinutes * 60 * 1000;

  const acpower = result.acpower ?? 0;
  const feed = result.feedinpower ?? 0;
  const importPower = Math.max(0, acpower - feed);

  const history: HistoryPoint[] = Array.from({ length: points }).map(
    (_, idx) => {
      const timestamp = new Date(
        aligned.getTime() - idx * intervalMs,
      ).toISOString();

      // pro live data použijeme konstantní výkon z posledního vzorku
      return {
        datetime: timestamp,
        production: Math.max(0, acpower),
        export: Math.max(0, feed),
        import: importPower,
      };
    },
  );

  return history.reverse();
}

function alignTimestamp(date: Date, intervalMinutes: number): Date {
  const bucketMs =
    Math.floor(date.getTime() / (intervalMinutes * 60 * 1000)) *
    intervalMinutes *
    60 *
    1000;
  return new Date(bucketMs);
}
