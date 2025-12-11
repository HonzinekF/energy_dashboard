interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function ChartCard({ title, description, children }: ChartCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <header className="mb-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </header>
      <div className="min-h-[180px]">{children}</div>
    </section>
  );
}
