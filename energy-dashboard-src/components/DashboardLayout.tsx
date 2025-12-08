"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { DashboardFilterBar } from "./DashboardFilterBar";
import type { DashboardFilterState } from "@/lib/dashboardFilters";

const navItems = [
  { href: "/", label: "Přehled" },
  { href: "/reports", label: "Reporty", disabled: true },
  { href: "/analytics", label: "Analýzy", disabled: true },
];

export function DashboardLayout({ children, filters }: { children: React.ReactNode; filters: DashboardFilterState }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/40 md:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white p-6 transition-transform duration-200 md:static md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex flex-col gap-6 h-full">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Energy</p>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="text-sm text-slate-500 mt-1">Sledování výroby, importu a exportu</p>
            </div>
            <nav className="flex flex-col gap-1 text-sm font-medium">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                const commonClasses = item.disabled
                  ? "text-slate-400 cursor-not-allowed"
                  : isActive
                    ? "bg-slate-900 text-white"
                    : "hover:bg-slate-100";
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    prefetch={item.disabled ? false : undefined}
                    onClick={(event) => {
                      if (item.disabled) {
                        event.preventDefault();
                        return;
                      }
                      setSidebarOpen(false);
                    }}
                    tabIndex={item.disabled ? -1 : undefined}
                    className={`rounded-lg px-3 py-2 ${commonClasses}`}
                    aria-disabled={item.disabled}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto pt-6 border-t border-slate-100">
              <LogoutButton variant="ghost" className="w-full justify-start" />
            </div>
          </div>
        </aside>
        <main className="flex-1 flex flex-col min-h-screen">
          <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Aktualizováno právě teď</p>
                <h2 className="text-xl font-semibold">Energetické metriky</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="md:hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                >
                  Menu
                </button>
                <LogoutButton className="hidden md:inline-flex" />
              </div>
            </div>
            <DashboardFilterBar filters={filters} />
          </header>
          <div className="flex-1 p-4 md:p-6 space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
