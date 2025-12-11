"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirectTo");
  const redirectTo = useMemo(() => {
    if (!redirectParam) return "/";
    if (!redirectParam.startsWith("/") || redirectParam.startsWith("//")) {
      return "/";
    }
    return redirectParam;
  }, [redirectParam]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const password = formData.get("password");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: typeof password === "string" ? password.trim() : "" }),
      });

      if (!res.ok) {
        setError("Nesprávné heslo");
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Přihlášení se nezdařilo. Zkuste to prosím znovu.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-xl rounded-2xl p-10 w-full max-w-md flex flex-col gap-5"
      >
        <h1 className="text-2xl font-semibold text-slate-900">
          Energy Dashboard
        </h1>
        <p className="text-sm text-slate-500">
          Přihlaste se heslem „solax“. V produkci nastavte proměnnou
          <code className="ml-1">DASHBOARD_PASSWORD</code> nebo{" "}
          <code className="ml-1">DASHBOARD_PASSWORD_HASH</code>.
        </p>
        <label className="flex flex-col gap-2 text-sm text-slate-600">
          Heslo
          <input
            type="password"
            name="password"
            className="rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="solax"
            required
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          className="mt-2 rounded-xl bg-emerald-500 text-white py-2 font-medium hover:bg-emerald-600 transition disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? "Probíhá přihlášení..." : "Přihlásit se"}
        </button>
      </form>
    </div>
  );
}
