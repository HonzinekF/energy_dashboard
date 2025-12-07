#!/usr/bin/env ts-node
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { fetchSpotPrices } from "../lib/spotPriceClient.ts";
import { saveSpotPrices } from "../lib/spotPriceStore.ts";

type Args = {
  from: string;
  to?: string;
};

async function main() {
  const argv = (await yargs(hideBin(process.argv))
    .option("from", {
      type: "string",
      demandOption: true,
      describe: "Počáteční datum ve formátu YYYY-MM-DD",
    })
    .option("to", {
      type: "string",
      describe: "Koncové datum ve formátu YYYY-MM-DD (včetně). Výchozí dnešek.",
    })
    .strict()
    .help().parse()) as Args;

  const start = parseDate(argv.from);
  const end = argv.to ? parseDate(argv.to) : new Date();
  if (start > end) {
    throw new Error("Počáteční datum musí být menší nebo rovno koncovému datu.");
  }

  const current = new Date(start);
  let imported = 0;
  while (current <= end) {
    const date = current.toISOString().slice(0, 10);
    process.stdout.write(`Načítám ${date}… `);
    try {
      const payload = await fetchSpotPrices(date);
      if (!payload) {
        console.warn("bez dat");
      } else {
        await saveSpotPrices(payload);
        imported += 1;
        console.log("uloženo");
      }
    } catch (error) {
      console.error("chyba:", (error as Error).message);
    }
    current.setDate(current.getDate() + 1);
  }

  console.log(`Hotovo. Uloženo ${imported} dnů (${argv.from}–${argv.to ?? end.toISOString().slice(0, 10)}).`);
}

function parseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Neplatné datum: ${value}`);
  }
  return date;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
