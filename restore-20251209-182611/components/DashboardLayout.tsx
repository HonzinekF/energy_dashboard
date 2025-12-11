"use client";

import Link from "next/link";
import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { DashboardFilterBar } from "./DashboardFilterBar";
import type { DashboardFilterState } from "@/lib/dashboardFilters";

const navItems = [
  { href: "/dashboard", label: "Vizualizace energie" },
  { href: "/spot", label: "Vizualizace SPOT" },
  { href: "/import", label: "Import dat" },
  { href: "/settings", label: "Nastavení" },
];

type Props = {
  children: React.ReactNode;
  filters: DashboardFilterState;
  title?: string;
  description?: string;
  showFilters?: boolean;
};

export function DashboardLayout({ children, filters, title = "Dashboard", description, showFilters = true }: Props) {
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
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">TERRABATT</p>
              <h1 className="text-2xl font-semibold text-slate-900">Energy Dashboard</h1>
              <p className="text-sm text-slate-500">FVE • spot ceny • import</p>
            </div>
            <nav className="flex flex-col gap-1 text-sm font-medium">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const commonClasses = isActive ? "bg-slate-900 text-white shadow-sm" : "hover:bg-slate-100 text-slate-700";
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setSidebarOpen(false)}
                    className={`rounded-lg px-3 py-2 ${commonClasses}`}
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
          <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-6 space-y-3 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">TERRABATT</p>
                <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
                {description ? <p className="text-sm text-slate-600">{description}</p> : null}
              </div>
              <button
                type="button"
                className="md:hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                onClick={() => setSidebarOpen((prev) => !prev)}
              >
                Menu
              </button>
            </div>
            {showFilters ? <DashboardFilterBar filters={filters} /> : null}
          </header>
          <div className="flex-1 p-4 md:p-6 space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
