"use client";

import { useCallback, useState } from "react";

type PreviewRow = Record<string, string | number | null | undefined>;
type Dataset = "solax" | "tigo";

type PreviewResponse = {
  rows: PreviewRow[];
  columns?: string[];
  intervalMinutes?: number;
  dataset?: string;
  error?: string;
};

export function ImportPreview() {
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ timestamp?: string; production?: string; consumption?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "map" | "confirm">("upload");
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<Dataset>("solax");

  const handleFile = useCallback(
    async (file?: File) => {
      if (!file) return;
      setLoading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("dataset", dataset);
        formData.append("file", file);
        const res = await fetch("/api/import/preview", { method: "POST", body: formData, credentials: "include" });
        const json = (await safeJson(res)) as PreviewResponse;
        if (!res.ok) {
          throw new Error(json?.error ?? "Náhled se nepodařilo vytvořit.");
        }
        const rows = json.rows ?? [];
        const cols = json.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
        setPreview(rows.slice(0, 10));
        setColumns(cols);
        setStep(rows.length ? "map" : "upload");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Neznámá chyba při čtení souboru.");
        setPreview([]);
        setColumns([]);
        setStep("upload");
      } finally {
        setLoading(false);
      }
    },
    [dataset],
  );

  function handleMappingChange(field: "timestamp" | "production" | "consumption", value: string) {
    setMapping((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">Náhled importu</p>
          <p className="text-xs text-slate-500">Používá stejnou logiku jako serverový import (SolaX/Tigo).</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Dataset
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
            value={dataset}
            onChange={(e) => setDataset(e.target.value as Dataset)}
          >
            <option value="solax">SolaX XLS/XLSX</option>
            <option value="tigo">Tigo CSV</option>
          </select>
        </label>
      </div>

      <UploadZone onFile={handleFile} loading={loading} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {columns.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <FieldSelect label="Timestamp sloupec" columns={columns} value={mapping.timestamp} onChange={(value) => handleMappingChange("timestamp", value)} />
          <FieldSelect label="Výroba (kWh)" columns={columns} value={mapping.production} onChange={(value) => handleMappingChange("production", value)} />
          <FieldSelect label="Spotřeba (kWh)" columns={columns} value={mapping.consumption} onChange={(value) => handleMappingChange("consumption", value)} />
        </div>
      )}

      {preview.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm text-slate-700">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                {Object.keys(preview[0]).map((key) => (
                  <th key={key} className="py-2 pr-4">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  {Object.keys(row).map((key) => (
                    <td key={key} className="py-2 pr-4">
                      {String(row[key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        disabled={!mapping.timestamp || !mapping.production || !mapping.consumption || preview.length === 0}
        onClick={() => setStep("confirm")}
      >
        Importovat (zatím jen náhled)
      </button>
      {!mapping.timestamp && preview.length > 0 && <p className="text-xs text-slate-500">Zvolte sloupec pro timestamp, výrobu a spotřebu.</p>}

      {step === "confirm" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Připraveno k importu (mock). Timestamp: {mapping.timestamp}, Výroba: {mapping.production}, Spotřeba: {mapping.consumption}.
        </div>
      )}
    </div>
  );
}

function FieldSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: string[];
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span>{label}</span>
      <select
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— vyberte —</option>
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>
    </label>
  );
}

function UploadZone({ onFile, loading }: { onFile: (file?: File) => void; loading: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        onFile(file);
      }}
    >
      <p className="font-medium">Přetáhněte CSV/XLS sem</p>
      <p className="text-xs text-slate-500">Nebo vyberte soubor</p>
      <input type="file" accept=".csv,.xls,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" disabled={loading} />
      {loading && <p className="text-xs text-slate-500">Načítám náhled…</p>}
    </div>
  );
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
