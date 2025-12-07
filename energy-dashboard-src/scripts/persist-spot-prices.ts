#!/usr/bin/env ts-node
import { fetchSpotPrices } from "../lib/spotPriceClient";
import { saveSpotPrices } from "../lib/spotPriceStore";

async function main() {
  const payload = await fetchSpotPrices();
  if (!payload) {
    throw new Error("Nepodařilo se načíst spotové ceny");
  }
  await saveSpotPrices(payload);
  console.log("Uloženy spotové ceny pro", payload.date);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
