"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DashboardRefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleRefresh() {
    setLoading(true);
    router.refresh();
    setTimeout(() => setLoading(false), 600);
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      disabled={loading}
    >
      {loading ? "Obnovuji…" : "Obnovit dashboard"}
    </button>
  );
}
