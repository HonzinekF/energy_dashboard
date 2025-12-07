"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DashboardFilterState } from "@/lib/dashboardFilters";
import { DEFAULT_FILTERS, availableIntervals, availableRanges, availableSources } from "@/lib/dashboardFilters";

export function DashboardFilterBar({ filters }: { filters: DashboardFilterState }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const updateFilter = useCallback(
    (key: keyof DashboardFilterState, value: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      const defaultValue = DEFAULT_FILTERS[key];
      if (value === defaultValue) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
      const query = nextParams.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname);
        router.refresh();
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-sm text-slate-500">Zobrazení</p>
        <p className="text-base font-medium text-slate-900">
          {labelForValue(filters.range, availableRanges())},{" "}
          {labelForValue(filters.source, availableSources())},{" "}
          {labelForValue(filters.interval, availableIntervals())}
        </p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <FilterSelect
          label="Období"
          value={filters.range}
          options={availableRanges()}
          onChange={(value) => updateFilter("range", value)}
        />
        <FilterSelect
          label="Interval"
          value={filters.interval}
          options={availableIntervals()}
          onChange={(value) => updateFilter("interval", value)}
        />
        <FilterSelect
          label="Zdroj dat"
          value={filters.source}
          options={availableSources()}
          onChange={(value) => updateFilter("source", value)}
        />
      </div>
    </div>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="text-sm text-slate-600 flex flex-col gap-1">
      {label}
      <select
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function labelForValue(value: string, options: ReadonlyArray<{ value: string; label: string }>) {
  return options.find((option) => option.value === value)?.label ?? value;
}
