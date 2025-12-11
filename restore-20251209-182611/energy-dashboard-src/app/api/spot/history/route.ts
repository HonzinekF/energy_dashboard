import { NextResponse } from "next/server";
import { fetchSpotPricesHistory } from "@/lib/spotPriceHistory";

export async function GET() {
  const history = await fetchSpotPricesHistory(30);
  return NextResponse.json({ data: history });
}
