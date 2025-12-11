import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import * as XLSX from "xlsx";

vi.mock("../lib/spotPriceDb", () => {
  return {
    insertSolaxRows: vi.fn(),
    insertTigoRows: vi.fn(),
  };
});

import { insertSolaxRows, insertTigoRows } from "../lib/spotPriceDb";
import { importSolaxBuffer, importTigoCsv } from "../lib/importers";
import fs from "fs";

const solaxHeaders = [
  "Update time",
  "Total PV Power (W)",
  "Total Battery SOC (%)",
  "Total battery power (W)",
  "Grid power (W)",
];

describe("importers", () => {
  beforeEach(() => {
    vi.mocked(insertSolaxRows).mockClear();
    vi.mocked(insertTigoRows).mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("imports SolaX XLS rows and writes buckets", async () => {
    const records = [
      ["2024-01-01T10:00:00Z", 2000, 50, 100, -300],
      ["2024-01-01T10:15:00Z", 1500, 52, 50, 250],
    ];
    const buffer = buildXlsx(solaxHeaders, records);

    const summary = await importSolaxBuffer(buffer, "test.xlsx");

    expect(summary.processed).toBe(2);
    expect(insertSolaxRows).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(insertSolaxRows).mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      timestamp: "2024-01-01T10:00:00.000Z",
      pvOutput: expect.any(Number),
      gridImport: 0.075,
      gridFeedIn: 0,
    });
  });

  it("throws when SolaX file has no valid data", async () => {
    const buffer = buildXlsx(solaxHeaders, [["", "", "", "", ""]]);
    await expect(importSolaxBuffer(buffer, "empty.xlsx")).rejects.toThrow(/neobsahuje žádná platná/i);
  });

  it("imports Tigo CSV rows and writes buckets", async () => {
    const csv = [
      "Datetime,A1,B1,C1,D1",
      "2024-01-01T10:00:00Z,10,0,5,5",
      "2024-01-01T10:15:00Z,5,5,0,0",
    ].join("\n");
    const tmpPath = path.join(process.cwd(), "tmp_tigo.csv");
    fs.writeFileSync(tmpPath, csv);

    const summary = await importTigoCsv(tmpPath);

    expect(summary.processed).toBe(2);
    expect(insertTigoRows).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(insertTigoRows).mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      timestamp: "2024-01-01T10:00:00.000Z",
      total: expect.any(Number),
    });
  });

  it("throws when Tigo CSV has no valid data", async () => {
    const csv = ["Datetime,A1", " , "].join("\n");
    const tmpPath = path.join(process.cwd(), "tmp_tigo_empty.csv");
    fs.writeFileSync(tmpPath, csv);
    await expect(importTigoCsv(tmpPath)).rejects.toThrow(/neobsahuje žádná platná/i);
  });
});

function buildXlsx(headers: (string | number)[], rows: (string | number)[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
