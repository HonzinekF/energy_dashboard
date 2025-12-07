"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/logout", { method: "POST" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odhlášení se nezdařilo.");
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "Odhlašuji…" : "Odhlásit"}
      </button>
    </div>
  );
}
