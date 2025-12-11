#!/usr/bin/env ts-node
import fg from "fast-glob";
import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { importSolaxFile, importTigoCsv } from "../lib/importers";

type Argv = {
  solax?: string[];
  tigo?: string[];
};

async function main() {
  const argv = (await yargs(hideBin(process.argv))
    .option("solax", { type: "array", describe: "Cesty nebo glob vzory na SolaX XLS/XLSX soubory" })
    .option("tigo", { type: "array", describe: "Cesty nebo glob vzory na Tigo CSV soubory" })
    .help()
    .parse()) as Argv;

  if (!argv.solax && !argv.tigo) {
    console.log("Použití: scripts/import-energy-data.ts --solax \"/path/*.xlsx\" --tigo \"/path/*.csv\"");
    process.exit(0);
  }

  if (argv.solax) {
    const files = await expandPaths(argv.solax);
    for (const file of files) {
      console.log(`Importuji SolaX: ${file}`);
      const summary = await importSolaxFile(file);
      console.log(`✓ ${summary.processed} řádků`);
    }
  }

  if (argv.tigo) {
    const files = await expandPaths(argv.tigo);
    for (const file of files) {
      console.log(`Importuji Tigo: ${file}`);
      const summary = await importTigoCsv(file);
      console.log(`✓ ${summary.processed} řádků`);
    }
  }
}

async function expandPaths(patterns: string[]) {
  const globbed = await fg(patterns, { onlyFiles: true, absolute: true });
  return globbed.map((file) => path.resolve(file));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
