"use client";

import Link from "next/link";
import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { DashboardFilterBar } from "./DashboardFilterBar";
import type { DashboardFilterState } from "@/lib/dashboardFilters";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/history", label: "Historie" },
  { href: "/analysis", label: "Analýzy" },
  { href: "/analysis/battery", label: "Kapacita baterie" },
  { href: "/analysis/roi", label: "Návratnost", disabled: true },
  { href: "/import", label: "Import dat" },
  { href: "/settings", label: "Nastavení" },
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
              <p className="text-sm uppercase tracking-wide text-amber-500">TERRABATT</p>
              <h1 className="text-2xl font-semibold text-slate-900">Energy Suite</h1>
              <p className="text-sm text-slate-500 mt-1">Dashboard • Historie • Analýzy</p>
            </div>
            <nav className="flex flex-col gap-1 text-sm font-medium">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                const commonClasses = item.disabled
                  ? "text-slate-400 cursor-not-allowed"
                  : isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "hover:bg-slate-100";
                return (
                  <Link
                    key={item.label}
                    href={item.href}
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
          <header className="border-b border-slate-200 bg-white px-4 py-4 md:px-6 space-y-3 sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Aktuální stránka</p>
                <h2 className="text-xl font-semibold">{pageTitle(pathname)}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="md:hidden rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                >
                  Menu
                </button>
                <div className="hidden md:inline-flex items-center gap-3">
                  <span className="text-sm text-slate-600">Uživatel</span>
                  <LogoutButton />
                </div>
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

function pageTitle(pathname: string) {
  if (pathname.startsWith("/history")) return "Historie";
  if (pathname.startsWith("/analysis/battery")) return "Kapacita baterie";
  if (pathname.startsWith("/analysis")) return "Analýzy";
  if (pathname.startsWith("/import")) return "Import dat";
  if (pathname.startsWith("/settings")) return "Nastavení";
  if (pathname.startsWith("/landing")) return "Landing";
  return "Dashboard";
}
