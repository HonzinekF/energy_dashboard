import type { SpotPricePayload } from "./spotPriceClient";

type ForecastPoint = {
  datetime: string;
  productionKw: number;
};

type PlanStep = {
  datetime: string;
  action: "charge" | "discharge" | "idle";
  note: string;
};

export function combineForecastAndPrices(forecast: ForecastPoint[], prices: SpotPricePayload, capacityKwh = 10) {
  // Zjednodušený heuristický plán:
  // - Nabíjej, pokud irradiance vysoká (prodKw > 0.5*max) a cena nízká (pod mediánem).
  // - Vybíjej, pokud cena nad mediánem a současně produkce nízká.

  if (!forecast.length || !prices?.hourly?.length) return { steps: [], recommendations: ["Chybí data pro plán."] };

  const medianPrice =
    prices.hourly
      .map((p) => p.priceCZK)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b)[Math.floor(prices.hourly.length / 2)] ?? 0;
  const maxProd = Math.max(...forecast.map((f) => f.productionKw));

  const steps: PlanStep[] = forecast.map((f) => {
    const price = findPrice(prices, f.datetime) ?? medianPrice;
    const highProduction = f.productionKw > 0.5 * maxProd;
    const highPrice = price > medianPrice;
    let action: PlanStep["action"] = "idle";
    let note = "Drž aktuální stav.";

    if (highProduction && !highPrice) {
      action = "charge";
      note = "Nabíjej – vysoká výroba, nízká cena.";
    } else if (highPrice && !highProduction) {
      action = "discharge";
      note = "Vybíjej – vysoká cena, nízká výroba.";
    } else if (highProduction && highPrice) {
      action = "charge";
      note = "Nabíjej přebytky, cena je vyšší – zvaž prodej později.";
    }

    return { datetime: f.datetime, action, note };
  });

  const recommendations = buildRecommendations(steps, capacityKwh);
  return { steps, recommendations };
}

function findPrice(prices: SpotPricePayload, datetime: string) {
  const hour = prices.hourly.find((p) => p.from.startsWith(datetime.slice(0, 13)));
  return hour?.priceCZK;
}

function buildRecommendations(steps: PlanStep[], capacityKwh: number) {
  const chargeHours = steps.filter((s) => s.action === "charge").map((s) => s.datetime.slice(11, 16));
  const dischargeHours = steps.filter((s) => s.action === "discharge").map((s) => s.datetime.slice(11, 16));
  const recs = [];
  if (chargeHours.length) recs.push(`Nabíjej během hodin: ${chargeHours.slice(0, 6).join(", ")}…`);
  if (dischargeHours.length) recs.push(`Vybíjej během hodin: ${dischargeHours.slice(0, 6).join(", ")}…`);
  recs.push(`Kapacita baterie ${capacityKwh} kWh – ber v potaz reálné SOC a výkon měniče.`);
  return recs;
}
