import { NextResponse } from "next/server";
import { fetchSpotPrices } from "@/lib/spotPriceClient";
import { saveSpotPrices } from "@/lib/spotPriceStore";

export async function POST() {
  const data = await fetchSpotPrices();
  if (!data) {
    return NextResponse.json({ error: "Nepodařilo se načíst data ze spot API." }, { status: 502 });
  }
  await saveSpotPrices(data);
  return NextResponse.json({ ok: true, date: data.date });
}
