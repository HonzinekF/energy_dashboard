import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  capexFve: z.coerce.number().nonnegative(),
  capexBattery: z.coerce.number().nonnegative().optional(),
  subsidy: z.coerce.number().nonnegative().optional(),
  priceKwh: z.coerce.number().positive(),
  annualProduction: z.coerce.number().nonnegative(),
  annualConsumption: z.coerce.number().nonnegative(),
  selfConsumptionShare: z.coerce.number().min(0).max(1).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné vstupy", issues: parsed.error.flatten() }, { status: 400 });
  }
  const payload = parsed.data;
  const capex = payload.capexFve + (payload.capexBattery ?? 0) - (payload.subsidy ?? 0);
  const selfShare = payload.selfConsumptionShare ?? 0.6;
  const selfUse = payload.annualProduction * selfShare;
  const exportUse = payload.annualProduction - selfUse;
  const feedPrice = Number(process.env.CZK_FEEDIN_TARIFF ?? 1.5);
  const savings = selfUse * payload.priceKwh + exportUse * feedPrice;

  const roiYears = savings > 0 ? capex / savings : null;
  const cashflow = buildCashflow(capex, savings, 15);

  return NextResponse.json({
    capex,
    annualSavings: savings,
    roiYears,
    cashflow,
  });
}

function buildCashflow(capex: number, annualSavings: number, years: number) {
  let cumulative = -capex;
  const flow = [];
  for (let year = 1; year <= years; year += 1) {
    cumulative += annualSavings;
    flow.push({ year, cumulative });
  }
  return flow;
}
