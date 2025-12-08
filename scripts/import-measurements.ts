import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

const CSV_PATH = process.argv.includes("--file")
  ? path.resolve(process.argv[process.argv.indexOf("--file") + 1])
  : path.resolve(process.cwd(), "energy_report_JAN_FAIT_ALL.csv");
const DB_PATH = process.env.ENERGY_DB_PATH ?? path.join(process.cwd(), "data", "energy.db");

const COL_TS = "Datetime_15min";
const COL_PROD = "Výroba FVE (kWh)";
const COL_CONS = "Odběr ČEZ (kWh)";
const COL_IMPORT = "Dokup elektřiny z ČEZ (kWh)";

function fnum(val: string | null | undefined) {
  if (!val) return 0;
  try {
    return Number(String(val).replace(",", "."));
  } catch {
    return 0;
  }
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV soubor nenalezen: ${CSV_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error(`SQLite DB nenalezena: ${DB_PATH}`);
    process.exit(1);
  }

  const csvRaw = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(csvRaw, { columns: true, delimiter: ";", skip_empty_lines: true }) as Record<string, string>[];

  const missingColumns = [COL_TS, COL_PROD, COL_CONS, COL_IMPORT].filter((c) => !(c in records[0]));
  if (missingColumns.length) {
    console.error(`CSV postrádá očekávané sloupce: ${missingColumns.join(", ")}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.exec("DROP TABLE IF EXISTS measurements");
  db.exec(`
    CREATE TABLE IF NOT EXISTS measurements (
      timestamp TEXT PRIMARY KEY,
      production_kwh REAL,
      consumption_kwh REAL
    )
  `);

  const stmt = db.prepare(
    "INSERT OR REPLACE INTO measurements (timestamp, production_kwh, consumption_kwh) VALUES (@timestamp, @production_kwh, @consumption_kwh)",
  );
  const rows: Array<{ timestamp: string; production_kwh: number; consumption_kwh: number }> = [];

  for (const row of records) {
    const tsRaw = (row[COL_TS] ?? "").trim();
    if (!tsRaw) continue;
    const ts = tsRaw.replace(" ", "T"); // necháme místní čas, Next ho zobrazí jako ISO bez Z
    const prod = fnum(row[COL_PROD]);
    const cons = fnum(row[COL_CONS]);
    const imp = fnum(row[COL_IMPORT]);
    const consumption = cons + imp;
    if (prod === 0 && consumption === 0) continue;
    rows.push({ timestamp: ts, production_kwh: prod, consumption_kwh: consumption });
  }

  const insertMany = db.transaction((batch: typeof rows) => {
    batch.forEach((r) => stmt.run(r));
  });
  insertMany(rows);

  console.log(`Import hotov. Zapsáno řádků: ${rows.length}`);
  db.close();
}

main();
