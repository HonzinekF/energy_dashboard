"use server";

import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { insertSolaxRows, insertTigoRows, SolaxRow, TigoRow } from "./spotPriceDb";

export type ImportSummary = {
  file: string;
  processed: number;
  dataset: "solax" | "tigo";
};

export async function importSolaxFile(filePath: string): Promise<ImportSummary> {
  const buffer = fs.readFileSync(filePath);
  return importSolaxBuffer(buffer, path.basename(filePath));
}

export async function importSolaxBuffer(buffer: Buffer, fileName: string): Promise<ImportSummary> {
  const workbook = XLSX.read(buffer, { cellDates: false, type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: null, raw: false });
  const headerIndex = rows.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => typeof cell === "string" && isTimestampHeader(cell)),
  );
  const effectiveHeaderIndex = headerIndex === -1 ? 0 : headerIndex;
  if (headerIndex === -1) {
    console.warn("SolaX XLS neobsahuje hlavičku s 'Update time', používám první řádek jako hlavičku.");
  }
  const headers = rows[effectiveHeaderIndex].map((cell, idx) => (cell ? String(cell).trim() : `col_${idx}`));
  const timestampHeader = findTimestampHeader(headers, rows);
  const dataRows = rows
    .slice(effectiveHeaderIndex + 1)
    .filter(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""),
    );

  const rawRows = dataRows
    .map<SolaxRow | null>((row) => {
      const record = headers.reduce<Record<string, unknown>>((acc, header, idx) => {
        acc[header] = row[idx];
        return acc;
      }, {});
      const timestampValue = resolveTimestampValue(record, timestampHeader);
      const timestamp = normalizeTimestamp(timestampValue);
      if (!timestamp) {
        return null;
      }
      const gridPower = toNumber(record["Grid power (W)"]) ?? 0;
      return {
        timestamp,
        pvOutput: toNumber(record["Total PV Power (W)"]),
        batterySoc: toNumber(record["Total Battery SOC (%)"]),
        batteryPower: toNumber(record["Total battery power (W)"]),
        gridFeedIn: gridPower > 0 ? gridPower : 0,
        gridImport: gridPower < 0 ? Math.abs(gridPower) : 0,
      } satisfies SolaxRow;
    })
    .filter((row): row is SolaxRow => row !== null);

  const intervalMinutes = detectIntervalMinutes(rawRows);
  const normalized = bucketizeSolaxRows(rawRows, intervalMinutes);
  if (!normalized.length) {
    throw new Error(`Soubor ${fileName} neobsahuje žádná platná SolaX data.`);
  }
  insertSolaxRows(normalized);
  return { file: fileName, processed: normalized.length, dataset: "solax" };
}

export async function importTigoCsv(filePath: string): Promise<ImportSummary> {
  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse<Record<string, string | number>>(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const rawRows = records
    .map<TigoRow | null>((record) => {
      const timestamp = normalizeTimestamp(record["Datetime"]);
      if (!timestamp) {
        return null;
      }
      const buckets: Record<"A" | "B" | "C" | "D", number> = { A: 0, B: 0, C: 0, D: 0 };
      Object.entries(record).forEach(([key, value]) => {
        if (!value) return;
        const match = key.match(/^([A-D])/i);
        if (!match) return;
        const letter = match[1].toUpperCase() as "A" | "B" | "C" | "D";
        buckets[letter] += Number(value) || 0;
      });
      const total = buckets.A + buckets.B + buckets.C + buckets.D;
      return {
        timestamp,
        stringA: buckets.A || undefined,
        stringB: buckets.B || undefined,
        stringC: buckets.C || undefined,
        stringD: buckets.D || undefined,
        total,
      } satisfies TigoRow;
    })
    .filter((row): row is TigoRow => row !== null);

  const intervalMinutes = 15;
  const normalized = bucketizeTigoRows(rawRows, intervalMinutes);
  if (!normalized.length) {
    throw new Error(`Soubor ${path.basename(filePath)} neobsahuje žádná platná Tigo data.`);
  }
  insertTigoRows(normalized);
  return { file: path.basename(filePath), processed: normalized.length, dataset: "tigo" };
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    const jsDate = new Date(Date.UTC(date.y, date.m - 1, date.d, date.H, date.M, Math.floor(date.S)));
    if (Number.isNaN(jsDate.getTime())) {
      return null;
    }
    const iso = jsDate.toISOString();
    return iso;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/\//g, "-").replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString();
  }
  return null;
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function findTimestampHeader(headers: string[], rows: (string | number | null)[][]) {
  const normalized = headers.map((header) => normalizeText(header));
  for (const candidate of TIMESTAMP_HEADER_CANDIDATES) {
    const idx = normalized.findIndex((header) => header.includes(candidate));
    if (idx !== -1) {
      return headers[idx];
    }
  }
  const firstRow = rows.find((row) => row.some(Boolean));
  if (firstRow && typeof firstRow[0] === "number") {
    return headers[0];
  }
  return null;
}

function detectIntervalMinutes(rows: SolaxRow[]) {
  if (rows.length < 2) {
    return 60;
  }
  const timestamps = rows
    .map((row) => Date.parse(row.timestamp))
    .filter((value) => Number.isFinite(value)) as number[];
  if (timestamps.length < 2) {
    return 60;
  }
  const deltas = [];
  for (let idx = 1; idx < timestamps.length; idx += 1) {
    const diff = Math.round((timestamps[idx] - timestamps[idx - 1]) / 60000);
    if (diff > 0) {
      deltas.push(diff);
    }
  }
  if (!deltas.length) {
    return 60;
  }
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  return median <= 20 ? 15 : 60;
}

function bucketizeSolaxRows(rows: SolaxRow[], intervalMinutes: number) {
  const map = new Map<string, SolaxRow>();
  for (const row of rows) {
    const bucket = bucketTimestamp(row.timestamp, intervalMinutes);
    const target = map.get(bucket);
    const nextRow: SolaxRow = {
      ...row,
      timestamp: bucket,
      intervalMinutes,
      source: row.source ?? "solax",
    };
    if (target) {
      target.pvOutput = sumValues(target.pvOutput, nextRow.pvOutput);
      target.batteryPower = sumValues(target.batteryPower, nextRow.batteryPower);
      target.gridFeedIn = sumValues(target.gridFeedIn, nextRow.gridFeedIn);
      target.gridImport = sumValues(target.gridImport, nextRow.gridImport);
      target.batterySoc = nextRow.batterySoc ?? target.batterySoc;
    } else {
      map.set(bucket, nextRow);
    }
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    pvOutput: toEnergy(row.pvOutput, row.intervalMinutes),
    batteryPower: toEnergy(row.batteryPower, row.intervalMinutes),
    gridFeedIn: toEnergy(row.gridFeedIn, row.intervalMinutes),
    gridImport: toEnergy(row.gridImport, row.intervalMinutes),
  }));
}

