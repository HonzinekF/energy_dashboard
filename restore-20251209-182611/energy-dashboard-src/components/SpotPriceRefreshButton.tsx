"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SpotPriceRefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/spot/update", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Aktualizace selhala");
      }
      setMessage(`Aktualizováno: ${json.date}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aktualizace selhala");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRefresh}
        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Aktualizuji…" : "Aktualizovat spot"}
      </button>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
