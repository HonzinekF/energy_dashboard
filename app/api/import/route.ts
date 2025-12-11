import { NextResponse } from "next/server";
import path from "path";
import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { isAuthenticated } from "@/lib/auth";
import { insertMeasurements, type MeasurementRow } from "@/lib/spotPriceDb";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const HEADERS = {
  timestamp: "Datetime_15min",
  production: "Výroba FVE (kWh)",
  consumption: "Odběr + Dokup elektřiny z ČEZ (kWh)",
  optionalImport: "Dokup elektřiny z ČEZ (kWh)",
  optionalExport: "Dodávka do sítě (kWh)",
} as const;

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Očekávám multipart/form-data s polem file" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Soubor chybí" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Soubor je příliš velký (limit 10 MB)" }, { status: 413 });
  }

  const extension = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const rows =
      extension === ".csv"
        ? parseCsvFile(buffer)
        : extension === ".xls" || extension === ".xlsx"
          ? parseXlsxFile(buffer)
          : null;

    if (rows === null) {
      return NextResponse.json({ error: "Nepodporovaný formát. Použijte CSV nebo XLSX." }, { status: 415 });
    }

    if (!rows.length) {
      return NextResponse.json({ message: "Import proběhl, ale nebyla nalezena žádná data." });
    }

    insertMeasurements(dedupe(rows));

    return NextResponse.json({ imported: rows.length, message: "Import dokončen. Existující záznamy byly přepsány." });
  } catch (error) {
    const message =
      error instanceof MissingColumnsError
        ? error.message
        : "Soubor se nepodařilo načíst, zkontrolujte formát (CSV/XLSX).";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseCsvFile(buffer: Buffer): MeasurementRow[] {
  try {
    const text = buffer.toString("utf-8");
    const records = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      delimiter: detectDelimiter(text),
      trim: true,
    }) as Record<string, string>[];
    return mapRecords(records);
  } catch (error) {
    throw error;
  }
}

function parseXlsxFile(buffer: Buffer): MeasurementRow[] {
  const workbook = XLSX.read(buffer, { cellDates: false, type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error("Soubor neobsahuje žádný list.");
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  return mapRecords(rows);
}

function mapRecords(records: Record<string, string>[]): MeasurementRow[] {
  if (!records.length) {
    return [];
  }
  ensureRequiredColumns(records[0]);

  const hasOptionalImport = HEADERS.optionalImport in records[0];
  const hasOptionalExport = HEADERS.optionalExport in records[0];

  const result: MeasurementRow[] = [];

  records.forEach((record) => {
    const ts = toIso(record[HEADERS.timestamp]);
    if (!ts) return;

    const production = toNumber(record[HEADERS.production]);
    const combinedConsumption = toNumber(record[HEADERS.consumption]);
    const gridImport = hasOptionalImport ? toNumber(record[HEADERS.optionalImport]) : combinedConsumption;
    const gridExport = hasOptionalExport ? toNumber(record[HEADERS.optionalExport]) : undefined;

    if (production === 0 && combinedConsumption === 0) {
      return;
    }

    result.push({
      timestamp: ts,
      productionKwh: production,
      consumptionKwh: combinedConsumption,
      gridImportKwh: gridImport,
      gridExportKwh: gridExport,
    });
  });

  return result;
}

function ensureRequiredColumns(record: Record<string, string>) {
  const missing = [HEADERS.timestamp, HEADERS.production, HEADERS.consumption].filter((col) => !(col in record));
  if (missing.length) {
    throw new MissingColumnsError(`CSV soubor neobsahuje požadované sloupce: ${missing.join(", ")}`);
  }
}

function dedupe(rows: MeasurementRow[]) {
  const map = new Map<string, MeasurementRow>();
  rows.forEach((row) => {
    map.set(row.timestamp, row);
  });
  return Array.from(map.values());
}

function toIso(value: string | undefined) {
  if (!value) return null;
  const normalized = value.replace(" ", "T").replace(/\//g, "-");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: string | undefined) {
  if (value === undefined) return 0;
  const normalized = String(value).replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function detectDelimiter(text: string) {
  return text.includes(";") ? ";" : ",";
}

class MissingColumnsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingColumnsError";
  }
}
