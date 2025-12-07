interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
}

export function MetricCard({ label, value, unit }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm min-w-[170px] transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold">
        {value.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        {unit && <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>}
      </p>
    </div>
  );
}
