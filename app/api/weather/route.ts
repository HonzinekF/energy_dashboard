import { NextResponse } from "next/server";

export const runtime = "nodejs";

const LAT = Number(process.env.WEATHER_LAT ?? 50.08);
const LON = Number(process.env.WEATHER_LON ?? 14.43);
const FVE_KW = Number(process.env.FVE_POWER_KW ?? 8);
const EFF = 0.85;

export async function GET() {
  try {
    const data = await fetchWeather();
    const series = buildProductionSeries(data);
    return NextResponse.json({
      source: "open-meteo",
      hourly: series,
    });
  } catch (error) {
    console.warn("weather fetch failed", error);
    const mock = buildMock();
    return NextResponse.json({ source: "mock", hourly: mock }, { status: 200 });
  }
}

type MeteoResponse = {
  hourly?: {
    time: string[];
    shortwave_radiation?: number[];
  };
};

async function fetchWeather(): Promise<MeteoResponse> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=shortwave_radiation&forecast_days=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
  clearTimeout(timer);
  if (!res.ok) {
    throw new Error(`weather status ${res.status}`);
  }
  return (await res.json()) as MeteoResponse;
}

function buildProductionSeries(data: MeteoResponse) {
  const times = data.hourly?.time ?? [];
  const irr = data.hourly?.shortwave_radiation ?? [];
  const len = Math.min(times.length, irr.length, 24);
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const kwm2 = (irr[i] ?? 0) / 1000;
    const prodKw = kwm2 * FVE_KW * EFF;
    out.push({
      datetime: times[i],
      irradiance: irr[i] ?? 0,
      productionKw: prodKw,
    });
  }
  return out;
}

function buildMock() {
  const now = new Date();
  const base = now.toISOString().slice(0, 10);
  const res = [];
  for (let h = 0; h < 24; h += 1) {
    const irradiance = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)) * 600;
    const kwm2 = irradiance / 1000;
    res.push({
      datetime: `${base}T${String(h).padStart(2, "0")}:00:00Z`,
      irradiance,
      productionKw: kwm2 * FVE_KW * EFF,
    });
  }
  return res;
}
