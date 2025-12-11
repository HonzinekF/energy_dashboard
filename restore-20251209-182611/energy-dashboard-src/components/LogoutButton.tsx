"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  variant?: "outline" | "ghost";
  className?: string;
};

export function LogoutButton({ variant = "outline", className = "" }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const baseClasses =
    variant === "ghost"
      ? "rounded-lg px-3 py-2 hover:bg-slate-100 text-left w-full text-sm font-medium"
      : "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100";

  return (
    <button
      type="button"
      aria-busy={pending}
      onClick={handleLogout}
      className={`${baseClasses} ${className}`.trim()}
      disabled={pending}
    >
      {pending ? "Odhlašuji..." : "Odhlásit"}
    </button>
  );
}