function bucketizeTigoRows(rows: TigoRow[], intervalMinutes: number) {
  const map = new Map<string, TigoRow>();
  for (const row of rows) {
    const bucket = bucketTimestamp(row.timestamp, intervalMinutes);
    const target = map.get(bucket);
    const nextRow: TigoRow = {
      ...row,
      timestamp: bucket,
      intervalMinutes,
    };
    if (target) {
      target.stringA = sumValues(target.stringA, nextRow.stringA);
      target.stringB = sumValues(target.stringB, nextRow.stringB);
      target.stringC = sumValues(target.stringC, nextRow.stringC);
      target.stringD = sumValues(target.stringD, nextRow.stringD);
      target.total = sumValues(target.total, nextRow.total);
    } else {
      map.set(bucket, nextRow);
    }
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    stringA: toEnergy(row.stringA, row.intervalMinutes),
    stringB: toEnergy(row.stringB, row.intervalMinutes),
    stringC: toEnergy(row.stringC, row.intervalMinutes),
    stringD: toEnergy(row.stringD, row.intervalMinutes),
    total: toEnergy(row.total, row.intervalMinutes),
  }));
}

function bucketTimestamp(timestamp: string, intervalMinutes: number) {
  const date = new Date(timestamp);
  const bucketMs = Math.floor(date.getTime() / (intervalMinutes * 60 * 1000)) * intervalMinutes * 60 * 1000;
  return new Date(bucketMs).toISOString();
}

function sumValues(a?: number, b?: number) {
  const first = a ?? 0;
  const second = b ?? 0;
  return first + second;
}

function toEnergy(value: number | undefined, intervalMinutes?: number) {
  if (value === undefined || intervalMinutes === undefined) {
    return undefined;
  }
  return (value * intervalMinutes) / 60 / 1000;
}

function resolveTimestampValue(record: Record<string, unknown>, column: string | null) {
  if (column && record[column] != null) {
    return record[column];
  }
  const values = Object.values(record).filter((value) => value !== null && value !== undefined && value !== "");
  const stringDate = values.find((value) => typeof value === "string" && looksLikeDateString(value));
  if (stringDate) {
    return stringDate;
  }
  const numericCandidate = values.find((value) => typeof value === "number");
  if (numericCandidate !== undefined) {
    return numericCandidate;
  }
  return values[0] ?? null;
}

const TIMESTAMP_HEADER_CANDIDATES = ["update time", "aktualizovat cas", "time", "datetime", "date/time", "date time"];

function looksLikeDateString(value: string) {
  const normalized = value.trim();
  return /\d{4}-\d{2}-\d{2}/.test(normalized) || /\d{2}\.\d{2}\.\d{4}/.test(normalized);
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTimestampHeader(value: string) {
  const normalized = normalizeText(value);
  return TIMESTAMP_HEADER_CANDIDATES.some((candidate) => normalized.includes(candidate));
}
