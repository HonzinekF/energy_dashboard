import type { DashboardData } from "@/lib/pythonClient";
import type { SpotPricePayload } from "@/lib/spotPriceClient";
import { DashboardRefreshButton } from "./DashboardRefreshButton";
import { SelfConsumption } from "./SelfConsumption";

type DashboardStatusProps = {
  dashboardSource: DashboardData["sourceUsed"];
  dashboardUpdatedAt?: string;
  spotPayload?: SpotPricePayload | null;
  spotUpdatedAt?: string;
};

export function DashboardStatus({ dashboardSource, dashboardUpdatedAt, spotPayload, spotUpdatedAt }: DashboardStatusProps) {
  const isFallback = dashboardSource === "demo";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Stav dat</p>
          <p className="text-xs text-slate-500">Zdroj metrik a poslední aktualizace.</p>
        </div>
        <DashboardRefreshButton />
      </header>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatusCard
          title="Dashboard data"
          badge={labelForDashboardSource(dashboardSource)}
          timestamp={dashboardUpdatedAt}
          description={statusDescription(dashboardSource)}
        />
        <StatusCard
          title="Spotové ceny"
          badge={spotPayload ? spotPayload.source : "Bez dat"}
          timestamp={spotUpdatedAt ?? spotPayload?.updatedAt}
          description={spotPayload ? "Denní/kvartální ceny" : "Nepodařilo se načíst spot ceny"}
        />
        <StatusCard
          title="Vlastní spotřeba"
          badge="Přehled"
          timestamp={dashboardUpdatedAt}
          description=""
          customContent={<SelfConsumption />}
        />
      </div>
      {isFallback && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Demo data se používají jako záloha – nastavte prosím připojení k backendu nebo SolaX, aby graf zobrazoval reálná data.
        </div>
      )}
    </section>
  );
}

function StatusCard({
  title,
  badge,
  timestamp,
  description,
  customContent,
}: {
  title: string;
  badge: string;
  timestamp?: string;
  description?: string;
  customContent?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">{badge}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">Aktualizováno: {formatDate(timestamp)}</p>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {customContent}
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "neznámé";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("cs-CZ");
}

function labelForDashboardSource(source: DashboardData["sourceUsed"]) {
  if (source === "solax-live") return "Live (SolaX)";
  if (source === "python-backend") return "Python backend";
  if (source === "python-script") return "Python skript";
  if (source === "db") return "Lokální DB";
  if (source === "solax") return "SolaX fallback";
  return "Demo fallback";
}

function statusDescription(source: DashboardData["sourceUsed"]) {
  if (source === "solax-live") return "Přímé čtení z SolaX rozhraní";
  if (source === "python-backend") return "Data z HTTP endpointu";
  if (source === "python-script") return "Data z lokálního skriptu";
  return "Ukázková data pro vývoj";
}
