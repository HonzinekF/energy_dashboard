"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Scenario } from "@/lib/batterySim";
import { useMemo } from "react";

export function BatteryChart({ scenarios }: { scenarios: Scenario[] }) {
  const data = useMemo(
    () =>
      scenarios.map((s) => ({
        cap: s.capacityKwh,
        savings: s.savingsKc,
        self: s.selfSufficiency * 100,
      })),
    [scenarios],
  );

  if (!data.length) {
    return <p className="text-sm text-slate-600">Žádná data pro graf.</p>;
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 12, right: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="cap" tickFormatter={(v) => `${v} kWh`} />
          <YAxis
            yAxisId="left"
            label={{ value: "Úspora (Kč/rok)", angle: -90, position: "insideLeft" }}
            tickFormatter={(v) => v.toLocaleString("cs-CZ")}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            label={{ value: "Soběstačnost (%)", angle: 90, position: "insideRight" }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value, name) => {
              if (name === "savings") return [`${(value as number).toLocaleString("cs-CZ")} Kč/rok`, "Úspora"];
              if (name === "self") return [`${(value as number).toFixed(1)} %`, "Soběstačnost"];
              return value;
            }}
          />
          <Line yAxisId="left" type="monotone" dataKey="savings" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="self" stroke="#0ea5e9" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
