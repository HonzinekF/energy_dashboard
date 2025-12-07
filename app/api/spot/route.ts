import { NextResponse } from "next/server";
import { fetchSpotPrices } from "@/lib/spotPriceClient";
import { storeSpotPricePayload } from "@/lib/spotPriceDb";

export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await fetchSpotPrices();
    if (!payload) {
      return NextResponse.json({ error: "Spotová data nejsou k dispozici" }, { status: 503 });
    }
    storeSpotPricePayload(payload);
    return NextResponse.json({ source: payload.source, date: payload.date, points: payload.hourly.length });
  } catch (error) {
    console.error("API spot error", error);
    return NextResponse.json({ error: "Chyba při načítání spotových dat" }, { status: 500 });
  }
}
