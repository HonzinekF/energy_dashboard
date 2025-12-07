#!/usr/bin/env ts-node
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const BASE_URL = process.env.ELECTRICITY_PRICE_HISTORY_URL ?? "https://api.electricitypriceapi.com/v1/history";
const OUTPUT_DIR = process.argv[4] ?? path.join(process.cwd(), "data", "spot-history");
const START_DATE = process.argv[2] ?? "2022-01-01";
const END_DATE = process.argv[3] ?? new Date().toISOString().slice(0, 10);

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const ranges = splitIntoYears(START_DATE, END_DATE);
  for (const range of ranges) {
    const url = `${BASE_URL}?from=${range.from}&to=${range.to}`;
    console.log(`Stahuji ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Nepodařilo se stáhnout data ${range.from}–${range.to}: ${res.status}`);
    }
    const json = await res.json();
    const filePath = path.join(OUTPUT_DIR, `spot_${range.from}_${range.to}.json`);
    await writeFile(filePath, JSON.stringify(json, null, 2), "utf-8");
    console.log(`Uloženo do ${filePath}`);
  }
}

function splitIntoYears(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const ranges: Array<{ from: string; to: string }> = [];
  let current = new Date(startDate);
  while (current <= endDate) {
    const from = current.toISOString().slice(0, 10);
    const yearEnd = new Date(current.getFullYear(), 11, 31);
    const toDate = yearEnd < endDate ? yearEnd : endDate;
    ranges.push({ from, to: toDate.toISOString().slice(0, 10) });
    current = new Date(toDate);
    current.setDate(current.getDate() + 1);
  }
  return ranges;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
