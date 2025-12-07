"use client";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Nepodařilo se načíst dashboard</h1>
        <p className="text-slate-600">{error.message || "Došlo k neočekávané chybě."}</p>
        <button
          onClick={reset}
          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          Zkusit znovu
        </button>
      </div>
    </div>
  );
}
