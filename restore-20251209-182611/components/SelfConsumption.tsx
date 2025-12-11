"use client";

import { useEffect, useState } from "react";

type SelfConsumptionStats = {
  self?: number;
  import?: number;
  export?: number;
};

export function SelfConsumption() {
  const [stats, setStats] = useState<SelfConsumptionStats | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/history")
      .then((res) => res.json())
      .then((json) => {
        if (!active || !json?.data?.history?.length) return;
        const history = json.data.history as Array<{ production: number; export: number; import: number }>;
        const totals = history.reduce(
          (acc, row) => {
            acc.production += row.production ?? 0;
            acc.export += row.export ?? 0;
            acc.import += row.import ?? 0;
            return acc;
          },
          { production: 0, export: 0, import: 0 },
        );
        const denom = totals.production + totals.import;
        const self = denom > 0 ? ((totals.production - totals.export) / denom) * 100 : 0;
        const importShare = denom > 0 ? (totals.import / denom) * 100 : 0;
        const exportShare = totals.production > 0 ? (totals.export / totals.production) * 100 : 0;
        setStats({ self, import: importShare, export: exportShare });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  if (!stats) return null;

  return (
    <div className="mt-2 text-xs text-slate-600">
      <p>Soběstačnost: {stats.self?.toFixed(1)} %</p>
      <p>Import: {stats.import?.toFixed(1)} % • Export: {stats.export?.toFixed(1)} %</p>
    </div>
  );
}
