import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { applyMigrations } from "../lib/schema";

const CSV_PATH = process.argv.includes("--file")
  ? path.resolve(process.argv[process.argv.indexOf("--file") + 1])
  : path.resolve("/Users/janfait/Energetika/JAN FAIT/energy_report.xlsx");
const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");

// Hlavičky z exportu, snadno upravitelné na jednom místě
const COL_TS = "Datetime_15min";
const COL_PROD = "Výroba FVE (kWh)";
const COL_IMPORT = "Dokup elektřiny z ČEZ (kWh)";
const COL_BATT_DISCHARGE = "Vybití baterie (kWh)";
const COL_TIGO = "Výroba Tigo DC (kWh)";
const COL_EXPORT = "Prodej elektřiny do ČEZ (kWh)";
const SYSTEM_ID = process.env.SYSTEM_ID ?? "default";
const USER_ID = process.env.USER_ID ?? "default";

type Row = {
  timestamp: string;
  production_kwh: number;
  consumption_kwh: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
};

function fnum(val: string | null | undefined) {
  if (!val) return 0;
  const normalized = String(val).replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Zdrojový soubor nenalezen: ${CSV_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`SQLite DB nenalezena: ${DB_PATH}`);
    process.exit(1);
  }

  const records = loadRecords(CSV_PATH);

  if (!records.length) {
    console.error("Soubor neobsahuje žádné řádky.");
    process.exit(1);
  }

  const missingColumns = [COL_TS, COL_PROD, COL_IMPORT, COL_EXPORT].filter((c) => !(c in records[0]));
  if (missingColumns.length) {
    console.error(`Soubor postrádá očekávané sloupce: ${missingColumns.join(", ")}`);
    process.exit(1);
  }

  const rows: Row[] = [];
  for (const row of records) {
    const tsRaw = (row[COL_TS] ?? "").trim();
    if (!tsRaw) continue;
    const ts = toIsoLocal(tsRaw);
    if (!ts) continue;
    const prod = fnum(row[COL_PROD]);
    const gridImport = fnum(row[COL_IMPORT]); // nákup ze sítě
    const gridExport = fnum(row[COL_EXPORT]);
    const batteryDischarge = fnum(row[COL_BATT_DISCHARGE]);
    const tigoProd = fnum(row[COL_TIGO]);

    const consumption = gridImport + batteryDischarge + tigoProd; // dle požadavku: dokup + vybití + výroba Tigo
    if (prod === 0 && consumption === 0 && gridExport === 0) continue;
    rows.push({
      timestamp: ts,
      production_kwh: prod,
      consumption_kwh: consumption,
      grid_import_kwh: gridImport,
      grid_export_kwh: gridExport,
      system_id: SYSTEM_ID,
      user_id: USER_ID,
    });
  }

  const db = new Database(DB_PATH);
  applyMigrations(db);

  const stmt = db.prepare(
    `
    INSERT INTO measurements (timestamp, production_kwh, consumption_kwh, grid_import_kwh, grid_export_kwh, system_id, user_id)
    VALUES (@timestamp, @production_kwh, @consumption_kwh, @grid_import_kwh, @grid_export_kwh, @system_id, @user_id)
    ON CONFLICT(system_id, timestamp) DO UPDATE SET
      production_kwh = COALESCE(excluded.production_kwh, production_kwh),
      consumption_kwh = COALESCE(excluded.consumption_kwh, consumption_kwh),
      grid_import_kwh = COALESCE(excluded.grid_import_kwh, grid_import_kwh),
      grid_export_kwh = COALESCE(excluded.grid_export_kwh, grid_export_kwh),
      system_id = COALESCE(excluded.system_id, system_id),
      user_id = COALESCE(excluded.user_id, user_id)
  `,
  );

  const insertMany = db.transaction((batch: Row[]) => {
    batch.forEach((r) => stmt.run(r));
  });
  insertMany(rows);

  console.log(`Import hotov. Zapsáno řádků: ${rows.length}`);
  db.close();
}

function toIsoLocal(value: string) {
  const normalized = value.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return null;
  return normalized;
}

main();

function loadRecords(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    const wb = XLSX.readFile(filePath, { cellDates: false, dense: true });
    const sheet = wb.Sheets["All_15min"] ?? wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false, blankrows: false });
  }
  const csvRaw = fs.readFileSync(filePath, "utf-8");
  return parse(csvRaw, { columns: true, delimiter: ";", skip_empty_lines: true }) as Record<string, string>[];
}
