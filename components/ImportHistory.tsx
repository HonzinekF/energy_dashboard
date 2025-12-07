"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImportJob } from "@/lib/importTypes";

type ImportHistoryProps = {
  jobs: ImportJob[];
};

const statusLabels: Record<ImportJob["status"], string> = {
  queued: "Ve frontě",
  processing: "Zpracovává se",
  done: "Hotovo",
  failed: "Chyba",
};

const statusColors: Record<ImportJob["status"], string> = {
  queued: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  done: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export function ImportHistory({ jobs }: ImportHistoryProps) {
  const [entries, setEntries] = useState(jobs);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedCount = useMemo(() => entries.length.toString(), [entries.length]);

  const fetchJobs = useCallback(async (manual = false) => {
    try {
      if (manual) setIsRefreshing(true);
      const res = await fetch("/api/imports", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const payload = (await res.json()) as ImportJob[];
      setEntries(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodařilo se obnovit historii importů.");
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/imports/stream", { withCredentials: true });
    source.onopen = () => {
      setIsLive(true);
      setError(null);
    };
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ImportJob[];
        setEntries(payload);
        setError(null);
      } catch (err) {
        console.error("Nepodařilo se parsovat SSE payload", err);
      }
    };
    source.onerror = () => {
      setIsLive(false);
      setError("Spojení s import streamem bylo přerušeno. Můžete zkusit ruční aktualizaci.");
    };
    return () => source.close();
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Historie importů</p>
          <p className="text-xs text-slate-500 flex items-center gap-2">
            Posledních {formattedCount} importů uložených v systému.
            <span
              className={`inline-flex items-center gap-1 ${
                isLive ? "text-emerald-600" : "text-amber-600"
              } text-[11px] font-semibold`}
            >
              <span className={`h-2 w-2 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
              {isLive ? "ŽIVĚ" : "OFFLINE"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchJobs(true)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          aria-busy={isRefreshing}
        >
          {isRefreshing ? "Načítám..." : "Aktualizovat ručně"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Zatím nebyly nahrány žádné soubory.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Soubor</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Zpráva</th>
                <th className="py-2 pr-2">Vytvořeno</th>
                <th className="py-2">Aktualizováno</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((job) => (
                <tr key={job.id} className="border-t border-slate-100">
                  <td className="py-2 pr-2">
                    <div className="max-w-xs truncate text-slate-900">{job.filePath}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[job.status]}`}>
                      {statusLabels[job.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-slate-600">
                    {job.message ? <span className="line-clamp-2">{job.message}</span> : <span className="text-slate-400">–</span>}
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-600">
                    {new Date(job.createdAt).toLocaleString("cs-CZ")}
                  </td>
                  <td className="py-2 text-xs text-slate-600">
                    {"updatedAt" in job && (job as { updatedAt?: string }).updatedAt
                      ? new Date((job as { updatedAt: string }).updatedAt).toLocaleString("cs-CZ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
