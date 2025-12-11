"use client";

import { useState } from "react";

type ImportState =
  | { status: "idle"; message?: string }
  | { status: "uploading"; message?: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function MeasurementsImportForm() {
  const [state, setState] = useState<ImportState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setState({ status: "error", message: "Vyberte prosím soubor CSV/XLSX." });
      return;
    }

    setState({ status: "uploading", message: "Načítám a kontroluji soubor…" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(json?.error ?? "Import se nezdařil.");
      }
      const imported = json?.imported as number | undefined;
      setState({
        status: "success",
        message: imported ? `Import dokončen, zapsáno ${imported} řádků.` : json?.message ?? "Import dokončen.",
      });
      form.reset();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Soubor se nepodařilo načíst.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-800">Nahrát CSV / XLSX</p>
        <p className="text-sm text-slate-600">
          Očekává se export <strong>energy_report_JAN_FAIT_ALL.csv</strong> nebo kompatibilní CSV s hlavičkami
          Datetime_15min, Výroba FVE (kWh), Odběr + Dokup elektřiny z ČEZ (kWh).
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Vybrat soubor</span>
        <input
          type="file"
          name="file"
          accept=".csv,.xls,.xlsx"
          className="mt-2 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium"
          required
        />
      </label>

      <button
        type="submit"
        disabled={state.status === "uploading"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {state.status === "uploading" ? "Načítám…" : "Spustit import"}
      </button>

      {state.message ? (
        <p
          className={`text-sm ${
            state.status === "error" ? "text-red-600" : state.status === "success" ? "text-emerald-700" : "text-slate-600"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Pokud v databázi existují data se stejným časem, budou přepsána (INSERT OR REPLACE podle timestampu).
      </p>
    </form>
  );
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
