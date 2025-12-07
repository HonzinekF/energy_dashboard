export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col gap-6 p-6">
      <div className="h-10 w-48 rounded-xl bg-slate-200 animate-pulse" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-20 rounded-2xl bg-white border border-slate-200 shadow-sm animate-pulse" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-white border border-slate-200 shadow-sm animate-pulse" />
      <div className="h-36 rounded-2xl bg-white border border-slate-200 shadow-sm animate-pulse" />
    </div>
  );
}
