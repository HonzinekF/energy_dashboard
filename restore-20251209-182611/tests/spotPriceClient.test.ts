import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSpotPrices, resetSpotPriceCache } from "../lib/spotPriceClient";

const samplePayload = {
  date: "2024-01-01",
  prices_1h: [
    { hour: "00-01", czk_kwh: 2, eur_kwh: 0.08 },
    { hour: "01-02", czk_kwh: 1.5, eur_kwh: 0.06 },
  ],
};

describe("spotPriceClient", () => {
  beforeEach(() => {
    resetSpotPriceCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data from primary API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(samplePayload), { status: 200 })));

    const result = await fetchSpotPrices("2024-01-01");

    expect(result?.source).toBe("electricitypriceapi.com");
    expect(result?.hourly[0].priceCZK).toBeCloseTo(2);
    expect(result?.cached).toBeUndefined();
  });

  it("returns cached payload when all sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(samplePayload), { status: 200 })));
    await fetchSpotPrices("2024-01-01"); // seed cache

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));

    const result = await fetchSpotPrices("2024-01-02");

    expect(result?.cached).toBe(true);
    expect(result?.hourly.length).toBeGreaterThan(0);
  });
});
