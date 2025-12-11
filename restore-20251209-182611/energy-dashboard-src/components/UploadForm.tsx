"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UploadState =
  | { status: "idle"; message: string | null }
  | { status: "uploading"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type UploadResponse = {
  status?: string;
  stored?: string;
  error?: string;
  summary?: Array<{ dataset: string; processed: number; fileName: string }>;
};

export function UploadForm() {
  const [state, setState] = useState<UploadState>({ status: "idle", message: null });
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "uploading", message: "Probíhá zpracování soubor(u)..." });
    const formElement = event.currentTarget;
    const filesInput = formElement.elements.namedItem("files") as HTMLInputElement | null;
    const datasetInput = formElement.elements.namedItem("dataset") as HTMLSelectElement | null;
    const files = filesInput?.files ? Array.from(filesInput.files) : [];
    const dataset = datasetInput?.value ?? "solax";

    if (!files.length) {
      setState({ status: "error", message: "Vyberte prosím alespoň jeden soubor." });
      return;
    }

    try {
      const aggregatedSummary: Array<{ dataset: string; processed: number; fileName: string }> = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("dataset", dataset);
        formData.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const json = (await safeJson(res)) as UploadResponse;
        if (!res.ok) {
          throw new Error(json?.error ?? `Chyba při nahrávání souboru ${file.name}`);
        }
        const summaries = json.summary ?? [];
        aggregatedSummary.push(
          ...summaries.map((item) => ({
            ...item,
            fileName: item.fileName ?? file.name,
            dataset: item.dataset ?? dataset,
          })),
        );
      }

      const prettySummary =
        aggregatedSummary.length === 0
          ? null
          : aggregatedSummary
              .map((item) => {
                const datasetLabel = item.dataset === "tigo" ? "Tigo CSV" : "SolaX XLS";
                return `${datasetLabel} (${item.fileName}): ${item.processed} řádků`;
              })
              .join("; ");

      setState({
        status: "success",
        message: prettySummary ?? "Soubor byl předán backendu ke zpracování.",
      });
      formElement.reset();
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Nahrávání se nezdařilo.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Import dat</p>
          <p className="text-xs text-slate-500">SolaX (.xlsx) nebo Tigo (.csv), max. 10 MB.</p>
        </div>
        <select
          name="dataset"
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
          defaultValue="solax"
          aria-label="Typ dat"
        >
          <option value="solax">SolaX XLS/XLSX</option>
          <option value="tigo">Tigo CSV</option>
        </select>
      </div>
      <input type="file" name="files" multiple accept=".xlsx,.xls,.csv" className="text-sm" required />
      <button
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        type="submit"
        disabled={state.status === "uploading"}
      >
        {state.status === "uploading" ? "Zpracovávám…" : "Nahrát a uložit"}
      </button>
      {state.message && (
        <p
          className={`text-sm ${
            state.status === "error" ? "text-red-600" : state.status === "success" ? "text-emerald-600" : "text-slate-500"
          }`}
        >
          {state.message}
        </p>
      )}
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
