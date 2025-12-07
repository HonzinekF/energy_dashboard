import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { insertMeasurements, type MeasurementRow } from "@/lib/spotPriceDb";
import { z } from "zod";
import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";
import path from "path";

export const runtime = "nodejs";
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

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
  const systemId = formData.get("systemId") as string | null;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Soubor chybí" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Soubor je příliš velký (limit 10 MB)" }, { status: 413 });
  }

  const extension = path.extname(file.name).toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let rows: MeasurementRow[] = [];
  try {
    if (extension === ".csv") {
      rows = parseCsvFile(buffer, systemId ?? undefined);
    } else if (extension === ".xls" || extension === ".xlsx") {
      rows = parseXlsFile(buffer, systemId ?? undefined);
    } else {
      return NextResponse.json({ error: "Nepodporovaný formát. Použijte CSV, XLS nebo XLSX." }, { status: 415 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chyba při čtení souboru" }, { status: 400 });
  }

  const deduped = dedupeMeasurements(rows);
  insertMeasurements(deduped);

  return NextResponse.json({ imported: deduped.length });
}

function parseCsvFile(buffer: Buffer, systemId?: string): MeasurementRow[] {
  const text = buffer.toString("utf-8");
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return records
    .map((record) => mapRecord(record, systemId))
    .filter((row): row is MeasurementRow => Boolean(row));
}

function parseXlsFile(buffer: Buffer, systemId?: string): MeasurementRow[] {
  const workbook = XLSX.read(buffer, { cellDates: false, type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
  const headerRow = rows[0];
  if (!Array.isArray(headerRow)) {
    throw new Error("Chybí hlavička v XLS/XLSX");
  }
  const headers = headerRow.map((cell, idx) => (cell ? String(cell).trim() : `col_${idx}`));
  const dataRows = rows.slice(1);
  return dataRows
    .map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = cells[idx] != null ? String(cells[idx]) : "";
      });
      return mapRecord(record, systemId);
    })
    .filter((row): row is MeasurementRow => Boolean(row));
}

const recordSchema = z.object({
  timestamp: z.string().min(1),
  production: z.string().optional(),
  consumption: z.string().optional(),
});

function mapRecord(record: Record<string, string>, systemId?: string): MeasurementRow | null {
  const timestampKey = findKey(record, ["timestamp", "time", "datetime"]);
  const prodKey = findKey(record, ["production", "vyroba", "generation"]);
  const consKey = findKey(record, ["consumption", "spotreba", "load"]);
  if (!timestampKey) {
    return null;
  }
  const parsed = recordSchema.safeParse({
    timestamp: record[timestampKey],
    production: prodKey ? record[prodKey] : undefined,
    consumption: consKey ? record[consKey] : undefined,
  });
  if (!parsed.success) return null;
  const tsIso = toIso(parsed.data.timestamp);
  if (!tsIso) return null;
  return {
    systemId,
    timestamp: tsIso,
    productionKwh: toNumber(parsed.data.production),
    consumptionKwh: toNumber(parsed.data.consumption),
  };
}

function findKey(record: Record<string, string>, candidates: string[]) {
  const entries = Object.keys(record).map((key) => ({ key, norm: key.toLowerCase() }));
  for (const candidate of candidates) {
    const found = entries.find((entry) => entry.norm.includes(candidate));
    if (found) return found.key;
  }
  return null;
}

function toIso(value: string) {
  const normalized = value.replace(" ", "T").replace(/\//g, "-");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toNumber(value?: string) {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function dedupeMeasurements(rows: MeasurementRow[]) {
  const map = new Map<string, MeasurementRow>();
  rows.forEach((row) => {
    const key = `${row.systemId ?? "default"}|${row.timestamp}`;
    map.set(key, row);
  });
  return Array.from(map.values());
}
